import type { PlanItem } from "./demo-model";
import type { AttributeCategoryRecord, PlanRecord, ProjectRecord } from "./week-up-domain";

export type ProjectCategoryContribution = Readonly<{
  categoryId: string;
  label: string;
  color?: string;
  xp: number;
}>;

export function aggregateProjectCategoryContributions(
  plans: readonly PlanItem[],
  planRecords: readonly PlanRecord[],
  projects: readonly ProjectRecord[],
  projectCategories: readonly AttributeCategoryRecord[] = [],
): ProjectCategoryContribution[] {
  const recordById = new Map(planRecords.map((record) => [record.id, record]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const categoryByName = new Map(projectCategories.map((category) => [category.name, category]));
  const learningMoreCategory = projectCategories.find((category) => category.integrationKey === "learning-more");
  const totals = new Map<string, ProjectCategoryContribution>();

  for (const plan of plans) {
    if (!plan.completed) continue;
    const xp = plan.rewards.reduce((sum, reward) => sum + reward.amount, 0);
    if (xp <= 0) continue;

    const record = recordById.get(plan.id);
    const project = record?.projectId ? projectById.get(record.projectId) : undefined;
    const storedLabel = project?.category.trim() || record?.category.trim() || plan.category.trim() || "未分类";
    const configuredCategory = record?.source === "learning-more" || plan.source === "learning-more"
      ? learningMoreCategory ?? categoryByName.get(storedLabel)
      : categoryByName.get(storedLabel);
    const categoryId = configuredCategory?.id ?? `legacy:${storedLabel}`;
    const current = totals.get(categoryId);
    totals.set(categoryId, {
      categoryId,
      label: configuredCategory?.name ?? storedLabel,
      ...(configuredCategory?.color ? { color: configuredCategory.color } : {}),
      xp: (current?.xp ?? 0) + xp,
    });
  }

  return Array.from(totals.values()).sort(
    (left, right) => right.xp - left.xp || left.label.localeCompare(right.label, "zh-CN"),
  );
}
