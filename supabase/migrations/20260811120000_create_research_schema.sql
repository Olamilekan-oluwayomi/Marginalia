-- Phase 5.3: Research database schema and row level security.
--
-- Creates six tables: research, research_questions, documents, sources,
-- answers, citations.
--
-- Design decisions:
--   * Every reference TO profiles is ON DELETE RESTRICT so research data can
--     never disappear because of an unrelated profile/account operation.
--   * Every reference TO research (and down the research subtree) cascades so
--     deleting a research workspace cleanly removes its dependent records.
--   * Database-level triggers enforce that child rows reference the research
--     owned by the stored user_id (and, for answers, that question_id matches
--     research_id), independent of any application logic.
--   * Ownership is enforced through RLS policies keyed on auth.uid(); the
--     user_id values supplied by clients are never trusted.
--   * The existing profiles table and its auth trigger are NOT modified.

-- ---------------------------------------------------------------------------
-- 1. research
-- ---------------------------------------------------------------------------

create table public.research (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_title_not_blank check (length(trim(title)) > 0),
  constraint research_title_length check (char_length(title) <= 200)
);

create index research_user_id_idx on public.research (user_id);
create index research_updated_at_idx on public.research (updated_at);

-- ---------------------------------------------------------------------------
-- 2. research_questions
-- ---------------------------------------------------------------------------

create table public.research_questions (
  id uuid primary key default gen_random_uuid(),
  research_id uuid not null references public.research (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  question text not null,
  answer_status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint research_questions_question_not_blank check (length(trim(question)) > 0),
  constraint research_questions_question_length check (char_length(question) <= 1000),
  constraint research_questions_answer_status_check
    check (answer_status in ('pending', 'generating', 'complete', 'failed'))
);

create index research_questions_research_id_idx on public.research_questions (research_id);
create index research_questions_user_id_idx on public.research_questions (user_id);
create index research_questions_created_at_idx on public.research_questions (created_at);

-- ---------------------------------------------------------------------------
-- 3. documents
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  research_id uuid not null references public.research (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  file_name text not null,
  file_path text not null,
  mime_type text,
  file_size bigint,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_status_check
    check (status in ('pending', 'processing', 'ready', 'failed'))
);

create index documents_research_id_idx on public.documents (research_id);
create index documents_user_id_idx on public.documents (user_id);
create index documents_created_at_idx on public.documents (created_at);

-- ---------------------------------------------------------------------------
-- 4. sources
-- ---------------------------------------------------------------------------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  research_id uuid not null references public.research (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  url text,
  publisher text,
  retrieved_at timestamptz,
  created_at timestamptz not null default now()
);

create index sources_research_id_idx on public.sources (research_id);
create index sources_user_id_idx on public.sources (user_id);

-- ---------------------------------------------------------------------------
-- 5. answers
-- ---------------------------------------------------------------------------

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.research_questions (id) on delete cascade,
  research_id uuid not null references public.research (id) on delete cascade,
  content text not null,
  model text,
  created_at timestamptz not null default now()
);

create index answers_question_id_idx on public.answers (question_id);
create index answers_research_id_idx on public.answers (research_id);
create index answers_created_at_idx on public.answers (created_at);

-- ---------------------------------------------------------------------------
-- 6. citations
-- ---------------------------------------------------------------------------

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  source_id uuid references public.sources (id) on delete cascade,
  citation_number integer not null,
  excerpt text,
  created_at timestamptz not null default now(),
  constraint citations_exactly_one_evidence check ((document_id is null) <> (source_id is null)),
  constraint citations_citation_number_positive check (citation_number > 0)
);

create index citations_answer_id_idx on public.citations (answer_id);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- The authenticated role needs base DML privileges; RLS then filters every
-- access down to the authenticated user's own research.

grant select, insert, update, delete
  on public.research, public.research_questions, public.documents,
     public.sources, public.answers, public.citations
  to authenticated;

-- ---------------------------------------------------------------------------
-- Ownership triggers
-- ---------------------------------------------------------------------------
-- research_questions/documents/sources carry both research_id and user_id.
-- These triggers guarantee user_id always matches the owner of the referenced
-- research, no matter which client or role performs the write.

create or replace function public.enforce_child_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  research_owner uuid;
begin
  select user_id
    into research_owner
    from public.research
   where id = new.research_id;

  if research_owner is null then
    raise exception 'research % does not exist', new.research_id
      using errcode = '23503';
  end if;

  if research_owner is distinct from new.user_id then
    raise exception 'user_id % does not match the owner % of research %',
      new.user_id, research_owner, new.research_id
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_child_ownership on public.research_questions;
create trigger enforce_child_ownership
  before insert or update on public.research_questions
  for each row execute procedure public.enforce_child_ownership();

drop trigger if exists enforce_child_ownership on public.documents;
create trigger enforce_child_ownership
  before insert or update on public.documents
  for each row execute procedure public.enforce_child_ownership();

