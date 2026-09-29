# Phase 11 — Comprehensive Testing & Validation (Complete)

Status: complete. All unit/type/lint/build checks green — **382 tests across
27 test files** (up from 179 tests / 14 files at the start of Phase 11).
Two genuine bugs were found by the new tests and fixed in the error layers,
each aligning the code with its own documented contract. No product behavior
changes beyond those two fixes. Committed: **NO** / Pushed: **NO**.

---

## 1. Objective and scope

Build broad automated coverage for the research-assistant data layer, the AI
layer boundary, and every server action that touches the database, so that
Phase 8/9 retrieval precision, the Phase 7.8 background-generation and
stale-state recovery paths, and the Phase 10 citation protocol are locked in by
tests. Constraints honored: no commits/pushes, no `.env*`/secret changes, no
new dependencies, no weakening of RLS/auth/validation, behavior preserved
except where a test exposed a genuine bug, existing tests extended rather than
replaced, providers mocked at the app boundary, deterministic tests.

## 2. Coverage audit — gaps identified and closed

The Step 1 audit mapped what existed (AI layer, document upload/processing,
context retrieval + regressions, answer format/parse, citation generation,
source/answer/citation resolution primitives, `askQuestionAction`/
`retryAnswerAction`/`deleteDocumentAction`/`retryDocumentAction`) against the
uncovered surface. All of the following gaps were closed this phase:

| Uncovered module           | Functions now covered                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `research.ts`              | `getResearchList`, `getResearchListWithCounts`, `getResearchById`, `createResearch`, `updateResearch`, `deleteResearch`                                                                                 |
| `workspace.ts`             | `getResearchWorkspace` (assembly, citable labeling, error paths)                                                                                                                                        |
| `answers.ts`               | `getAnswers`, `getAnswerWithCitations`, `createAnswer`, `deleteAnswer`                                                                                                                                  |
| `citations.ts`             | `getCitations`, `createCitation` (exactly-one rule, numbering, excerpt cap)                                                                                                                             |
| `documents.ts`             | `getDocuments`, `getAllDocuments`, `getDocumentById`, `createDocument`, `setDocumentProcessing`, `setDocumentReady`, `setDocumentFailed`, `setDocumentContent`, `setDocumentFilePath`, `deleteDocument` |
| `questions.ts`             | `getQuestions`, `getQuestionById`, `createQuestion`, `updateQuestionStatus`, `tryTransitionQuestionStatus` (atomic race), `deleteQuestion`                                                              |
| `validation.ts`            | all 7 validators (text/optional/number/one-of/uuid/date/exactly-one)                                                                                                                                    |
| `session.ts`               | `requireUser` (user, lookup failure, empty session)                                                                                                                                                     |
| `errors.ts`                | result constructors, error factories, `isAppError`, `toAppError` (safe logging)                                                                                                                         |
| `web-research.ts`          | `runWebResearch` (dedupe, title cap, insert failures, new-source cap, best-effort search failure)                                                                                                       |
| `search/index.ts`          | `searchWeb` (validation, timeout, NOT_CONFIGURED preserve, error reduction, URL normalization, dedupe, result cap)                                                                                      |
| `document-parse.ts`        | `mimeTypeFromName`, `extractDocumentText` (PDF mock, text decode, parser failure, empty, char cap)                                                                                                      |
| `createResearchAction`     | validation field errors, sign-in, generic failure, redirect + revalidate                                                                                                                                |
| `recoverStuckAnswerAction` | stuck→failed transition, sign-in/generic failure, "no longer stuck"                                                                                                                                     |
| `addSourceAction`          | field errors, sign-in, data-layer VALIDATION_ERROR passthrough, generic failure                                                                                                                         |
| `deleteSourceAction`       | delete + revalidate, missing/sign-in/failure paths                                                                                                                                                      |
| `addDocumentAction`        | uuid/file/empty/size/name/mime validation, sign-in, missing research, upload+row+process flow, orphaned-upload cleanup, processing error                                                                |

## 3. Tests added this phase

**13 new test files** (203 new tests; 14 → 27 files):

| File                                                                 | Tests | Covers                                           |
| -------------------------------------------------------------------- | ----- | ------------------------------------------------ |
| `src/lib/research/__tests__/validation.test.ts`                      | 17    | all validators                                   |
| `src/lib/research/__tests__/errors.test.ts`                          | 10    | constructors/factories/`isAppError`/`toAppError` |
| `src/lib/research/__tests__/session.test.ts`                         | 3     | `requireUser`                                    |
| `src/lib/research/__tests__/research.test.ts`                        | 22    | full research CRUD                               |
| `src/lib/research/__tests__/workspace.test.ts`                       | 8     | workspace assembly                               |
| `src/lib/research/__tests__/answers.test.ts`                         | 17    | answers + citation join                          |
| `src/lib/research/__tests__/citations.test.ts`                       | 12    | citation CRUD + rules                            |
| `src/lib/research/__tests__/web-research.test.ts`                    | 10    | `runWebResearch`                                 |
| `src/lib/research/__tests__/document-parse.test.ts`                  | 10    | MIME guess + text extraction                     |
| `src/lib/search/__tests__/index.test.ts`                             | 10    | `searchWeb` + error reduction                    |
| `src/app/research/new/__tests__/create-research-action.test.ts`      | 6     | creation action                                  |
| `src/app/research/[id]/__tests__/recover-and-source-actions.test.ts` | 14    | recover + add/delete source                      |
| `src/app/documents/__tests__/add-document-action.test.ts`            | 11    | upload action                                    |

**2 extended files:** `documents.test.ts` (8 → 37) and `questions.test.ts`
(4 → 31).

