# Phase 9A Final — Retrieval Precision Fix (significance-level value)

Status: implementation complete; all unit/type/lint/build checks green (135 tests).
The final live bug is diagnosed and fixed generically in the retrieval ranker,
and the fix is verified live against the real PDF: asking "At what statistical
significance level were trends evaluated?" now selects the methodology passage
and answers "The statistical significance level was α = 0.05." with a valid
clickable citation. All temporary `DEBUG_RETRIEVAL` diagnostics have been
removed.

---

## 0. Live retrieval debug (final)

### 0.1 Live trace evidence (captured from the app)

Running the app with `DEBUG_RETRIEVAL=1` and asking exactly
"At what statistical significance level were trends evaluated?" produced:

```
[retrieval-trace] documents=1 statuses={"ready":1}
[retrieval-trace] doc title="Temporal_variation_of_extreme_rainfall_e.pdf" status=ready contentLen=60797 hasActiveValuePhrase=true containsNumber=true
[retrieval-trace] candidateCount=1
[retrieval-trace] selectedCount=1
[retrieval-trace] item[0] ... id=568f42f4-c9b3-4542-a773-ef4df0894040 score=160 contentLen=60797 passageLen=1999
[retrieval-trace] item[0] first300="IV, Yellow River, V, Southeast Coast, VI, Yangtze River, VII, Southern China; VIII, Northwest China; IX, Tibetan Plateau). 50 G. Fu et al. / Journal of Hydrology 487 (2013) 48–59 ..."
[retrieval-trace] item[0] last300="...imum values of 599 stations for 1-day, 5-yr events are about 55–125% larger than those of 1-day, 1-yr events. The thresholds values of 1-day, 10-yr events are about 87–200% larger ..."
[retrieval-trace] promptItem[0] ... passageLen=1999 includedInPrompt=true
```

Decisive facts:

- The document IS `ready`, its extracted content is 60,797 chars, and
  `hasActiveValuePhrase=true` — the phrase "significance level" IS present in
  `documents.content`.
- `hasActiveValuePhrase` and `containsNumber` are evaluated on the **full**
  content, not the selected passage.
- The **selected** passage (score 160) is the thresholds/results region
  ("55–125% larger", "87–200% larger", "599 stations", "1-day, 5-yr, 10-yr,
  30-day"), NOT the methodology statement.
- The passage is included verbatim in the prompt (`includedInPrompt=true`,
  promptLength≈2258, far under the 40k cap): no post-selection truncation.

The document is therefore retrieved correctly; the failure is entirely in which
region `selectRelevantPassage()`/`bestCluster` picks.

### 0.2 Root cause (confirmed by trace + regression)

The `valueCount` bonus in `bestCluster` rewarded **every distinct numeric token
within `VALUE_WINDOW` (25 chars) of ANY keyword hit**, each worth +10 points.
The paper's results/thresholds section is saturated with incidental numbers
(55, 125, 87, 200, 1, 5, 10, 30, 599, …) that sit near question keywords
("evaluated", "level", "significance", "trends", "were") but have nothing to do
with the sought value. That raw numeric count inflated the results region to
score 160, beating the methodology statement whose window had far fewer hits and
only one real value. `conceptValue` (phrase `significance level` next to a
number, +30) was the correct signal but could not offset the results region's
`valueCount` noise.

### 0.3 Why the previous 134 tests passed despite the live failure

Every unit fixture positioned the methodology statement next to ALL of the
question's keywords (so `distinctBase` + phraseCount + conceptValue dominated
its window), or gave the competing number-rich region too few incidental
numbers / weaker keyword coverage for `valueCount` to overtake it. None
reproduced the live document's pattern: a results/thresholds section with more
distinct incidental numbers near hits than the methodology statement could
counter. The new regression test (§0.5) is the first fixture to reproduce that
exact shape, and it FAILS on the old scoring and PASSES on the fix.

### 0.4 The fix (generic, no hardcoding)

1. **`valueCount` is anchored on the value concept.** When the question names a
   value concept (`significance level`, `recurrence intervals`, …), a numeric
   token only counts if it sits within `VALUE_WINDOW` of an active concept
   phrase occurrence (`valuePhraseAnchors`), not next to any stray keyword hit.
   Questions without a value concept ("how many stations?", "which year?") keep
   the near-hit counting. This removes the number-dense results-section noise.
   `conceptValue` is computed from the same phrase anchors (identical semantics,
   single scan).
2. **Value-statement invariant enforced on the returned passage (TASK 4).**
   For a value-seeking question, when the winning cluster scored a
   `conceptValue` bonus, the final returned passage MUST contain the active
   concept phrase AND its nearby number. Scoring happens on a window of keyword
   hits; if sentence/word snapping would lose the statement, `selectRelevantPassage`
   re-anchors on the value statement (via the extracted `buildPassageWindow`
   helper). The score now corresponds to the passage that is actually returned.

No `0.05`, `significance level`, or paper-specific text is hardcoded anywhere in
the logic.

### 0.5 Live-shaped regression test added (permanent)

`context.test.ts`: **"selects the value-bearing methodology statement over a
number-saturated thresholds region (live shape)"** — mirrors the live paper:
a long document whose results region saturates the question keywords with
incidental numbers (`55`, `125`, `0.05`, `85`, `599`, `1`, `5`, `10`, `30`)
with no contiguous "significance level" phrase, while the actual
`statistical significance level (a = 0.05)` statement sits far away, plus a
competing correlation-review document. Asserts the primary passage is the paper,
contains `statistical significance level (a = 0.05)` and `0.05`, does not
contain `correlations` or `1-day, 5-yr`, and stays ≤ 2000 chars. Verified to
FAIL on the old scoring and PASS on the fix.

