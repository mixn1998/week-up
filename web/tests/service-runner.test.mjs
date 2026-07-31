import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../scripts/run-week-up-service.ps1", import.meta.url),
  "utf8",
);
const installerSource = readFileSync(
  new URL("../scripts/install-week-up-autostart.ps1", import.meta.url),
  "utf8",
);
const stableRunnerSource = readFileSync(
  new URL("../scripts/run-current-week-up.ps1", import.meta.url),
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

test("installs one hardened logon task without a periodic trigger", () => {
  assert.match(installerSource, /New-ScheduledTaskTrigger -AtLogOn/);
  assert.doesNotMatch(installerSource, /RepetitionInterval|-Once/);
  assert.match(installerSource, /-RunLevel Highest/);
  assert.match(installerSource, /-DontStopOnIdleEnd/);
  assert.match(installerSource, /-DisallowHardTerminate/);
  assert.match(installerSource, /-RestartCount 999/);
  assert.match(installerSource, /-MultipleInstances IgnoreNew/);
});

test("publishes a lightweight release and starts it through one stable version pointer", () => {
  assert.match(installerSource, /runtime-release\.mjs/);
  assert.match(installerSource, /--install-root \$InstallRoot --data-root \$DataRoot/);
  assert.match(installerSource, /run-current-week-up\.ps1/);
  assert.match(stableRunnerSource, /current\.json/);
  assert.match(stableRunnerSource, /versions/);
  assert.match(stableRunnerSource, /-ProjectRoot \$releaseRoot/);
  assert.match(stableRunnerSource, /install and user data roots must not overlap/);
});
