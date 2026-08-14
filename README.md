# Marginalia — AI Research Assistant

A private, AI-assisted research workspace. Organize papers into research
spaces, upload PDFs and collect web sources, then ask questions that are
answered from your own documents — with every claim footnoted to the exact
evidence it draws on.

**Research, read, connect.**

---

## Overview

Marginalia is a single-user-per-workspace application. Each authenticated
user has their own research library and workspaces, isolated by Postgres
row-level security. The app is built for focused reading, not chat: answers
are typeset like a manuscript, and citations appear as margin notes beside
the text rather than as stacked chat bubbles.

## Main features

- **Research workspaces** — a named space for a question you're trying to
  answer, holding its own documents, sources, and question history.
- **PDF library** — upload PDFs into a private storage bucket; body text is
  extracted automatically and made available as searchable evidence.
- **Web sources** — add links by hand or opt into web research when asking a
  question; discovered sources are saved to the workspace.
- **Question → answer flow** — ask a question and the assistant answers from
  your workspace's evidence (documents, sources, and optionally the web).
- **Citation integrity** — answers carry inline `[n]` markers; a citation is
  only persisted when it resolves to real body text in the provided context.
  Clicking a marker scrolls to and highlights the source note.
- **Robust failure handling** — background generation, transient provider
  retries, question status machine (`pending → generating → complete/failed`),
  retry controls, and stale-state recovery.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Styling | Tailwind CSS v4, custom design tokens (`design-system.md`) |
| Database / Auth / Storage | Supabase (Postgres + RLS, Google OAuth + email, private storage bucket) |
| AI | Google Gemini (`@google/genai`): text/JSON generation + Google Search grounding |
| PDF extraction | `pdf-parse` |
| Tests | Vitest (unit tests, node environment, providers mocked at app boundaries) |

## Architecture overview

```
src/app/            Next.js routes (pages + server actions per feature)
  ├─ page.tsx               Workspace home
  ├─ research/              Research list, create form, workspace page
  ├─ documents/             Document library
  ├─ settings/              Profile + appearance
  ├─ login|register|auth/   Authentication
  └─ api/health             Dev-only Supabase connectivity check
src/components/     UI components (layout shell, research, documents, ui primitives)
src/lib/            Business logic, layered:
  ├─ supabase/              Browser + server client factories (RLS-scoped)
  ├─ auth/                  Session helpers
  ├─ ai/                    The only code that touches Gemini (text/JSON/web search,
  │                         timeouts, retry, sanitized errors)
  ├─ search/                Web search wrapper over the AI layer
  └─ research/              Data layer per entity, validation, errors (AppResult<T>),
                            context retrieval, generation orchestration, document
                            processing, workspace assembly
supabase/migrations/  SQL schema: tables, RLS policies, ownership triggers
```

Key patterns:

- **Server-first.** Pages are React Server Components; every mutation is a
  server action in `src/app/**/actions.ts`. The client never talks to the
  database directly except through the auth/profile providers.
- **`AppResult<T>` result pattern.** Every data-layer function returns
  `ok(value)` or `fail(AppError)`; raw database/provider errors are logged
  server-side and reduced to safe messages before reaching the UI.
- **Ownership everywhere.** The Supabase server client is RLS-scoped to the
  current user, and database triggers additionally enforce that child rows
  belong to their parent workspace's owner. Client-supplied ownership is
  never trusted.
- **Background generation.** Answer generation runs after the HTTP response
  (`after()`), so asking a question returns immediately; the UI polls the
  question's status and renders the terminal state.
- **Metadata-only payloads.** Document/source `content` (up to 200k chars)
  and private storage paths are excluded from UI payloads; only server-side
  retrieval paths read full evidence text.

## Local setup

Prerequisites: Node.js 20+, a Supabase project, and a Google AI API key.

```bash
npm install
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values. Never commit
`.env.local`.

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client + server | Supabase publishable (anon) key — never the service role key |
| `GEMINI_API_KEY` | server only | Google AI Studio key for Gemini generation and web search |

## Database / Supabase setup

1. **Create a Supabase project** and copy the project URL and publishable key
   into `.env.local`.
2. **Apply the migrations** in `supabase/migrations/` (in filename order).
   They create the `profiles` trigger, the six research tables
   (`research`, `research_questions`, `documents`, `sources`, `answers`,
   `citations`), row-level security policies, and ownership triggers. With
   the Supabase CLI: `supabase db push`. The SQL files can also be run
   manually in the SQL editor.
3. **Enable auth providers**: Google OAuth (and optionally email) under
   Authentication → Providers. Set the site URL and redirect URLs to include
   `http://localhost:3000/auth/callback` (dev) and your production origin.
4. **Create a private storage bucket** named `documents` (Storage →
   New bucket, public access **off**) and set its file size limit to 10 MB
   (the app enforces the same limit client- and server-side).

## Running the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev-only health
checks live at `/api/health` (Supabase connectivity) and are 404 outside of
`next dev`.

## Running tests and checks

```bash
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript typecheck
npx vitest run        # Unit tests (382+ tests across the data, AI, search layers)
```

## Building for production

```bash
npm run build
npm run start
```

## Document processing flow

1. A server action validates the upload (PDF only, ≤ 10 MB, owned research
   workspace) and uploads the file to the private `documents` bucket at
   `{user_id}/{research_id}/{document_id}.pdf`.
2. A `documents` row is created with status `pending`.
3. The document is claimed atomically (`pending → processing`), downloaded
   from storage, and its body text is extracted with `pdf-parse`.
4. Extracted text is persisted to `documents.content` and the row becomes
   `ready`. Failures mark the row `failed` (with a Retry control), and a
   failed row insert removes the just-uploaded file so no orphan remains.

## AI / research flow

1. Asking a question creates a `research_questions` row (`pending`) and
   returns immediately; generation is scheduled after the response.
2. Context retrieval assembles the workspace's documents and sources as a
   numbered evidence list (body text only — metadata-only items are labeled
   as such and never quoted).
3. If the question opted into web research, a grounded web search runs and
   discovered sources are saved to the workspace (best-effort; failure never
   fails the answer).
4. Gemini is asked to produce strict JSON: prose plus a citations array.
   Markers must resolve to actual context items; unresolvable citations are
   dropped, never fabricated.
5. The answer and its citations are persisted, and the question transitions
   to `complete` (or `failed`, offering retry). If a run dies mid-task, the
   stale-state recovery control resets the question so it can be retried.

## Security considerations

- **RLS is the security boundary.** Every table is per-user; the data layer
  additionally never trusts caller-supplied ownership.
- **No secrets in the client.** Only the Supabase publishable key is
  public; `GEMINI_API_KEY` and any service role key stay server-side.
- **Sanitized errors.** Raw database/provider messages are logged for
  developers but never surfaced to users.
- **Payload hygiene.** Document/source body text and storage paths are never
  serialized into UI payloads.
- **Safe external links.** Source links open in new tabs with
  `rel="noopener noreferrer"`.
- **Private by default.** Search engines are told not to index the app, and
  the health check is dev-only.

## Deployment

Deployment has **not** been performed as part of this project's development.
To deploy:

- Choose a Next.js host (e.g. Vercel) and set the three environment
  variables above in the platform's environment settings.
- Ensure the platform supports the route's `maxDuration = 60` for background
  generation (or lower it to the platform's limit).
- Point the Supabase project's auth redirect URLs at the production origin
  (`https://your-domain/auth/callback`).
- See `SMOKE-TEST.md` for the manual production checklist to run before and
  after going live.
