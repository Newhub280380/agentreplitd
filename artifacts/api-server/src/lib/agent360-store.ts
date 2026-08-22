import { and, desc, eq, sql } from "drizzle-orm";
import {
  activitiesTable,
  agentMemoriesTable,
  agentRunsTable,
  builderJobsTable,
  contentItemsTable,
  db,
  insightsTable,
  workspaceUsageTable,
  workspacesTable,
} from "@workspace/db";

const now = () => new Date();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

export const planCatalog = {
  free: {
    id: "free",
    name: "Базовый",
    priceLabel: "Бесплатно",
    description: "Для знакомства с агентами и первых сценариев.",
    limits: { runs: 10, content: 15, builderJobs: 3 },
  },
  starter: {
    id: "starter",
    name: "Старт",
    priceLabel: "Скоро",
    description: "Для регулярной работы одного эксперта.",
    limits: { runs: 100, content: 250, builderJobs: 30 },
  },
  pro: {
    id: "pro",
    name: "Профессиональный",
    priceLabel: "Скоро",
    description: "Для интенсивных исследований и контент-пайплайна.",
    limits: { runs: 500, content: 1000, builderJobs: 120 },
  },
} as const;

export type PlanId = keyof typeof planCatalog;
type UsageResource = keyof (typeof planCatalog)["free"]["limits"];

function monthStart(): Date {
  const date = now();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export async function ensureWorkspace(userId: string) {
  const [existing] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.userId, userId));
  if (existing) return existing;

  try {
    const [workspace] = await db
      .insert(workspacesTable)
      .values({
        id: id("workspace"),
        userId,
        name: "Моё рабочее пространство",
        plan: "free",
      })
      .returning();
    await addActivity(workspace.id, "Оркестратор", "Рабочая область готова", "Подключён базовый тариф и личная память.", "success");
    return workspace;
  } catch {
    const [workspace] = await db
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.userId, userId));
    if (!workspace) throw new Error("Unable to create workspace");
    return workspace;
  }
}

export async function getAccountOverview(userId: string) {
  const workspace = await ensureWorkspace(userId);
  const plan = planCatalog[(workspace.plan in planCatalog ? workspace.plan : "free") as PlanId];
  const start = monthStart();
  const [usage] = await db
    .select()
    .from(workspaceUsageTable)
    .where(and(eq(workspaceUsageTable.workspaceId, workspace.id), eq(workspaceUsageTable.periodStart, start)));

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      plan: plan.id,
      createdAt: workspace.createdAt.toISOString(),
    },
    plan,
    usage: {
      periodStart: start.toISOString(),
      runs: usage?.runs ?? 0,
      content: usage?.content ?? 0,
      builderJobs: usage?.builderJobs ?? 0,
      limits: plan.limits,
    },
    plans: Object.values(planCatalog),
  };
}

async function consumeQuota(workspaceId: string, planId: string, resource: UsageResource): Promise<boolean> {
  const plan = planCatalog[(planId in planCatalog ? planId : "free") as PlanId];
  const start = monthStart();
  const column = sql.identifier({
    runs: "runs",
    content: "content",
    builderJobs: "builder_jobs",
  }[resource]);
  const usage = sql.identifier("usage");
  const result = await db.execute(sql`
    INSERT INTO ${workspaceUsageTable} AS ${usage} (${sql.identifier("workspace_id")}, ${sql.identifier("period_start")}, ${column})
    VALUES (${workspaceId}, ${start}, 1)
    ON CONFLICT (${sql.identifier("workspace_id")}, ${sql.identifier("period_start")})
    DO UPDATE SET ${column} = ${usage}.${column} + 1
    WHERE ${usage}.${column} < ${plan.limits[resource]}
    RETURNING ${column}
  `);
  return result.rows.length > 0;
}

const seedActivities = [
  {
    id: "act_boot",
    agent: "Оркестратор",
    title: "Контур 360 готов",
    detail: "Четыре агента подключены к единому журналу и памяти.",
    status: "success",
  },
  {
    id: "act_sources",
    agent: "Аналитик",
    title: "Источники проверены",
    detail: "YouTube, Google, Telegram и TikTok ждут запуска анализа.",
    status: "warning",
  },
];

let seedPromise: Promise<void> | undefined;

export function ensureAgent360Seed(): Promise<void> {
  seedPromise ??= seed();
  return seedPromise;
}

