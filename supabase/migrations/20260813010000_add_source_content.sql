-- Phase 7.7: Source content.
--
-- Adds a body-content column to sources so pasted article/website text can be
-- stored and later surfaced as evidence during answer generation, making
-- sources citable alongside documents.
--
-- Design decisions:
--   * `content` is nullable text; a source only becomes citable once it has
--     body text, mirroring the documents.content behavior.
--   * The new column is covered by the existing table grants and RLS update
--     policy, so no additional grants or policies are needed.

alter table public.sources
  add column content text;

comment on column public.sources.content is
  'Body text used as evidence for answer generation. Null until content is attached.';
