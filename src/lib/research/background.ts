import { after } from "next/server";

/**
 * Runs a task after the current response has been sent to the client.
 *
 * Phase 7.8 decouples answer generation from the HTTP/server-action request:
 * the action creates the question and returns immediately, while the actual
 * Gemini work (context retrieval, optional web research, generation,
 * persistence) happens here, after the response. The UI observes progress
 * through the question's status machine (`pending`/`generating` → `complete`
 * or `failed`) and refreshes by polling.
 *
 * On serverless platforms this uses `waitUntil` under the hood, extending the
 * function's lifetime up to the platform's max duration for the route. If the
 * platform kills the function mid-task, the question is left in
 * `generating`/`pending` and the existing stale-state recovery path handles
 * it — the task must therefore never be the source of truth; the database
 * status is.
 *
 * This wrapper exists so actions never import `next/server` directly and so
 * unit tests can replace scheduling with immediate execution.
 */
export function runAfterResponse(task: () => Promise<void>): void {
  after(task);
}
