import { createEmptyWeekUpState, dispatchWeekUp, migrateWeekUpState, type DomainContext, type WeekUpCommand, type WeekUpState } from "./week-up-domain.ts";
import { applyWeekUpStatePatch, type WeekUpStatePatch } from "./state-patch.ts";

export interface WeekUpRepository {
  load(): Promise<WeekUpState>;
  dispatch(state: WeekUpState, command: WeekUpCommand, context: DomainContext): Promise<WeekUpState>;
  replace(state: WeekUpState): Promise<WeekUpState>;
  clear(): Promise<void>;
}

export class MemoryWeekUpRepository implements WeekUpRepository {
  #state: WeekUpState;
  constructor(initial = createEmptyWeekUpState()) { this.#state = structuredClone(initial); }
  async load(): Promise<WeekUpState> { return structuredClone(this.#state); }
  async dispatch(state: WeekUpState, command: WeekUpCommand, context: DomainContext): Promise<WeekUpState> {
    this.#state = structuredClone(dispatchWeekUp(state, command, context).state);
    return structuredClone(this.#state);
  }
  async replace(state: WeekUpState): Promise<WeekUpState> { this.#state = structuredClone(state); return structuredClone(this.#state); }
  async clear(): Promise<void> { this.#state = createEmptyWeekUpState(this.#state.learningMore.baseUrl); }
}

const DATABASE_NAME = "week-up";
const STORE_NAME = "state";
const STATE_KEY = "current";

class WeekUpHttpResponseError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "WeekUpHttpResponseError";
    this.status = status;
  }
}

export class IndexedDbWeekUpRepository implements WeekUpRepository {
  private readonly indexedDb: IDBFactory;

  constructor(indexedDb: IDBFactory = window.indexedDB) { this.indexedDb = indexedDb; }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.indexedDb.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexed_db_open_failed"));
    });
  }

  async load(): Promise<WeekUpState> {
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(STATE_KEY);
        request.onsuccess = () => {
          try { resolve(migrateWeekUpState(request.result)); }
          catch (error) { reject(error); }
        };
        request.onerror = () => reject(request.error ?? new Error("indexed_db_read_failed"));
      });
    } finally { db.close(); }
  }

  private async save(state: WeekUpState): Promise<void> {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("indexed_db_write_failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("indexed_db_write_aborted"));
      });
    } finally { db.close(); }
  }

  async dispatch(state: WeekUpState, command: WeekUpCommand, context: DomainContext): Promise<WeekUpState> {
    const next = dispatchWeekUp(state, command, context).state;
    await this.save(next);
    return next;
  }

  async replace(state: WeekUpState): Promise<WeekUpState> { await this.save(state); return state; }

  async clear(): Promise<void> {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(STATE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("indexed_db_clear_failed"));
      });
    } finally { db.close(); }
  }
}

export class HttpWeekUpRepository implements WeekUpRepository {
  private readonly cache: IndexedDbWeekUpRepository;
  private readonly fetcher: typeof fetch;
  private statusValue: "connecting" | "online" | "offline" = "connecting";
  private readonly statusListeners = new Set<(status: "connecting" | "online" | "offline") => void>();

  constructor(fetcher: typeof fetch = fetch, cache = new IndexedDbWeekUpRepository()) {
    this.fetcher = fetcher.bind(globalThis);
    this.cache = cache;
  }

  get status() { return this.statusValue; }
  subscribeStatus(listener: (status: "connecting" | "online" | "offline") => void): () => void {
    this.statusListeners.add(listener);
    listener(this.statusValue);
    return () => this.statusListeners.delete(listener);
  }
  private setStatus(status: "connecting" | "online" | "offline") {
    if (this.statusValue === status) return;
    this.statusValue = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  startRecovery(
    onRecovered: (state: WeekUpState) => void,
    options: { intervalMs?: number; reload?: () => Promise<WeekUpState> } = {},
  ): () => void {
    const intervalMs = options.intervalMs ?? 5_000;
    const reload = options.reload ?? (() => this.load());
    let stopped = false;
    let inFlight = false;
    const attempt = async () => {
      if (stopped || inFlight || this.statusValue !== "offline") return;
      inFlight = true;
      try {
        const state = await reload();
        if (!stopped) onRecovered(state);
      } catch {
        // load() keeps the repository offline; the next bounded attempt retries.
      } finally {
        inFlight = false;
      }
    };
    const timer = globalThis.setInterval(() => void attempt(), intervalMs);
    void attempt();
    return () => {
      stopped = true;
      globalThis.clearInterval(timer);
    };
  }

  private async request(path: string, init?: RequestInit): Promise<WeekUpState> {
    const response = await this.fetcher(path, {
      ...init,
      headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
    });
    this.setStatus("online");
    const body = await response.json() as { state?: unknown; error?: string };
    if (!response.ok || body.state === undefined) {
      const error = new WeekUpHttpResponseError(body.error ?? `week_up_http_${response.status}`, response.status);
      if (response.status === 409 && body.state !== undefined) (error as Error & { currentState?: WeekUpState }).currentState = migrateWeekUpState(body.state);
      throw error;
    }
    const state = migrateWeekUpState(body.state);
    await this.cache.replace(state);
    this.setStatus("online");
    return state;
  }

  async load(): Promise<WeekUpState> {
    const cached = await this.cache.load();
    try {
      const server = await this.request("/api/state");
      if (server.revision === 0 && cached.revision > 0) {
        return await this.request("/api/migrations/indexed-db", { method: "POST", body: JSON.stringify({ state: cached }) });
      }
      return server;
    } catch (error) {
      if (!(error instanceof WeekUpHttpResponseError)) this.setStatus("offline");
      if (cached.revision > 0) return cached;
      throw error;
    }
  }

  async dispatch(state: WeekUpState, command: WeekUpCommand): Promise<WeekUpState> {
    const commandId = crypto.randomUUID();
    const occurredAt = new Date().toISOString();
    const send = async (current: WeekUpState): Promise<WeekUpState> => {
      const response = await this.fetcher("/api/commands", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "x-week-up-protocol": "patch-v1" },
        body: JSON.stringify({ command, expectedRevision: current.revision, commandId, occurredAt }),
      });
      this.setStatus("online");
      const body = await response.json() as { patch?: WeekUpStatePatch; state?: unknown; error?: string };
      if (!response.ok) {
        const error = new WeekUpHttpResponseError(body.error ?? `week_up_http_${response.status}`, response.status);
        if (response.status === 409 && body.state !== undefined) (error as Error & { currentState?: WeekUpState }).currentState = migrateWeekUpState(body.state);
        throw error;
      }
      if (!body.patch) throw new WeekUpHttpResponseError("week_up_patch_missing", response.status);
      const next = applyWeekUpStatePatch(current, body.patch);
      await this.cache.replace(next);
      return next;
    };
    try {
      return await send(state);
    } catch (error) {
      const current = (error as Error & { currentState?: WeekUpState }).currentState;
      if (current) return await send(current);
      if (!(error instanceof WeekUpHttpResponseError)) this.setStatus("offline");
      throw error;
    }
  }

  async replace(state: WeekUpState): Promise<WeekUpState> {
    return await this.request("/api/state/restore", { method: "POST", body: JSON.stringify({ state }) });
  }

  async clear(): Promise<void> { await this.replace(createEmptyWeekUpState()); }
}
