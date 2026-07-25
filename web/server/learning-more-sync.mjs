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
      const applyDelta = (base, nextDelta) => store.dispatchChange(
        { type: "learning-more.import", ...nextDelta },
        {
          expectedRevision: base.revision,
          commandId: commandId(),
          occurredAt: now(),
        },
      );
      try {
        const result = applyDelta(current, delta);
        return {
          status: result.changed ? "changed" : "unchanged",
          revision: result.state.revision,
        };
      } catch (error) {
        // A browser edit may land after the pull. Rebase the same immutable
        // source batch onto the winning state, then retry once without
        // overwriting the user's command.
        if (error?.code === "REVISION_CONFLICT") {
          const latest = error.currentState ?? store.load();
          const rebasedDelta = createDelta(latest, batch);
          if (!rebasedDelta) return { status: "unchanged", revision: latest.revision };
          const retried = applyDelta(latest, rebasedDelta);
          return {
            status: retried.changed ? "changed" : "unchanged",
            revision: retried.state.revision,
          };
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
