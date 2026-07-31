const RUNTIME_MODES = new Set(["local", "hosted"]);
const BASE_PATH = /^\/(?:[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*)?$/;

function runtimeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizeMode(value) {
  const mode = value?.trim() || "local";
  if (!RUNTIME_MODES.has(mode)) throw runtimeError("runtime_mode_invalid");
  return mode;
}

function normalizeBasePath(value) {
  const candidate = value?.trim() || "/";
  const normalized = candidate.length > 1 ? candidate.replace(/\/+$/, "") : candidate;
  const segments = normalized.split("/").filter(Boolean);
  if (
    !BASE_PATH.test(normalized)
    || segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw runtimeError("runtime_base_path_invalid");
  }
  return normalized;
}

function normalizePrincipal(value) {
  if (
    !value
    || typeof value.subject !== "string"
    || value.subject.trim() === ""
    || typeof value.tenantId !== "string"
    || value.tenantId.trim() === ""
    || !Array.isArray(value.roles)
    || value.roles.some((role) => typeof role !== "string" || role.trim() === "")
  ) {
    throw runtimeError("host_identity_invalid");
  }
  return Object.freeze({
    subject: value.subject.trim(),
    tenantId: value.tenantId.trim(),
    roles: Object.freeze([...new Set(value.roles.map((role) => role.trim()))]),
  });
}

export function createRuntimeEnvironment({
  environment = process.env,
  identityAdapter,
} = {}) {
  const mode = normalizeMode(environment.WEEK_UP_RUNTIME_MODE);
  const basePath = normalizeBasePath(environment.WEEK_UP_BASE_PATH);
  const hostedIdentityReady = mode === "hosted"
    && typeof identityAdapter?.authenticate === "function";
  const description = Object.freeze({
    appId: "week-up",
    mode,
    basePath,
    auth: Object.freeze({
      strategy: mode === "local" ? "local-owner" : "host-identity",
      ready: mode === "local" || hostedIdentityReady,
    }),
    capabilities: Object.freeze({
      unifiedIdentity: mode === "hosted",
      multiTenantData: false,
    }),
  });

  return Object.freeze({
    describe() {
      return description;
    },
    async authenticate(request) {
      if (mode === "local") {
        return Object.freeze({
          subject: "local-owner",
          tenantId: "local",
          roles: Object.freeze(["owner"]),
        });
      }
      if (!hostedIdentityReady) throw runtimeError("host_identity_adapter_required");
      return normalizePrincipal(await identityAdapter.authenticate(request));
    },
  });
}
