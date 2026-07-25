import { randomUUID } from "node:crypto";

import { createLearningMoreDelta } from "../lib/learning-more-delta.ts";

export function createLearningMoreSyncService({
  store,
  client,
  createDelta = createLearningMoreDelta,
  commandId = randomUUID,
  now = () => new Date().toISOString(),
  onError = (error) => console.error("Learning MORE sync failed:", error),
}) {
  let inFlight;
  let timer;

  async function syncOnce() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const current = store.load();
      const batch = await client.pull(current.learningMore.historyCursor);
      const delta = createDelta(current, batch);
      if (!delta) return { status: "unchanged", revision: current.revision };
      try {
        const result = store.dispatchChange(
          { type: "learning-more.import", ...delta },
          {
            expectedRevision: current.revision,
            commandId: commandId(),
            occurredAt: now(),
          },
        );
        return {
          status: result.changed ? "changed" : "unchanged",
          revision: result.state.revision,
        };
      } catch (error) {
        // A browser command may land between load() and dispatchChange(). The
        // next minute pulls against the new revision, so this is not a failure
        // and must never take down the local service.
        if (error?.code === "REVISION_CONFLICT") {
          return { status: "conflict", revision: error.currentState?.revision ?? store.load().revision };
        }
        throw error;
      }
    })().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }

  function runSafely() {
    return syncOnce().catch((error) => {
      onError(error);
      return { status: "failed", revision: store.load().revision };
    });
  }

  function start(intervalMs = 60_000) {
    if (timer) return () => stop();
    void runSafely();
    timer = setInterval(() => void runSafely(), intervalMs);
    timer.unref?.();
    return () => stop();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = undefined;
  }

  return { syncOnce, runSafely, start, stop };
}
