import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../scripts/run-week-up-service.ps1", import.meta.url),
  "utf8",
);

test("keeps recoverable Node stderr from terminating the persistent service runner", () => {
  assert.match(
    source,
    /\$ErrorActionPreference = "Continue"\s+& \$nodeExe \$serverPath \*>> \$logPath/,
  );
  assert.match(
    source,
    /\$nodeExitCode = \$LASTEXITCODE\s+\$ErrorActionPreference = "Stop"/,
  );
});
