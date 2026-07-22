import { createEmptyWeekUpState, type DomainContext, type WeekUpCommand, type WeekUpState } from "./week-up-domain.ts";
import type { WeekUpRepository } from "./week-up-repository.ts";

export type WeekUpStore = Readonly<{
  load(): Promise<WeekUpState>;
  snapshot(): WeekUpState;
  dispatch(command: WeekUpCommand): Promise<WeekUpState>;
  replace(state: WeekUpState): Promise<WeekUpState>;
  subscribe(listener: (state: WeekUpState) => void): () => void;
}>;

function defaultContext(): DomainContext {
  return { now: () => new Date().toISOString(), id: (prefix) => `${prefix}-${crypto.randomUUID()}` };
}

export function createWeekUpStore(repository: WeekUpRepository, context = defaultContext()): WeekUpStore {
  let state = createEmptyWeekUpState();
  const listeners = new Set<(value: WeekUpState) => void>();
  let writeQueue = Promise.resolve();
  const publish = () => listeners.forEach((listener) => listener(state));
  return {
    async load() { state = await repository.load(); publish(); return state; },
    snapshot() { return state; },
    async dispatch(command) {
      const operation = writeQueue.then(async () => {
        const next = await repository.dispatch(state, command, context);
        if (next !== state) { state = next; publish(); }
        return state;
      });
      writeQueue = operation.then(() => undefined, () => undefined);
      return operation;
    },
    async replace(next) { state = await repository.replace(next); publish(); return state; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
