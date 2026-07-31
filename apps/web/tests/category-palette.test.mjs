import assert from "node:assert/strict";
import test from "node:test";

import {
  colorForCategory,
  colorIdForCategory,
  paletteColorValue,
  readableTextColor,
} from "../src/lib/category-palette.ts";

test("uses configured project category colors before deterministic fallbacks", () => {
  assert.equal(colorForCategory("任意类别", "violet"), "#7457ff");
  assert.equal(colorForCategory("用户改名后的课程类别", "mint"), "#79f2b5");
  assert.equal(colorForCategory("Learning MORE"), paletteColorValue(colorIdForCategory("Learning MORE")));
  assert.equal(colorForCategory("稳定类别"), paletteColorValue(colorIdForCategory("稳定类别")));
});

test("chooses readable ink or white text for palette backgrounds", () => {
  assert.equal(readableTextColor("#ffe05b"), "#302447");
  assert.equal(readableTextColor("#7457ff"), "#ffffff");
  assert.equal(readableTextColor("#ff4d9e"), "#302447");
});
