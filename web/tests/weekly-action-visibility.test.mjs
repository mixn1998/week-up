import assert from "node:assert/strict";
import test from "node:test";

import { takeVisibleGroupedRows } from "../lib/weekly-action-visibility.ts";

test("fills the second column when the same card group still has hidden entries", () => {
  const entries = [
    { id: "repeat-1", group: "open:recurring" },
    { id: "single-1", group: "open:single" },
    { id: "single-2", group: "open:single" },
    { id: "single-3", group: "open:single" },
    { id: "single-4", group: "open:single" },
    { id: "course-1", group: "open:course" },
    { id: "course-2", group: "open:course" },
    { id: "course-3", group: "open:course" },
    { id: "course-4", group: "open:course" },
    { id: "course-5", group: "open:course" },
  ];

  const visible = takeVisibleGroupedRows(entries, 8, 2, (entry) => entry.group);

  assert.deepEqual(visible.map((entry) => entry.id), [
    "repeat-1",
    "single-1", "single-2", "single-3", "single-4",
    "course-1", "course-2", "course-3", "course-4",
  ]);
});

test("does not borrow a card from a different group to fill a row", () => {
  const entries = [
    { id: "single-1", group: "open:single" },
    { id: "course-1", group: "open:course" },
  ];

  const visible = takeVisibleGroupedRows(entries, 1, 2, (entry) => entry.group);

  assert.deepEqual(visible.map((entry) => entry.id), ["single-1"]);
});
