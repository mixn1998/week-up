export type MilestoneNodeKind = "start" | "week" | "finish";

export type MilestoneNodePosition = Readonly<{
  id: string;
  kind: MilestoneNodeKind;
  x: number;
  y: number;
  lane?: number;
}>;

export const MILESTONE_ROUTE_START_X = 0;
export const MILESTONE_ROUTE_END_X = 1200;
export const MILESTONE_START_NODE_X = 7;
export const MILESTONE_FINISH_NODE_X = 92;

export function milestoneNodeX(kind: MilestoneNodeKind, dateX: number): number {
  if (kind === "start") return MILESTONE_START_NODE_X;
  if (kind === "finish") return MILESTONE_FINISH_NODE_X;
  return dateX;
}

export function milestoneRouteY(mapHeight: number, lanePercent: number): number {
  return (lanePercent / 100) * mapHeight + 40;
}

export function getFullWidthMilestoneRoute(lane: number, y: number): Readonly<{
  start: number;
  end: number;
  width: number;
  path: string;
}> {
  const start = MILESTONE_ROUTE_START_X;
  const end = MILESTONE_ROUTE_END_X;
  const width = end - start;
  const firstStep = lane % 2 ? 14 : -14;
  const secondStep = lane % 2 ? 18 : -18;
  return {
    start,
    end,
    width,
    path: `M${start} ${y}h${width * .18}v${firstStep}h${width * .2}v${-firstStep}h${width * .24}v${secondStep}h${width * .2}v${-secondStep}h${width * .18}v22H${start}z`,
  };
}

export function selectMilestoneMapGoals(goals: readonly GoalRecord[]): Readonly<{
  directions: readonly GoalRecord[];
  weeklyGoals: readonly GoalRecord[];
}> {
  return {
    directions: goals.filter((goal) => goal.period === "month"),
    weeklyGoals: goals.filter((goal) => goal.period === "week" && Boolean(goal.archivedAt)),
  };
}

const NODE_BOX = {
  start: { width: 8, height: 14 },
  week: { width: 10, height: 16 },
  finish: { width: 18, height: 22 },
} as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function overlaps(a: MilestoneNodePosition, b: MilestoneNodePosition): boolean {
  const aBox = NODE_BOX[a.kind];
  const bBox = NODE_BOX[b.kind];
  return Math.abs(a.x - b.x) < (aBox.width + bBox.width) / 2 + 2
    && Math.abs(a.y - b.y) < (aBox.height + bBox.height) / 2 + 2;
}

export function resolveMilestoneNodePositions<T extends MilestoneNodePosition>(items: readonly T[]): T[] {
  const placed: T[] = [];
  const byId = new Map<string, T>();
  const anchorOrder: Record<MilestoneNodeKind, number> = { start: 0, finish: 0, week: 1 };
  const ordered = [...items].sort((a, b) => anchorOrder[a.kind] - anchorOrder[b.kind] || a.x - b.x || a.id.localeCompare(b.id));

  for (const item of ordered) {
    const box = NODE_BOX[item.kind];
    const candidates = [{ x: item.x, y: item.y }];
    for (let y = 10; y <= 86; y += 2) {
      for (let x = 4; x <= 96; x += 2) candidates.push({ x, y });
    }
    const uniqueCandidates = [...new Map(candidates.map((candidate) => {
      const x = clamp(candidate.x, box.width / 2 + 3, 97 - box.width / 2);
      const y = clamp(candidate.y, box.height / 2 + 6, 88 - box.height / 2);
      return [`${x}:${y}`, { x, y }];
    })).values()].sort((a, b) => {
      if (items.length >= 10 && item.lane === undefined) return a.y - b.y || a.x - b.x;
      const laneWeight = item.lane === undefined ? .72 : 4;
      const aDistance = Math.abs(a.x - item.x) + Math.abs(a.y - item.y) * laneWeight;
      const bDistance = Math.abs(b.x - item.x) + Math.abs(b.y - item.y) * laneWeight;
      return aDistance - bDistance || a.y - b.y || a.x - b.x;
    });
    let positioned: T | undefined;

    for (const candidate of uniqueCandidates) {
      const next = {
        ...item,
        x: candidate.x,
        y: candidate.y,
      } as T;
      if (placed.every((existing) => !overlaps(next, existing))) {
        positioned = next;
        break;
      }
    }

    const resolved = positioned ?? item;
    placed.push(resolved);
    byId.set(resolved.id, resolved);
  }

  return items.map((item) => byId.get(item.id) ?? item);
}
import type { GoalRecord } from "./week-up-domain";
