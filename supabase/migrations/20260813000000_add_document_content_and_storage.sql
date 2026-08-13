-- Phase 7.6: Document content ingestion.
--
-- Adds a body-content column to documents so extracted text can be stored and
-- later surfaced as evidence during answer generation, and creates a private
-- storage bucket for the uploaded source files.
--
-- Design decisions:
--   * `content` is nullable text. A document only becomes citable once it has
--     body text, so the processing status flow (pending -> processing ->
--     ready/failed) tells the UI whether extraction succeeded.
--   * The `documents` bucket is private. Every object lives under a
--     `{user_id}/{document_id}/...` prefix and the storage RLS policies scope
--     all access to the authenticated user's own prefix, mirroring the table
--     RLS: ownership is derived from auth.uid(), never from client paths.
--   * The new column is covered by the existing table grants and RLS update
--     policy, so no additional table grants or policies are needed.

-- 1. Body content column ---------------------------------------------------

alter table public.documents
  add column content text;

comment on column public.documents.content is
  'Extracted body text used as evidence for answer generation. Null until the document has been processed.';

-- 2. Private storage bucket for uploaded source files ----------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do nothing;

create policy "documents_storage_select_own"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents_storage_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents_storage_update_own"
  on storage.objects for update
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents_storage_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
