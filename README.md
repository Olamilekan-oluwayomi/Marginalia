# Marginalia — AI Research Assistant

> **Research, read, connect.**

Marginalia is a private, single-user research workspace that turns your own
documents and web sources into cited, evidence-first answers. Upload a PDF,
drop in a source, ask a question — and get a concise answer with inline margin
notes that point back to the exact passages it was built from.

The product is built around a strict rule: **an AI answer is only as good as
the evidence behind it, and the evidence must be verifiable.** Every claim the
assistant makes is anchored to a numbered citation that resolves to real
content you provided, and the model is structurally prevented from inventing
sources.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [How it works](#how-it-works)
  - [The question pipeline](#the-question-pipeline)
  - [Answering modes](#answering-modes)
  - [Document processing](#document-processing)
  - [Evidence retrieval](#evidence-retrieval)
  - [Citation integrity](#citation-integrity)
  - [Reliability](#reliability)
- [Project layout](#project-layout)
- [Data model](#data-model)
- [Getting started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment variables](#environment-variables)
  - [Local development](#local-development)
- [Scripts](#scripts)
- [Testing](#testing)
- [Security](#security)
- [Documentation](#documentation)

---

## Features

- **Private research workspaces.** Each workspace is its own library of
  documents, web sources, and questions. Multi-user isolation is enforced at
  the database level with Postgres Row Level Security — you can only ever see
  your own content, and server actions can only touch your own rows.
- **Document upload.** Upload PDFs up to 10&nbsp;MB. The text is extracted in
  the background server-side and stored, then the document moves through a
  `Pending → Processing → Ready` status machine. Failed extractions surface a
  retry control.
- **Web sources.** Add a source manually with a title, URL, publisher, and
  pasted body text. Duplicate URLs are rejected. Sources are searchable as
  citable evidence just like documents.
- **Live web research.** When a question asks for web evidence, the app runs a
  real web search (Tavily) and feeds the best results into the answer as
  citable sources.
- **Three explicit answering modes** — document, web, or both — plus a
  **smart mode** that decides automatically:
  - When the question explicitly scopes itself ("in the document", "search the
    web"), that intent wins.
  - Otherwise a relevance classifier checks whether your document actually
    answers the question. If it does, the answer comes from your document; if
    not, the app falls back to the web and tells you so: _"This wasn't found in
    your document, so I searched the web instead."_
- **Evidence-first answers with margin citations.** Answers are short prose
  paragraphs with inline `[n]` markers. Each marker resolves to the exact
  document passage or web source that supports it. The model cannot fabricate
  citations — every display field is filled server-side from real evidence,
  and unresolvable markers are dropped.
- **Background generation.** Asking a question returns instantly; the research
  and generation run after the response, and the UI polls the question's
  status (`pending` → `generating` → `complete`/`failed`) until the answer is
  ready.
- **Bounded, predictable costs.** A 2,000-token answer cap, 30-second provider
  timeouts, a single bounded retry, and a per-user question rate limit keep
  each answer cheap and fast.

---

## Tech stack

| Layer               | Technology                                                         |
| ------------------- | ------------------------------------------------------------------ |
| Framework           | Next.js 16 (App Router, Server Actions, React Compiler, `after()`) |
| UI                  | React 19, Tailwind CSS, lucide-react                               |
| Language            | TypeScript (strict)                                                |
| Database & auth     | Supabase (Postgres, Auth, Storage) + `@supabase/ssr`               |
| Answer generation   | Google Gemini (`@google/genai`) — default `gemini-3.5-flash-lite`  |
| Generation fallback | Groq (OpenAI-compatible API) — default `openai/gpt-oss-120b`       |
| Web search          | Tavily API                                                         |
| PDF text extraction | `unpdf` (server-side)                                              |
| Testing             | Vitest + React Testing Library (478 unit tests across 33 files)    |
| Lint / types        | ESLint, `tsc --noEmit`                                             |

---

## How it works

### The question pipeline

```
ask a question
      │
      ▼
server action  ── creates question row (status = pending) ── returns immediately
      │
      ▼
runAfterResponse()  (runs after the HTTP response is sent)
      │
      ▼
1. Load the workspace's ready documents + sources     (RLS-scoped, caller's rows only)
2. Choose mode ── explicit intent, or smart-mode relevance check
3. If web research is needed → Tavily search → store sources
4. Build the RESEARCH CONTEXT: numbered evidence items
5. selectRelevantPassages ── pick the most relevant stretches of each document
6. generateJson ── Gemini (or Groq fallback) returns { answer, citations }
7. Validate citations against the provided evidence; drop anything unresolvable
8. Persist the answer, mark the question complete (or failed)
      │
      ▼
UI polls status → renders the answer with its margin citations
```

### Answering modes

`SourceMode` is `"document" | "web" | "both"`, selected per question:

- **Explicit intent.** Phrase cues like _"check the document"_ or _"search the
  web"_ set the mode directly.
- **Smart mode.** With no explicit cue, the app checks whether the workspace's
  document would actually answer the question:
  1. It builds a compact, relevance-focused summary of the document (bounded to
     4,000 characters per document / 12,000 total).
  2. A Gemini classifier returns `{ relevant, confidence, reason }`.
  3. Relevant → answer from the document. Not relevant → fall back to web
     research, persisting a user-facing fallback reason on the answer.
- **Web-only safety.** If a web-only question produces no usable web evidence,
  the question is failed rather than emitting an answer that claims a search
  that never produced results.

### Document processing

1. The upload action validates the file client- and server-side: `.pdf` name,
   `application/pdf` MIME, ≤ 10&nbsp;MB — the rules live in one shared,
   dependency-free module so the client and server can never drift apart.
2. The PDF is uploaded to the private `documents` bucket, and the row is
   created with `status = pending`.
3. A background task atomically claims the document (`pending → processing`),
   re-loads it through the RLS-enforced data layer, and downloads the file.
4. `unpdf` extracts the body text server-side, the text is persisted to
   `documents.content`, and the status flips to `ready`.
5. Only `ready` documents are eligible as evidence. `pending`, `processing`,
   and `failed` documents are never used to answer.

### Evidence retrieval

Documents are often long, and a question usually has several concepts. The
retrieval layer (`src/lib/research/context.ts`) is what makes answers precise:

- **Keyword expansion.** Question terms are expanded with lemmas and synonyms
  from a shared concept map, so a document that says "assessed" matches a
  question about "evaluated".
- **Document-level scoring.** Each document is ranked by how well it covers the
  question's concepts.
- **Passage selection.** For the top documents, the pipeline finds the single
  most relevant stretch (the _best cluster_), then looks for additional
  **value-bearing passages** that cover question concepts the primary passage
  missed — even when the primary cluster already touches every concept, other
  strong passages still surface so a multi-section document contributes
  complementary evidence. Results are de-duplicated and capped at six passages
  per document.
- **Strict evidence boundaries.** Only content actually handed to the model can
  be cited, and a citation's display fields are resolved server-side from the
  evidence — never from the model.

### Citation integrity

- The model sees the research context as a numbered list and cites by
  **1-based list index**, never by document or source id, so it cannot
  reference an item that wasn't provided.
- After generation, the app validates every citation against the provided
  evidence. Unresolvable markers are dropped; the answer still persists.
- Items marked as **reference metadata only** (never read) are never quoted,
  summarized, or cited — the answer may only point the user at them for review.

### Reliability

- **Provider fallback.** Answer generation goes to Gemini first. On transient
  conditions (HTTP 429/5xx), the exact same assembled prompt, context, and
  budget are retried once against Groq — research and relevance checks are
  never re-run for the fallback. Keys are redacted from every log and error.
- **Timeouts.** Generation and Groq calls cap at 30&nbsp;seconds; web search at
  15&nbsp;seconds. A hung provider cannot run indefinitely.
- **Stale-state recovery.** If a background task is killed mid-flight, the
  question is left `generating`/`pending`; the database status is the source of
  truth and the recovery path reconciles it.
- **Health check.** `/api/ai/health` (development) verifies the AI layer's
  connectivity without a full pipeline run.

---

## Project layout

```
├── src/
│   ├── app/                      # App Router routes
│   │   ├── api/ai/health         #   dev AI health check
│   │   ├── auth/                 #   auth callbacks
│   │   ├── documents/            #   document management + upload action
│   │   ├── login/  register/     #   email + Google auth
│   │   ├── research/             #   workspaces, ask UI, question pages
│   │   └── settings/
│   ├── components/               # server + client UI components
│   └── lib/
│       ├── ai/                   # Gemini client, generateText/generateJson,
│       │                         #   retry, timeout, error normalization
│       ├── auth/                 # session helpers
│       ├── research/             # the core pipeline
│       │   ├── providers/        #   AnswerGenerationProvider abstraction:
│       │   │                     #   gemini.ts, groq.ts, fallback.ts, types.ts
│       │   ├── context.ts        #   evidence retrieval + passage selection
│       │   ├── generation.ts     #   orchestration, prompts, citation protocol
│       │   ├── relevance-check.ts#   smart-mode relevance classifier
│       │   ├── web-research.ts   #   Tavily-backed source gathering
│       │   ├── document-*.ts     #   upload / parse / processing
│       │   ├── background.ts     #   runAfterResponse wrapper
│       │   └── ...
│       ├── search/               # web search provider abstraction (Tavily)
│       └── supabase/             # Supabase client
├── supabase/
│   └── migrations/               # 7 SQL migrations: schema + RLS policies
├── AGENTS.md                     # agent/contributor guardrails
├── SMOKE-TEST.md                 # production deployment checklist
├── design-system.md              # UI design system reference
└── PHASE-*.md                    # phase completion reports
```

---

## Data model

Managed entirely by SQL migrations in `supabase/migrations/`, with RLS enabled
on every table:

- **profiles** — one row per user, created by trigger on sign-up.
- **research_workspaces** — a user's research library.
- **documents** — uploaded PDFs, with extracted body text in `content` and a
  `status` lifecycle (`pending | processing | ready | failed`).
- **sources** — manually added web sources; `url` is unique per workspace.
- **questions** — asked questions with `source_mode` and a status machine.
- **answers** — generated answers, with the resolved citations (`type:
document | web`), the fallback reason when smart mode went to the web, and
  the source mode that produced them.

All tables scoped by workspace and filtered by `auth.uid()` via RLS policies;
storage access to the private `documents` bucket is similarly locked down.

---

## Getting started

### Prerequisites

- Node.js 20+ and npm
- A Supabase project (Postgres + Auth + Storage)
- API keys for Gemini, Tavily, and (for the fallback) Groq

### Environment variables

Copy `.env.example` to `.env.local` and fill it in:

| Variable                               | Required | Description                                      |
| -------------------------------------- | -------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | Yes      | Supabase project URL                             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes      | Supabase publishable (anon) key                  |
| `GEMINI_API_KEY`                       | Yes      | Primary answer-generation provider               |
| `TAVILY_API_KEY`                       | Yes      | Web search provider                              |
| `GROQ_API_KEY`                         | No       | Enables the Groq fallback for transient failures |
| `GROQ_MODEL`                           | No       | Groq model; defaults to `openai/gpt-oss-120b`    |

The app works with only Supabase + Gemini; add the Tavily key to enable web
research, and the Groq key to enable the resilience fallback. Keys are read
server-side only, are never logged (and are redacted even if echoed back), and
never reach the client bundle.

### Local development

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npx supabase db push         # or apply supabase/migrations/*.sql to your project
npm run dev
```

Open http://localhost:3000, register (email/password or Google), and upload a
PDF or add a source to start asking questions.

---

## Scripts

| Script                        | Description              |
| ----------------------------- | ------------------------ |
| `npm run dev`                 | Start the dev server     |
| `npm run build`               | Production build         |
| `npm run start`               | Run the production build |
| `npm run lint`                | ESLint                   |
| `npm test` / `npx vitest run` | Run the test suite       |

---

## Testing

The suite is **478 unit tests across 33 files** (`npx vitest run`). The
highest-value coverage is in `src/lib/research/`:

- **`context.test.ts`** — passage selection, keyword expansion, relevance
  ranking, and multi-passage surface behavior (including a regression test that
  locks in the value-redundancy fix: secondaries within the score margin still
  surface even when the primary cluster covers all concepts).
- **`citation-generation.test.ts`** — the citation protocol, marker
  sanitization, and drop-unresolvable behavior.
- **`providers/`** — Gemini/Groq provider contracts, timeout, redaction, and
  fallback eligibility.
- Plus coverage for relevance checking, web research, document upload/parse,
  auth guards, and the UI.

Run lint and type checking before committing:

```bash
npx vitest run
npm run lint
npx tsc --noEmit
```

---

## Security

- **Row Level Security everywhere.** Multi-user isolation is enforced in the
  database, not in application code. Server actions additionally scope every
  query by the caller's session.
- **No secrets in the client.** Provider keys live in server-only modules
  (`import "server-only"`) and are never bundled or logged; error paths redact
  key material.
- **Trust boundaries for the LLM.** Research context is treated as _data, never
  instructions_; untrusted content can never override the system prompt, and
  the model is told plainly when evidence is missing or metadata-only.
- **Validation on both sides.** Upload rules (type, size) are enforced
  identically in the browser and on the server from a single source of truth.
- See `SMOKE-TEST.md` for the manual production checklist (auth redirects,
  cross-account isolation, upload rejection paths, and more).

---

## Documentation

| File               | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `AGENTS.md`        | Contributor and agent guardrails for this codebase        |
| `SMOKE-TEST.md`    | Manual pass/fail checklist for a deployed environment     |
| `PHASE-*.md`       | Phase completion reports (design rationale and decisions) |
| `design-system.md` | UI design system reference                                |

---

_Built with Next.js, Supabase, and the Gemini / Groq / Tavily APIs._