drop trigger if exists enforce_child_ownership on public.sources;
create trigger enforce_child_ownership
  before insert or update on public.sources
  for each row execute procedure public.enforce_child_ownership();

-- answers carries both question_id and research_id; this trigger guarantees
-- the question always belongs to the same research the answer is attached to.

create or replace function public.enforce_answer_research_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  question_research uuid;
begin
  select research_id
    into question_research
    from public.research_questions
   where id = new.question_id;

  if question_research is null then
    raise exception 'question % does not exist', new.question_id
      using errcode = '23503';
  end if;

  if question_research is distinct from new.research_id then
    raise exception 'question % belongs to research %, not research %',
      new.question_id, question_research, new.research_id
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_answer_research_match on public.answers;
create trigger enforce_answer_research_match
  before insert or update on public.answers
  for each row execute procedure public.enforce_answer_research_match();

-- ---------------------------------------------------------------------------
-- updated_at triggers (research, documents)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.research;
create trigger set_updated_at
  before update on public.research
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at on public.documents;
create trigger set_updated_at
  before update on public.documents
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.research enable row level security;
alter table public.research_questions enable row level security;
alter table public.documents enable row level security;
alter table public.sources enable row level security;
alter table public.answers enable row level security;
alter table public.citations enable row level security;

-- research ------------------------------------------------------------------

create policy "research_select_own"
  on public.research for select
  using (user_id = auth.uid());

create policy "research_insert_own"
  on public.research for insert
  with check (user_id = auth.uid());

create policy "research_update_own"
  on public.research for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "research_delete_own"
  on public.research for delete
  using (user_id = auth.uid());

-- research_questions ---------------------------------------------------------

create policy "research_questions_select_own"
  on public.research_questions for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

create policy "research_questions_insert_own"
  on public.research_questions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

create policy "research_questions_update_own"
  on public.research_questions for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

create policy "research_questions_delete_own"
  on public.research_questions for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

-- documents ------------------------------------------------------------------

create policy "documents_select_own"
  on public.documents for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

create policy "documents_insert_own"
  on public.documents for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

create policy "documents_update_own"
  on public.documents for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

create policy "documents_delete_own"
  on public.documents for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

-- sources --------------------------------------------------------------------

create policy "sources_select_own"
  on public.sources for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

create policy "sources_insert_own"
  on public.sources for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

create policy "sources_update_own"
  on public.sources for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

create policy "sources_delete_own"
  on public.sources for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

-- answers --------------------------------------------------------------------

create policy "answers_select_own"
  on public.answers for select
  using (
    exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

create policy "answers_insert_own"
  on public.answers for insert
  with check (
    exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
    and exists (
      select 1 from public.research_questions rq
      where rq.id = question_id and rq.research_id = research_id
    )
  );

create policy "answers_update_own"
  on public.answers for update
  using (
    exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
    and exists (
      select 1 from public.research_questions rq
      where rq.id = question_id and rq.research_id = research_id
    )
  );

create policy "answers_delete_own"
  on public.answers for delete
  using (
    exists (
      select 1 from public.research r
      where r.id = research_id and r.user_id = auth.uid()
    )
  );

-- citations ------------------------------------------------------------------

create policy "citations_select_own"
  on public.citations for select
  using (
    exists (
      select 1
      from public.answers a
      join public.research r on r.id = a.research_id
      where a.id = answer_id and r.user_id = auth.uid()
    )
  );

create policy "citations_insert_own"
  on public.citations for insert
  with check (
    exists (
      select 1
      from public.answers a
      join public.research r on r.id = a.research_id
      where a.id = answer_id and r.user_id = auth.uid()
    )
    and (
      document_id is null
      or exists (
        select 1 from public.documents d
        where d.id = document_id
          and d.research_id = (select research_id from public.answers where id = answer_id)
      )
    )
    and (
      source_id is null
      or exists (
        select 1 from public.sources s
        where s.id = source_id
          and s.research_id = (select research_id from public.answers where id = answer_id)
      )
    )
  );

create policy "citations_update_own"
  on public.citations for update
  using (
    exists (
      select 1
      from public.answers a
      join public.research r on r.id = a.research_id
      where a.id = answer_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.answers a
      join public.research r on r.id = a.research_id
      where a.id = answer_id and r.user_id = auth.uid()
    )
    and (
      document_id is null
      or exists (
        select 1 from public.documents d
        where d.id = document_id
          and d.research_id = (select research_id from public.answers where id = answer_id)
      )
    )
    and (
      source_id is null
      or exists (
        select 1 from public.sources s
        where s.id = source_id
          and s.research_id = (select research_id from public.answers where id = answer_id)
      )
    )
  );

create policy "citations_delete_own"
  on public.citations for delete
  using (
    exists (
      select 1
      from public.answers a
      join public.research r on r.id = a.research_id
      where a.id = answer_id and r.user_id = auth.uid()
    )
  );