## 4. Bugs found and fixed (behavior-preserving, per documented contract)

Both fixes are in the error-normalization layers and were driven by the new
tests — no product feature code changed.

1. **`isAppError` (`src/lib/research/errors.ts`)** — the predicate accepted any
   object carrying a `code` plus a string `message`, so a raw PostgrestError
   (e.g. code `22P02`) passed through `toAppError` unchanged and its raw
   database message reached callers. Now constrained to the `APP_ERROR_CODES`
   union, matching the documented rule "raw database details are never
   surfaced". (Same class of looseness the new `errors.test.ts` asserts
   against.)
2. **`isSearchError` (`src/lib/search/errors.ts`)** — the predicate accepted
   any `{ code, message }` object, so an AI-layer error such as
   `INVALID_RESPONSE` escaped `toSearchError`'s documented reduction
   ("everything except `NOT_CONFIGURED` becomes a generic `PROVIDER_ERROR`").
   Now constrained to the `SEARCH_ERROR_CODES` union.

## 5. Focus-area verification

- **Rate limiting:** `getRecentUserQuestionCount` (questions.test.ts) plus the
  rate-limit and rate-limit-error branches in `askQuestionAction`
  (ask-action.test.ts).
- **Background generation:** `scheduleGeneration` via `runAfterResponse`
  (mocked `after`) — return-immediately, task runs after response, revalidate
  even when generation throws (ask-action / retry-action tests).
- **Retrieval regressions:** existing `context.test.ts` suite (retrieval,
  ranking, conceptual retrieval, live-shape significance-level regression)
  unchanged and still green — Phase 9A fix remains locked.
- **Error handling:** `errors.test.ts` covers safe logging (message-only),
  fallback labels, and pass-through of genuine `AppError`s; `isAppError` is
  shared with `toGenerationError`.

## 6. Verification results

- `npx vitest run` — **382 passed / 382** (27 files).
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean (Next.js 16.3.0, Turbopack, all 11 routes).
- `git status --short` — only the intended files below; nothing committed.

## 7. Error-boundary / E2E strategy + manual checklist

No jsdom/RTL (vitest `environment: "node"`), so interactive UI error rendering
is verified manually, not by unit tests. The app already has a root
`src/app/error.tsx` and a route-level `src/app/research/[id]/error.tsx` plus
route `loading.tsx` files; these are exercised in the manual pass below.

Manual browser checklist (requires `.env.local` with a Supabase project and
`GEMINI_API_KEY`):

1. **Research CRUD:** create a research (redirects to workspace, appears on
   `/` and `/research`), rename it, delete it.
2. **Question → answer flow:** ask a question (with and without "include web"),
   confirm the action returns immediately, the row shows `pending` →
   `generating` → `complete`/`failed`, and a long-running generation doesn't
   block the response.
3. **Rate limit:** ask 20 questions within 5 minutes, confirm the friendly
   rate-limit message; confirm it is global per user across workspaces.
4. **Stale recovery:** with a dev pause, trigger `recoverStuckAnswerAction`,
   confirm `pending`/`generating` resets to `failed` and a retry then works.
5. **Retry:** a `failed` question offers retry; retry re-runs and lands on
   `complete`.
6. **Citations:** generated answer shows clickable `[n]` markers, every marker
   opens the cited passage, no dangling/bare numbers, no duplicate React keys.
7. **Sources:** add a source (title/URL/optional body text), delete it; a
   duplicate URL is rejected; a source with pasted body text becomes citable.
8. **Documents:** upload a valid PDF (row goes `pending` → `processing` →
   `ready`, content extracted), upload a non-PDF/size-limit/empty file (friendly
   errors, no orphaned storage object), retry a `failed` document, delete a
   document (row + storage object removed).
9. **Errors/loading boundaries:** intentionally cause a data error in a
   workspace and confirm the route `error.tsx` boundary renders without crashing
   the shell; confirm route `loading.tsx` shows during slow loads.
10. **Signed-out behavior:** visiting `/research/[id]`, `/documents`, and
    `/settings` unsigned-out redirects to login; actions return "You need to be
    signed in" and never touch the database.
11. **Cross-user isolation (RLS):** with two accounts, confirm account A can
    never see or modify account B's research/questions/documents/sources, and
    deleting B's source/document from A's session fails.

## 8. Constraints honored / out of scope

- No commits or pushes (`git status` shows only intended uncommitted changes).
- No `.env*`, `.env.local`, or secret changes; no dependency additions.
- No schema/migration/RLS/Storage changes; the `profiles`-table RLS gap noted in
  the audit remains out of scope (not present in committed migrations) and is
  captured as manual checklist item 11.
- No AI provider or model configuration changes.
- No UI component changes; interactive error-rendering is manual-only by
  design.

## 9. Files changed (all uncommitted)

| File                                           | Change                                            |
| ---------------------------------------------- | ------------------------------------------------- |
| `src/lib/research/errors.ts`                   | `isAppError` tightened to `APP_ERROR_CODES`       |
| `src/lib/search/errors.ts`                     | `isSearchError` tightened to `SEARCH_ERROR_CODES` |
| `src/lib/research/__tests__/documents.test.ts` | extended 8 → 37 tests                             |
| `src/lib/research/__tests__/questions.test.ts` | extended 4 → 31 tests                             |
| 13 new test files (see §3)                     | added                                             |
| `PHASE-11-COMPLETE.md`                         | this report                                       |

## 10. Status

- Phase 11 scope: **complete**.
- Committed: **NO** — all changes remain uncommitted in the working tree, as
  required. Pushed: **NO**.
- Baseline: 179 tests / 14 files → **382 tests / 27 files**, all green.
