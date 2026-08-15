-- Answer source mode.
--
-- Records which search mode an answer was generated from so the workspace can
-- render the right citation affordances: `document` (uploaded documents only),
-- `web` (web search results / pasted sources), or `both`. Generation derives
-- the value from the research context actually provided at generation time and
-- writes it with every new answer; existing rows default to `document`.
--
-- Design decisions:
--   * `source_mode` is a checked non-null text column with a `document`
--     default, so legacy answers remain valid and every new answer carries a
--     value.
--   * The new column is covered by the existing table grants and RLS update
--     policy, so no additional grants or policies are needed.

alter table public.answers
  add column source_mode text not null default 'document';

alter table public.answers
  add constraint answers_source_mode_check
    check (source_mode in ('document', 'web', 'both'));

comment on column public.answers.source_mode is
  'The search mode the answer was generated from: document (uploaded documents only), web (web search results or pasted sources), or both.';
