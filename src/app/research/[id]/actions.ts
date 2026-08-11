"use server";

import { revalidatePath } from "next/cache";
import {
  createQuestion,
  createSupabaseClient,
  requireText,
  updateQuestionStatus,
} from "@/lib/research";

const QUESTION_MAX_LENGTH = 1000;

export type AskQuestionState = {
  fieldErrors: { question?: string };
  formError: string | null;
  success: boolean;
};

export async function askQuestionAction(
  researchId: string,
  _prevState: AskQuestionState,
  formData: FormData
): Promise<AskQuestionState> {
  const question = (formData.get("question") as string | null)?.trim() ?? "";

  const questionError = requireText(
    question,
    "Question",
    QUESTION_MAX_LENGTH
  );
  if (questionError) {
    return {
      fieldErrors: { question: questionError.message },
      formError: null,
      success: false,
    };
  }

  const supabase = await createSupabaseClient();
  const result = await createQuestion(supabase, researchId, { question });

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

  revalidatePath(`/research/${researchId}`);
  return { fieldErrors: {}, formError: null, success: true };
}

export type RetryAnswerState = {
  formError: string | null;
};

export async function retryAnswerAction(
  researchId: string,
  _prevState: RetryAnswerState,
  formData: FormData
): Promise<RetryAnswerState> {
  const questionId =
    (formData.get("questionId") as string | null)?.trim() ?? "";

  const supabase = await createSupabaseClient();
  const result = await updateQuestionStatus(supabase, questionId, "pending");

  if (result.error) {
    if (result.error.code === "UNAUTHORIZED") {
      return { formError: "You need to be signed in to do that." };
    }
    if (result.error.code === "NOT_FOUND") {
      return { formError: "This question no longer exists." };
    }
    return { formError: "We couldn't retry this answer. Please try again." };
  }

  revalidatePath(`/research/${researchId}`);
  return { formError: null };
}