async function seed(): Promise<void> {
  const [run] = await db.select().from(agentRunsTable).limit(1);
  if (run) return;

  const startedAt = now();
  await db.insert(agentRunsTable).values({
    id: "run_welcome",
    command: "Подготовить рабочий контур Агент-мультитул 360",
    kind: "full_pipeline",
    status: "completed",
    startedAt,
    finishedAt: startedAt,
    summary: "Контур управления готов к первой команде.",
    steps: [
      { agent: "Оркестратор", label: "Собрал план", status: "completed", detail: "4 агента" },
      { agent: "Аналитик", label: "Подготовил источники", status: "completed", detail: "4 канала" },
      { agent: "Продавец", label: "Открыл контент-пайплайн", status: "completed", detail: "3 соцсети" },
      { agent: "Сборщик", label: "Проверил окружение", status: "completed", detail: "логирование включено" },
    ],
  });

  await db.insert(insightsTable).values([
    {
      id: "ins_1",
      trend: "Короткие демонстрации «до / после»",
      reach: "Высокий — вертикальное видео",
      emotion: "Любопытство",
      conclusion: "Показывайте эффект продукта в первые 2 секунды и добавляйте конкретный результат.",
      source: "Готово к анализу",
      score: "91",
      createdAt: startedAt,
    },
    {
      id: "ins_2",
      trend: "Разбор реального опыта клиентов",
      reach: "Средний — вовлечённые сообщества",
      emotion: "Доверие",
      conclusion: "Собирайте кейсы и превращайте их в серию экспертных постов с CTA.",
      source: "Готово к анализу",
      score: "84",
      createdAt: startedAt,
    },
  ]);

  await db.insert(contentItemsTable).values({
    id: "content_welcome",
    title: "Проверочный контент-пайплайн",
    body: "Система готова собрать пост из новых инсайтов: выберите нишу в разделе аналитики.",
    channels: ["telegram", "vk"],
    status: "draft",
    createdAt: startedAt,
  });

  await db.insert(activitiesTable).values(
    seedActivities.map((activity) => ({ ...activity, timestamp: startedAt })),
  );

  await db.insert(agentMemoriesTable).values({
    id: "memory_welcome",
    scope: "system",
    content: "Базовая память Агента-мультитула 360: аналитика → контент → публикация → сборка.",
    embedding: null,
    createdAt: startedAt,
  });
}

export async function addActivity(
  workspaceId: string,
  agent: string,
  title: string,
  detail: string,
  status: "success" | "running" | "warning" | "failed",
): Promise<void> {
  await db.insert(activitiesTable).values({
    id: id("act"),
    workspaceId,
    agent,
    title,
    detail,
    status,
    timestamp: now(),
  });
}

export async function getActivities(workspaceId: string) {
  return db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.workspaceId, workspaceId))
    .orderBy(desc(activitiesTable.timestamp))
    .limit(20);
}

export async function getRuns(workspaceId: string) {
  return db
    .select()
    .from(agentRunsTable)
    .where(eq(agentRunsTable.workspaceId, workspaceId))
    .orderBy(desc(agentRunsTable.startedAt));
}

export async function getRun(workspaceId: string, idValue: string) {
  const [run] = await db
    .select()
    .from(agentRunsTable)
    .where(and(eq(agentRunsTable.workspaceId, workspaceId), eq(agentRunsTable.id, idValue)));
  return run;
}

export async function createRun(
  workspaceId: string,
  planId: string,
  command: string,
  kind: string,
  steps: unknown[],
) {
  if (!(await consumeQuota(workspaceId, planId, "runs"))) return null;
  const run = {
    id: id("run"),
    workspaceId,
    command,
    kind,
    status: "running",
    startedAt: now(),
    finishedAt: null,
    summary: null,
    steps,
  };
  await db.insert(agentRunsTable).values(run);
  await addActivity(workspaceId, "Оркестратор", "Запустил сценарий", command, "running");
  return run;
}

export async function completeRun(
  workspaceId: string,
  runId: string,
  summary: string,
  steps: unknown[],
): Promise<void> {
  await db
    .update(agentRunsTable)
    .set({ status: "completed", finishedAt: now(), summary, steps })
    .where(and(eq(agentRunsTable.workspaceId, workspaceId), eq(agentRunsTable.id, runId)));
  await addActivity(workspaceId, "Оркестратор", "Сценарий завершён", summary, "success");
}

export async function getInsights(workspaceId: string) {
  return db
    .select()
    .from(insightsTable)
    .where(eq(insightsTable.workspaceId, workspaceId))
    .orderBy(desc(insightsTable.createdAt));
}

