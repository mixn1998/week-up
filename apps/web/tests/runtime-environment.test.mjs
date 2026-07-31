import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createRuntimeEnvironment } from "../server/runtime-environment.mjs";

test("local mode exposes the future host contract without enabling hosted identity", async () => {
  const runtime = createRuntimeEnvironment({ environment: {} });

  assert.deepEqual(runtime.describe(), {
    appId: "week-up",
    mode: "local",
    basePath: "/",
    auth: { strategy: "local-owner", ready: true },
    capabilities: {
      unifiedIdentity: false,
      multiTenantData: false,
    },
  });
  assert.deepEqual(await runtime.authenticate({}), {
    subject: "local-owner",
    tenantId: "local",
    roles: ["owner"],
  });
});

test("hosted mode publishes its expected mount path but fails closed without an identity adapter", async () => {
  const runtime = createRuntimeEnvironment({
    environment: {
      WEEK_UP_RUNTIME_MODE: "hosted",
      WEEK_UP_BASE_PATH: "/apps/week-up/",
    },
  });

  assert.deepEqual(runtime.describe(), {
    appId: "week-up",
    mode: "hosted",
    basePath: "/apps/week-up",
    auth: { strategy: "host-identity", ready: false },
    capabilities: {
      unifiedIdentity: true,
      multiTenantData: false,
    },
  });
  await assert.rejects(runtime.authenticate({}), /host_identity_adapter_required/);
});

test("hosted identity can only enter through an explicitly injected adapter", async () => {
  const requests = [];
  const runtime = createRuntimeEnvironment({
    environment: { WEEK_UP_RUNTIME_MODE: "hosted" },
    identityAdapter: {
      async authenticate(request) {
        requests.push(request);
        return { subject: "person-42", tenantId: "account-7", roles: ["member"] };
      },
    },
  });
  const request = { headers: { authorization: "handled-by-future-host" } };

  assert.equal(runtime.describe().auth.ready, true);
  assert.deepEqual(await runtime.authenticate(request), {
    subject: "person-42",
    tenantId: "account-7",
    roles: ["member"],
  });
  assert.deepEqual(requests, [request]);
});

test("runtime mode and base path reject ambiguous deployment values", () => {
  assert.throws(
    () => createRuntimeEnvironment({ environment: { WEEK_UP_RUNTIME_MODE: "public" } }),
    /runtime_mode_invalid/,
  );
  assert.throws(
    () => createRuntimeEnvironment({ environment: { WEEK_UP_BASE_PATH: "apps/week-up" } }),
    /runtime_base_path_invalid/,
  );
  assert.throws(
    () => createRuntimeEnvironment({ environment: { WEEK_UP_BASE_PATH: "/apps/../admin" } }),
    /runtime_base_path_invalid/,
  );
});

test("server exposes only public runtime metadata before authenticating application routes", async () => {
  const server = await readFile(new URL("../server/server.mjs", import.meta.url), "utf8");

  assert.match(server, /createRuntimeEnvironment/);
  assert.match(server, /url\.pathname === "\/api\/runtime"/);
  assert.match(server, /await runtime\.authenticate\(request\)/);
});
