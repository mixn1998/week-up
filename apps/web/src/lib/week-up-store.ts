import { createEmptyWeekUpState, type DomainContext, type WeekUpCommand, type WeekUpState } from "./week-up-domain.ts";
import type { WeekUpRepository } from "./week-up-repository.ts";

export type WeekUpStore = Readonly<{
  load(): Promise<WeekUpState>;
  refresh(): Promise<WeekUpState>;
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
  let operationQueue: Promise<void> = Promise.resolve();
  const publish = () => listeners.forEach((listener) => listener(state));
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const queued = operationQueue.then(operation);
    operationQueue = queued.then(() => undefined, () => undefined);
    return queued;
  };
  const accept = (next: WeekUpState, shouldPublish = next !== state) => {
    if (shouldPublish) {
      state = next;
      publish();
    }
    return state;
  };
  return {
    load() {
      return enqueue(async () => accept(await repository.load(), true));
    },
    refresh() {
      return enqueue(async () => {
        const next = await repository.refresh(state);
        return accept(next, next.revision !== state.revision);
      });
    },
    snapshot() { return state; },
    dispatch(command) {
      return enqueue(async () => {
        const next = await repository.dispatch(state, command, context);
        return accept(next);
      });
    },
    replace(next) {
      return enqueue(async () => accept(await repository.replace(next), true));
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