export async function addAnalysisInsights(workspaceId: string, niche: string): Promise<void> {
  const createdAt = now();
  await db.insert(insightsTable).values([
    {
      id: id("ins"),
      workspaceId,
      trend: `Поисковый спрос вокруг «${niche}»`,
      reach: "Требуется живой сбор источников",
      emotion: "Намерение сравнить",
      conclusion: `Создайте пост-навигатор: проблема → решение → измеримый результат для ниши «${niche}».`,
      source: "Оркестратор — гибридный план",
      score: "78",
      createdAt,
    },
  ]);
  await db.insert(agentMemoriesTable).values({
    id: id("memory"),
    workspaceId,
    scope: "analysis",
    content: `Ниша: ${niche}. Приоритет: сравнение решений и измеримый результат.`,
    embedding: null,
    createdAt,
  });
  await addActivity(workspaceId, "Аналитик", "Сформировал инсайт", `Ниша: ${niche}`, "success");
}

export async function getContent(workspaceId: string) {
  return db
    .select()
    .from(contentItemsTable)
    .where(eq(contentItemsTable.workspaceId, workspaceId))
    .orderBy(desc(contentItemsTable.createdAt));
}

export async function createContent(
  workspaceId: string,
  planId: string,
  topic: string,
  channels: string[],
  tone?: string,
) {
  if (!(await consumeQuota(workspaceId, planId, "content"))) return null;
  const item = {
    id: id("content"),
    workspaceId,
    title: `Контент: ${topic}`,
    body: [
      `«${topic}» — не ещё одна задача в списке, а точка роста.`,
      "Мы собрали сигнал рынка, выделили барьер клиента и сформулировали действие, которое можно проверить уже сегодня.",
      `Тон: ${tone ?? "уверенный и полезный"}. Напишите, если нужен разбор под ваш продукт.`,
    ].join("\n\n"),
    channels,
    status: "draft",
    imageUrl: null,
    createdAt: now(),
  };
  await db.insert(contentItemsTable).values(item);
  await addActivity(workspaceId, "Продавец", "Сгенерировал черновик", item.title, "success");
  return item;
}

export async function publishContent(workspaceId: string, idValue: string, channels: string[]) {
  const [existing] = await db
    .select()
    .from(contentItemsTable)
    .where(and(eq(contentItemsTable.workspaceId, workspaceId), eq(contentItemsTable.id, idValue)));
  if (!existing) return null;
  const [item] = await db
    .update(contentItemsTable)
    .set({ channels, status: "published" })
    .where(and(eq(contentItemsTable.workspaceId, workspaceId), eq(contentItemsTable.id, idValue)))
    .returning();
  await addActivity(workspaceId, "Продавец", "Поставил публикацию", `${item.title} → ${channels.join(", ")}`, "warning");
  return item;
}

export async function getBuilderJobs(workspaceId: string) {
  return db
    .select()
    .from(builderJobsTable)
    .where(eq(builderJobsTable.workspaceId, workspaceId))
    .orderBy(desc(builderJobsTable.createdAt));
}

export async function createBuilderJob(
  workspaceId: string,
  planId: string,
  kind: string,
  instruction: string,
  packageManager: string,
) {
  if (!(await consumeQuota(workspaceId, planId, "builderJobs"))) return null;
  const job = {
    id: id("build"),
    workspaceId,
    kind,
    instruction,
    packageManager,
    status: "running",
    attempts: "1",
    createdAt: now(),
    logs: [
      `${new Date().toISOString()} — job accepted`,
      "Safe mode: package names are validated before any installer is called.",
    ],
  };
  await db.insert(builderJobsTable).values(job);
  await addActivity(workspaceId, "Сборщик", "Принял задачу", instruction, "running");
  return job;
}

export async function updateBuilderJob(
  workspaceId: string,
  idValue: string,
  status: string,
  attempts: number,
  logs: string[],
) {
  const [job] = await db
    .update(builderJobsTable)
    .set({ status, attempts: String(attempts), logs })
    .where(and(eq(builderJobsTable.workspaceId, workspaceId), eq(builderJobsTable.id, idValue)))
    .returning();
  return job;
}

export async function getBuilderJob(workspaceId: string, idValue: string) {
  const [job] = await db
    .select()
    .from(builderJobsTable)
    .where(and(eq(builderJobsTable.workspaceId, workspaceId), eq(builderJobsTable.id, idValue)));
  return job;
}