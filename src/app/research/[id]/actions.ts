"use server";

import { revalidatePath } from "next/cache";
import { runAfterResponse } from "@/lib/research/background";
import {
  createQuestion,
  createSource,
  createSupabaseClient,
  deleteSource,
  generateAnswer,
  getQuestionById,
  getRecentUserQuestionCount,
  getSourceById,
  optionalDate,
  optionalText,
  requireText,
  tryTransitionQuestionStatus,
  type Supabase,
} from "@/lib/research";
import { describeError } from "@/lib/research/errors";

const QUESTION_MAX_LENGTH = 1000;
const TITLE_MAX_LENGTH = 300;
const URL_MAX_LENGTH = 500;
const PUBLISHER_MAX_LENGTH = 200;
const CONTENT_MAX_LENGTH = 200_000;

/**
 * Application-level guard: at most this many questions may be asked within the
 * window below, counted across ALL of the user's research workspaces. A burst
 * of questions would otherwise each make a full provider round trip.
 */
const QUESTION_WINDOW_MINUTES = 5;
const QUESTION_WINDOW_LIMIT = 20;

/**
 * Runs answer generation after the current response has been sent, then
 * revalidates the workspace route so the next polled render shows the
 * terminal state. The action itself returns immediately; generation failures
 * surface through the question status (`failed`) rather than the action's
 * return value, so the UI can offer a retry. The task is guarded so an
 * unexpected throw cannot produce an unhandled rejection; the question is
 * still marked `failed` by `generateAnswer`, and revalidation always runs so
 * the polled render reflects the terminal state.
 */
function scheduleGeneration(
  supabase: Supabase,
  researchId: string,
  questionId: string,
): void {
  runAfterResponse(async () => {
    try {
      await generateAnswer(supabase, { questionId, researchId });
    } catch (error) {
      console.error(
        "[research-data] background generation threw unexpectedly:",
        describeError(error),
      );
    } finally {
      revalidatePath(`/research/${researchId}`);
    }
  });
}

export type AskQuestionState = {
  fieldErrors: { question?: string };
  formError: string | null;
  success: boolean;
};

export async function askQuestionAction(
  researchId: string,
  _prevState: AskQuestionState,
  formData: FormData,
): Promise<AskQuestionState> {
  const question = (formData.get("question") as string | null)?.trim() ?? "";
  const includeWeb = formData.get("includeWeb") === "on";

  const questionError = requireText(question, "Question", QUESTION_MAX_LENGTH);
  if (questionError) {
    return {
      fieldErrors: { question: questionError.message },
      formError: null,
      success: false,
    };
  }

  const supabase = await createSupabaseClient();

  const recentResult = await getRecentUserQuestionCount(
    supabase,
    QUESTION_WINDOW_MINUTES,
  );
  if (recentResult.error) {
    if (recentResult.error.code === "UNAUTHORIZED") {
      return {
        fieldErrors: {},
        formError: "You need to be signed in to do that.",
        success: false,
      };
    }
  } else if (recentResult.data >= QUESTION_WINDOW_LIMIT) {
    return {
      fieldErrors: {},
      formError:
        "You've asked a lot of questions recently. Wait a bit and try again.",
      success: false,
    };
  }

  const result = await createQuestion(supabase, researchId, {
    question,
    includeWeb,
  });

  if (result.error) {
    if (result.error.code === "UNAUTHORIZED") {
      return {
        fieldErrors: {},
        formError: "You need to be signed in to do that.",
        success: false,
      };
    }
    return {
      fieldErrors: {},
      formError: "We couldn't add your question. Please try again.",
      success: false,
    };
  }

  const questionId = result.data!.id;

  scheduleGeneration(supabase, researchId, questionId);

  revalidatePath(`/research/${researchId}`);
  return {
    fieldErrors: {},
    formError: null,
    success: true,
  };
}

export type RetryAnswerState = {
  formError: string | null;
};

export async function retryAnswerAction(
  researchId: string,
  _prevState: RetryAnswerState,
  formData: FormData,
): Promise<RetryAnswerState> {
  const questionId =
    (formData.get("questionId") as string | null)?.trim() ?? "";

  const supabase = await createSupabaseClient();

  // Verify the question exists and belongs to this research *before* touching
  // its status. The lookup is RLS-scoped, so another user's question resolves
  // to NOT_FOUND; without this check a mismatched research id would leave the
  // question stuck in `pending` when generateAnswer later rejects it.
  const questionResult = await getQuestionById(supabase, questionId);
  if (questionResult.error) {
    if (questionResult.error.code === "UNAUTHORIZED") {
      return { formError: "You need to be signed in to do that." };
    }
    return { formError: "This question no longer exists." };
  }
  if (!questionResult.data) {
    return { formError: "This question no longer exists." };
  }
  if (questionResult.data.research_id !== researchId) {
    return { formError: "This question does not belong to this research." };
  }

  // Only a `failed` question may be retried. The guarded transition also
  // stops two concurrent retries from both resetting the same question.
  const result = await tryTransitionQuestionStatus(
    supabase,
    questionId,
    ["failed"],
    "pending",
  );

  if (result.error) {
    if (result.error.code === "UNAUTHORIZED") {
      return { formError: "You need to be signed in to do that." };
    }
    if (result.error.code === "NOT_FOUND") {
      return { formError: "This question no longer exists." };
    }
    return { formError: "We couldn't retry this answer. Please try again." };
  }

  if (!result.data.transitioned) {
    return {
      formError:
        "This question isn't ready to retry. Refresh the page to see its current state.",
    };
  }

  scheduleGeneration(supabase, researchId, questionId);

  revalidatePath(`/research/${researchId}`);
  return { formError: null };
}

