"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseClient, createResearch } from "@/lib/research";
import { optionalText, requireText } from "@/lib/research";

const TITLE_MAX_LENGTH = 200;

export type CreateResearchState = {
  fieldErrors: { title?: string; description?: string };
  formError: string | null;
};

export async function createResearchAction(
  _prevState: CreateResearchState,
  formData: FormData,
): Promise<CreateResearchState> {
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim();

  const fieldErrors: CreateResearchState["fieldErrors"] = {};

  const titleError = requireText(title, "Title", TITLE_MAX_LENGTH);
  if (titleError) {
    fieldErrors.title = titleError.message;
  }

  const descriptionError = optionalText(description, "Description");
  if (descriptionError) {
    fieldErrors.description = descriptionError.message;
  }

  if (titleError || descriptionError) {
    return { fieldErrors, formError: null };
  }

  const supabase = await createSupabaseClient();
  const result = await createResearch(supabase, {
    title,
    description: description || undefined,
  });

  if (result.error) {
    if (result.error.code === "UNAUTHORIZED") {
      return {
        fieldErrors: {},
        formError: "You need to be signed in to do that.",
      };
    }
    return {
      fieldErrors: {},
      formError: "We couldn't create your research. Please try again.",
    };
  }

  const researchId = result.data!.id;

  revalidatePath("/");
  revalidatePath("/research");
  redirect(`/research/${researchId}`);
}
