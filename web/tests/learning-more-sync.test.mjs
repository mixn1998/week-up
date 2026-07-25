import assert from "node:assert/strict";
import test from "node:test";

import { createLearningMoreSyncService } from "../server/learning-more-sync.mjs";

function state(revision = 7) {
  return {
    revision,
    learningMore: {
      baseUrl: "http://127.0.0.1:43120",
      historyCursor: "cursor-7",
    },
  };
}

test("server Learning MORE sync does not write an event when the source is unchanged", async () => {
  let dispatches = 0;
  const store = {
    load: () => state(),
    dispatchChange: () => {
      dispatches += 1;
      throw new Error("unexpected_dispatch");
    },
  };
  const client = {
    pull: async (cursor) => {
      assert.equal(cursor, "cursor-7");
      return { courses: [], lessons: [], facts: [] };
    },
  };
  const service = createLearningMoreSyncService({
    store,
    client,
    createDelta: () => undefined,
  });

  assert.deepEqual(await service.syncOnce(), { status: "unchanged", revision: 7 });
  assert.equal(dispatches, 0);
});

test("server Learning MORE sync writes only the incremental patch at the loaded revision", async () => {
  const calls = [];
  const store = {
    load: () => state(),
    dispatchChange: (command, metadata) => {
      calls.push({ command, metadata });
      return { changed: true, state: state(8) };
    },
  };
  const service = createLearningMoreSyncService({
    store,
    client: { pull: async () => ({ courses: [], lessons: [], facts: [] }) },
    createDelta: () => ({ lessons: [{ lessonId: "lesson-1" }], facts: [], incremental: true }),
    commandId: () => "sync-command-1",
    now: () => "2026-07-25T08:00:00.000Z",
  });

  assert.deepEqual(await service.syncOnce(), { status: "changed", revision: 8 });
  assert.deepEqual(calls, [{
    command: {
      type: "learning-more.import",
      lessons: [{ lessonId: "lesson-1" }],
      facts: [],
      incremental: true,
    },
    metadata: {
      expectedRevision: 7,
      commandId: "sync-command-1",
      occurredAt: "2026-07-25T08:00:00.000Z",
    },
  }]);
});

test("server Learning MORE sync coalesces overlapping polls and treats revision races as retryable", async () => {
  let pulls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const conflict = Object.assign(new Error("revision_conflict"), {
    code: "REVISION_CONFLICT",
    currentState: state(9),
  });
  const store = {
    load: () => state(),
    dispatchChange: () => {
      throw conflict;
    },
  };
  const service = createLearningMoreSyncService({
    store,
    client: {
      pull: async () => {
        pulls += 1;
        await gate;
        return { courses: [], lessons: [], facts: [] };
      },
    },
    createDelta: () => ({ facts: [], incremental: true }),
  });

  const first = service.syncOnce();
  const second = service.syncOnce();
  release();

  assert.deepEqual(await first, { status: "conflict", revision: 9 });
  assert.deepEqual(await second, { status: "conflict", revision: 9 });
  assert.equal(pulls, 1);
});