export type RecoverAnswerState = {
  formError: string | null;
};

/**
 * Recovers a question that appears stuck. A question left in `pending` or
 * `generating` for longer than the render-time staleness threshold means the
 * background generation that owned the status transition died (for example
 * the platform killed the serverless function mid-task, or the process was
 * interrupted), so a healthy run never lands on `complete` or `failed` in
 * time. This moves it back to `failed` through a guarded transition so the
 * user can retry it.
 *
 * The transition is atomic: if the question genuinely is still generating,
 * only one caller wins, and a later real completion simply marks the question
 * complete again (the latest answer wins). Ownership is enforced by RLS.
 */
export async function recoverStuckAnswerAction(
  researchId: string,
  _prevState: RecoverAnswerState,
  formData: FormData,
): Promise<RecoverAnswerState> {
  const questionId =
    (formData.get("questionId") as string | null)?.trim() ?? "";

  const supabase = await createSupabaseClient();
  const result = await tryTransitionQuestionStatus(
    supabase,
    questionId,
    ["pending", "generating"],
    "failed",
  );

  if (result.error) {
    if (result.error.code === "UNAUTHORIZED") {
      return { formError: "You need to be signed in to do that." };
    }
    return {
      formError: "We couldn't reset this question. Please try again.",
    };
  }

  revalidatePath(`/research/${researchId}`);
  return {
    formError: result.data.transitioned
      ? null
      : "This question isn't waiting anymore. Refresh the page to see its current state.",
  };
}

export type AddSourceState = {
  fieldErrors: {
    title?: string;
    url?: string;
    publisher?: string;
    retrievedAt?: string;
    content?: string;
  };
  formError: string | null;
  success: boolean;
};

/**
 * Adds a source to a research workspace. Ownership is enforced by the
 * RLS-scoped data layer; the `content` field is optional body text that makes
 * the source citable in generated answers.
 */
export async function addSourceAction(
  researchId: string,
  _prevState: AddSourceState,
  formData: FormData,
): Promise<AddSourceState> {
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const url = (formData.get("url") as string | null)?.trim() || undefined;
  const publisher =
    (formData.get("publisher") as string | null)?.trim() || undefined;
  const retrievedAt =
    (formData.get("retrievedAt") as string | null)?.trim() || undefined;
  const content =
    (formData.get("content") as string | null)?.trim() || undefined;

  const fieldErrors: AddSourceState["fieldErrors"] = {};

  const titleError = requireText(title, "Title", TITLE_MAX_LENGTH);
  if (titleError) {
    fieldErrors.title = titleError.message;
  }
  const urlError = optionalText(url, "URL", URL_MAX_LENGTH);
  if (urlError) {
    fieldErrors.url = urlError.message;
  }
  const publisherError = optionalText(
    publisher,
    "Publisher",
    PUBLISHER_MAX_LENGTH,
  );
  if (publisherError) {
    fieldErrors.publisher = publisherError.message;
  }
  const dateError = optionalDate(retrievedAt, "Retrieved at");
  if (dateError) {
    fieldErrors.retrievedAt = dateError.message;
  }
  const contentError = optionalText(content, "Content", CONTENT_MAX_LENGTH);
  if (contentError) {
    fieldErrors.content = contentError.message;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, formError: null, success: false };
  }

  const supabase = await createSupabaseClient();
  const result = await createSource(supabase, researchId, {
    title,
    url,
    publisher,
    retrieved_at: retrievedAt,
    content,
  });

  if (result.error) {
    if (result.error.code === "UNAUTHORIZED") {
      return {
        fieldErrors: {},
        formError: "You need to be signed in to do that.",
        success: false,
      };
    }
    if (result.error.code === "VALIDATION_ERROR") {
      return {
        fieldErrors: {},
        formError: result.error.message,
        success: false,
      };
    }
    return {
      fieldErrors: {},
      formError: "We couldn't add this source. Please try again.",
      success: false,
    };
  }

  revalidatePath(`/research/${researchId}`);
  return { fieldErrors: {}, formError: null, success: true };
}

export type DeleteSourceState = {
  error: string | null;
};

/**
 * Deletes a source from a research workspace. The source is read first
 * (RLS-scoped, so another user's source resolves to NOT_FOUND) to resolve the
 * research workspace for revalidation; the data layer then removes the row
 * under the existing security model. Citations referencing the source are
 * cleaned up by the schema's referential rules.
 */
export async function deleteSourceAction(
  _prevState: DeleteSourceState,
  formData: FormData,
): Promise<DeleteSourceState> {
  const sourceId = (formData.get("sourceId") as string | null)?.trim() ?? "";

  const supabase = await createSupabaseClient();

  const sourceResult = await getSourceById(supabase, sourceId);
  if (sourceResult.error || !sourceResult.data) {
    return {
      error:
        sourceResult.error?.code === "UNAUTHORIZED"
          ? "You need to be signed in to do that."
          : "This source no longer exists.",
    };
  }
  const researchId = sourceResult.data.research_id;

  const result = await deleteSource(supabase, sourceId);
  if (result.error) {
    return { error: "We couldn't delete this source. Please try again." };
  }

  revalidatePath(`/research/${researchId}`);
  return { error: null };
}