### 0.6 Live re-verification (TASK 7) — PASSED

With `DEBUG_RETRIEVAL=1` the live run confirmed `item[0]`'s selected passage is
now the methodology region, and the generated answer for "At what statistical
significance level were trends evaluated?" was approximately "The statistical
significance level was α = 0.05." with a valid clickable citation. All temporary
`DEBUG_RETRIEVAL` traces have been removed (TASK 8) and the file diff is clean.

---

## 1. Exact root cause (final)

Two compounding defects in `src/lib/research/context.ts`:

1. **`valueCount` counted numbers near ANY keyword hit.** For value-seeking
   questions, every distinct numeric token within 25 chars of any `base`/`study`/
   `expansion` hit earned +10. The paper's results/thresholds region contains a
   dense run of incidental numbers (threshold/return values, station counts,
   years-denominated durations) that sit near "trends were evaluated", "level",
   "significance" — none of which is the sought value. This noise let the results
   region outscore the methodology statement that actually pairs the concept with
   its value.
2. **The score was computed on a hit window, while the passage is produced by
   snapping.** Nothing guaranteed that a window that won because of a value
   statement would return a passage that still contains that statement after
   sentence/word snapping.

(The earlier diagnosis in §1-2 of the previous revision — phrase scoring and
window-end snapping — remains valid and was kept; this revision adds the true
final cause above.)

## 2. Exact scoring/selection change

- **`valueCount` gated on active value-concept phrases.** In `bestCluster`, when
  `valueConcepts.length > 0`, numeric tokens only count when within `VALUE_WINDOW`
  of an active concept phrase occurrence; otherwise the previous near-hit rule is
  unchanged. `conceptValue` reuses the same `valuePhraseAnchors` scan (identical
  semantics, one regex pass per concept).
- **New helpers** `valuePhraseAnchors(content, valueConcepts, from, to)` (all
  phrase occurrences as absolute offsets) and `valueStatementSpan(content,
valueConcepts, from, to)` (first phrase with a number next to it).
- **Value-statement invariant in `selectRelevantPassage`.** When
  `valueSeeking && valueConcepts.length > 0 && cluster.conceptValue > 0` and the
  snapped passage no longer contains a value statement, re-anchor the window on
  the statement using the same centering/snapping pipeline.
- **Refactor** `buildPassageWindow(content, requiredStart, requiredEnd,
fallbackStart, fallbackEnd, budget)` extracts the previous centring +
  redistribution + sentence/word snapping so both the cluster-anchored and the
  re-anchored paths share identical behaviour.
- `Cluster` now carries its score components (`distinctBase`, `distinctStudy`,
  `distinctExpansion`, `phraseCount`, `valueCount`, `conceptValue`) for the
  debug leaderboard and the invariant check.
- Determinism, `MAX_CONTEXT_ITEMS` (6), `MAX_CONTENT_CHARS` (2000), duplicate
  suppression, secondary-passage focus, and per-concept secondary coverage are
  unchanged.

## 3. Files changed (all uncommitted)

| File                                         | Change                                                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/research/context.ts`                | `valueCount` concept gating, `valuePhraseAnchors`/`valueStatementSpan`, `buildPassageWindow` refactor, value-statement re-anchor invariant, `Cluster` components |
| `src/lib/research/__tests__/context.test.ts` | +1 regression test (number-saturated thresholds region, live shape)                                                                                              |

Earlier Phase 9A follow-up changes remain in the working tree (`citation-generation.ts`,
`web-research.ts`, `src/lib/search/*`, prior tests, this report). No database,
migration, RLS, Storage, citation-persistence, UI, model-configuration, or
document-processing changes.

## 4. Tests added

- **"selects the value-bearing methodology statement over a number-saturated
  thresholds region (live shape)"** — the live document shape; verified to fail
  on the old scoring and pass on the fix (see §0.5).
- (Earlier rounds) correlation-passage, unrelated number-rich content, and
  realistic full-paper regression tests — all still pass.

## 5. Verification results

- `npx vitest run` — **135 passed / 135** (10 test files; 134 → 135 with the
  live-shape regression).
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean (Next.js 16.3.0, Turbopack).

## 6. No hardcoded answers

No `0.05`, `Mann-Kendall`, `statistical significance level`, or paper-specific
value appears in any implementation code — only in code comments and test
fixtures. The scoring is generic over value-concept phrases + nearby numbers.

## 7. No out-of-scope changes

Confirmed: no schema/migration/RLS/Storage changes; no citation-persistence or UI
changes; no Gemini model-configuration changes; no Phase 8 document-processing
changes. All temporary `DEBUG_RETRIEVAL` diagnostics were removed after the live
re-verification in §0.6.

## 8. Manual browser verification

1. **"At what statistical significance level were trends evaluated?"**
   Expected answer: _The statistical significance level was α = 0.05._ — and the
   cited passage must be the methodology sentence, not the thresholds/results
   region.
2. **"What were the three recurrence intervals and four durations used to define
   extreme precipitation events?"**
   Expected: _1, 5, 10 years and 1, 5, 10, 30 days._
3. **"What methodology did the authors use and what were the main findings
   regarding temporal variation?"**
   Expected: the authors' own methodology + findings, not prior-study literature.

For all three: citations persisted; every `[n]` clickable; no bare citation
numbers; no duplicate React keys; no dangling citation markers.
