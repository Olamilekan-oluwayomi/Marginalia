-- Smart-mode relevance fallback.
--
-- Adds a fallback-reason column to answers so the answer can record why web
-- research was used instead of an attached document: the smart-mode relevance
-- check judged the document unlikely to answer the question. The reason is
-- rendered as a note next to the answer so the user is told why the fallback
-- happened. It is null for every other answer.
--
-- Design decisions:
--   * `fallback_reason` is nullable text; only smart-mode fallback answers set
--     it.
--   * The new column is covered by the existing table grants and RLS update
--     policy, so no additional grants or policies are needed.

alter table public.answers
  add column fallback_reason text;

comment on column public.answers.fallback_reason is
  'User-facing note set when smart mode fell back to web research because the attached document was judged not relevant.';
