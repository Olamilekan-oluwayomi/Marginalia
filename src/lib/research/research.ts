import type {
  CreateResearchInput,
  ResearchRow,
  Supabase,
  UpdateResearchInput,
} from "./types";
import {
  fail,
  notFound,
  ok,
  toAppError,
  validationError,
  type AppResult,
} from "./errors";
import { requireUser } from "./session";
import { optionalText, requireText, requireUuid } from "./validation";

const TITLE_MAX_LENGTH = 200;

function validateCreateInput(
  input: CreateResearchInput
): string | null {
  const titleError = requireText(input.title, "Title", TITLE_MAX_LENGTH);
  if (titleError) {
    return titleError.message;
  }
  const descriptionError = optionalText(input.description, "Description");
  if (descriptionError) {
    return descriptionError.message;
  }
  return null;
}

export async function getResearchList(
  supabase: Supabase
): Promise<AppResult<ResearchRow[]>> {
  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, []);
  }

  const { data, error } = await supabase
    .from("research")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return fail(toAppError(error), []);
  }

  return ok(data ?? []);
}

export type ResearchListWithCounts = ResearchRow & {
  document_count: number;
};

/**
 * The research list plus a per-item document count for dashboard-style
 * displays. Counts come from a single grouped query over the user's documents
 * (RLS-scoped) and are tallied in memory — never an N+1 query from the page.
 */
export async function getResearchListWithCounts(
  supabase: Supabase
): Promise<AppResult<ResearchListWithCounts[]>> {
  const list = await getResearchList(supabase);
  if (list.error) {
    return fail(list.error, []);
  }
  if (list.data.length === 0) {
    return ok([]);
  }

  const ids = list.data.map((item) => item.id);

  const { data: rows, error } = await supabase
    .from("documents")
    .select("research_id")
    .in("research_id", ids);

  if (error) {
    return fail(toAppError(error), []);
  }

  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    counts.set(row.research_id, (counts.get(row.research_id) ?? 0) + 1);
  }

  return ok(
    list.data.map((item) => ({
      ...item,
      document_count: counts.get(item.id) ?? 0,
    }))
  );
}

export async function getResearchById(
  supabase: Supabase,
  researchId: string
): Promise<AppResult<ResearchRow | null>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("research")
    .select("*")
    .eq("id", researchId)
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Research not found."), null);
  }

  return ok(data);
}

export async function createResearch(
  supabase: Supabase,
  input: CreateResearchInput
): Promise<AppResult<ResearchRow | null>> {
  const validationMessage = validateCreateInput(input);
  if (validationMessage) {
    return fail(validationError(validationMessage), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("research")
    .insert({
      user_id: session.user.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    return fail(toAppError(error), null);
  }

  return ok(data);
}

export async function updateResearch(
  supabase: Supabase,
  researchId: string,
  input: UpdateResearchInput
): Promise<AppResult<ResearchRow | null>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const patch: { title?: string; description?: string | null } = {};

  if (input.title !== undefined) {
    const titleError = requireText(input.title, "Title", TITLE_MAX_LENGTH);
    if (titleError) {
      return fail(validationError(titleError.message), null);
    }
    patch.title = input.title.trim();
  }

  if (input.description !== undefined) {
    const descriptionError = optionalText(
      input.description,
      "Description"
    );
    if (descriptionError) {
      return fail(validationError(descriptionError.message), null);
    }
    patch.description =
      input.description === null
        ? null
        : input.description.trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    return fail(validationError("Nothing to update."), null);
  }

  const { data, error } = await supabase
    .from("research")
    .update(patch)
    .eq("id", researchId)
    .select("*")
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Research not found."), null);
  }

  return ok(data);
}

export async function deleteResearch(
  supabase: Supabase,
  researchId: string
): Promise<AppResult<null>> {
  const idError = requireUuid(researchId, "Research id");
  if (idError) {
    return fail(validationError(idError.message), null);
  }

  const session = await requireUser(supabase);
  if ("error" in session) {
    return fail(session.error, null);
  }

  const { data, error } = await supabase
    .from("research")
    .delete()
    .eq("id", researchId)
    .select("id")
    .maybeSingle();

  if (error) {
    return fail(toAppError(error), null);
  }
  if (!data) {
    return fail(notFound("Research not found."), null);
  }

  return ok(null);
}
