-- Adds include_web to research_questions so a question records whether web
-- research was requested. Generation reads this from the row, so a retry
-- reproduces the original request (web or local-only) without the caller
-- having to remember it.

alter table public.research_questions
  add column include_web boolean not null default false;
