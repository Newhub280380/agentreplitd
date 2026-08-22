import { desc, eq } from "drizzle-orm";
import {
  activitiesTable,
  agentMemoriesTable,
  agentRunsTable,
  builderJobsTable,
  contentItemsTable,
  db,
  insightsTable,
} from "@workspace/db";

const now = () => new Date();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

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
  agent: string,
  title: string,
  detail: string,
  status: "success" | "running" | "warning" | "failed",
): Promise<void> {
  await db.insert(activitiesTable).values({
    id: id("act"),
    agent,
    title,
    detail,
    status,
    timestamp: now(),
  });
}

export async function getRuns() {
  await ensureAgent360Seed();
  return db.select().from(agentRunsTable).orderBy(desc(agentRunsTable.startedAt));
}

export async function getRun(idValue: string) {
  await ensureAgent360Seed();
  const [run] = await db.select().from(agentRunsTable).where(eq(agentRunsTable.id, idValue));
  return run;
}

export async function createRun(command: string, kind: string, steps: unknown[]) {
  const run = {
    id: id("run"),
    command,
    kind,
    status: "running",
    startedAt: now(),
    finishedAt: null,
    summary: null,
    steps,
  };
  await db.insert(agentRunsTable).values(run);
  await addActivity("Оркестратор", "Запустил сценарий", command, "running");
  return run;
}

export async function completeRun(
  runId: string,
  summary: string,
  steps: unknown[],
): Promise<void> {
  await db
    .update(agentRunsTable)
    .set({ status: "completed", finishedAt: now(), summary, steps })
    .where(eq(agentRunsTable.id, runId));
  await addActivity("Оркестратор", "Сценарий завершён", summary, "success");
}

export async function getInsights() {
  await ensureAgent360Seed();
  return db.select().from(insightsTable).orderBy(desc(insightsTable.createdAt));
}

export async function addAnalysisInsights(niche: string): Promise<void> {
  const createdAt = now();
  await db.insert(insightsTable).values([
    {
      id: id("ins"),
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
    scope: "analysis",
    content: `Ниша: ${niche}. Приоритет: сравнение решений и измеримый результат.`,
    embedding: null,
    createdAt,
  });
  await addActivity("Аналитик", "Сформировал инсайт", `Ниша: ${niche}`, "success");
}

export async function getContent() {
  await ensureAgent360Seed();
  return db.select().from(contentItemsTable).orderBy(desc(contentItemsTable.createdAt));
}

export async function createContent(topic: string, channels: string[], tone?: string) {
  const item = {
    id: id("content"),
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
  await addActivity("Продавец", "Сгенерировал черновик", item.title, "success");
  return item;
}

export async function publishContent(idValue: string, channels: string[]) {
  const [existing] = await db.select().from(contentItemsTable).where(eq(contentItemsTable.id, idValue));
  if (!existing) return null;
  const [item] = await db
    .update(contentItemsTable)
    .set({ channels, status: "published" })
    .where(eq(contentItemsTable.id, idValue))
    .returning();
  await addActivity("Продавец", "Поставил публикацию", `${item.title} → ${channels.join(", ")}`, "warning");
  return item;
}

export async function getBuilderJobs() {
  await ensureAgent360Seed();
  return db.select().from(builderJobsTable).orderBy(desc(builderJobsTable.createdAt));
}

export async function createBuilderJob(kind: string, instruction: string, packageManager: string) {
  const job = {
    id: id("build"),
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
  await addActivity("Сборщик", "Принял задачу", instruction, "running");
  return job;
}

export async function updateBuilderJob(
  idValue: string,
  status: string,
  attempts: number,
  logs: string[],
) {
  const [job] = await db
    .update(builderJobsTable)
    .set({ status, attempts: String(attempts), logs })
    .where(eq(builderJobsTable.id, idValue))
    .returning();
  return job;
}

export async function getBuilderJob(idValue: string) {
  const [job] = await db.select().from(builderJobsTable).where(eq(builderJobsTable.id, idValue));
  return job;
}