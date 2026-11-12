import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  activitiesTable,
  agentMemoriesTable,
  agentRunsTable,
  builderJobsTable,
  channelConnectionsTable,
  contentItemsTable,
  db,
  insightsTable,
  medicalDossiersTable,
  publishDeliveriesTable,
  stripeEventsTable,
  workspaceUsageTable,
  workspacesTable,
} from "@workspace/db";

const now = () => new Date();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

export type ChannelProvider = "telegram" | "vk" | "instagram";

const channelDefinitions: Record<
  ChannelProvider,
  { provider: string; targetHint: string }
> = {
  telegram: {
    provider: "Telegram Bot API",
    targetHint: "username канала или chat ID",
  },
  vk: {
    provider: "VK API",
    targetHint: "ID сообщества или публичный screen name",
  },
  instagram: {
    provider: "Instagram Graph API",
    targetHint: "ID бизнес-аккаунта",
  },
};

function credentialKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to protect channel credentials.");
  return createHash("sha256").update(secret).digest();
}

function encryptCredential(credential: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(credential, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function decryptCredential(ciphertext: string | null): string | null {
  if (!ciphertext) return null;
  try {
    const payload = Buffer.from(ciphertext, "base64url");
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", credentialKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function connectionDetail(
  provider: ChannelProvider,
  target: string,
  status: string,
  lastCheckedAt: Date | null,
  lastError: string | null,
): string {
  if (status !== "connected") {
    return lastError ?? `Секрет канала не настроен. Добавьте его в Replit Secrets, затем повторите проверку.`;
  }
  const checked = lastCheckedAt
    ? ` Проверено ${lastCheckedAt.toISOString()}.`
    : "";
  return `${channelDefinitions[provider].provider}: ${target}.${checked}`;
}

export function isSupportedChannel(provider: string): provider is ChannelProvider {
  return provider in channelDefinitions;
}

export async function verifyChannelTarget(
  provider: ChannelProvider,
  target: string,
  credential: string,
): Promise<{ verified: boolean; detail: string; target: string | null }> {
  try {
    if (provider === "telegram") {
      const botResponse = await fetch(`https://api.telegram.org/bot${credential}/getMe`, {
        signal: AbortSignal.timeout(10_000),
      });
      const bot = (await botResponse.json()) as { ok?: boolean; result?: { id?: number } };
      if (!botResponse.ok || !bot.ok || !bot.result?.id) {
        return { verified: false, detail: "Telegram не подтвердил доступ бота.", target: null };
      }
      const chatResponse = await fetch(
        `https://api.telegram.org/bot${credential}/getChat?${new URLSearchParams({ chat_id: target })}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      const chat = (await chatResponse.json()) as { ok?: boolean; result?: { id?: number } };
      if (!chatResponse.ok || !chat.ok || !chat.result?.id) {
        return { verified: false, detail: "Telegram не подтвердил указанную цель.", target: null };
      }
      const verifiedTarget = String(chat.result.id);
      const membershipResponse = await fetch(
        `https://api.telegram.org/bot${credential}/getChatMember?${new URLSearchParams({
          chat_id: verifiedTarget,
          user_id: String(bot.result.id),
        })}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      const membership = (await membershipResponse.json()) as {
        ok?: boolean;
        result?: { status?: string; can_post_messages?: boolean };
      };
      const canPublish = membership.result?.status === "creator"
        || (membership.result?.status === "administrator" && membership.result.can_post_messages !== false);
      return canPublish
        ? { verified: true, detail: "Telegram подтвердил права бота на эту цель.", target: verifiedTarget }
        : { verified: false, detail: "У бота нет прав администратора на указанную Telegram-цель.", target: null };
    }

    if (provider === "vk") {
      if (!/^\d+$/.test(target.replace(/^-/, ""))) {
        return { verified: false, detail: "Для VK укажите числовой ID сообщества.", target: null };
      }
      const response = await fetch("https://api.vk.com/method/groups.getCallbackSettings", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: credential,
          group_id: target.replace(/^-/, ""),
          v: "5.199",
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const payload = (await response.json()) as { response?: unknown; error?: unknown };
      const verifiedTarget = target.replace(/^-/, "");
      return response.ok && !payload.error && payload.response
        ? { verified: true, detail: "VK подтвердил права токена для указанного сообщества.", target: verifiedTarget }
        : { verified: false, detail: "VK не подтвердил доступ к указанному сообществу.", target: null };
    }

    return { verified: false, detail: "Подключение Instagram пока недоступно.", target: null };
  } catch {
    return { verified: false, detail: "Не удалось проверить канал. Повторите попытку позже.", target: null };
  }
}

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
    priceLabel: "$9 / месяц",
    description: "Для регулярной работы одного эксперта.",
    limits: { runs: 100, content: 250, builderJobs: 30 },
  },
  pro: {
    id: "pro",
    name: "Профессиональный",
    priceLabel: "$29 / месяц",
    description: "Для интенсивных исследований и контент-пайплайна.",
    limits: { runs: 500, content: 1000, builderJobs: 120 },
  },
} as const;

export type PlanId = keyof typeof planCatalog;
type UsageResource = keyof (typeof planCatalog)["free"]["limits"];
const billableSubscriptionStatuses = new Set(["active", "trialing"]);

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
    subscription: {
      provider: "stripe",
      status: workspace.subscriptionStatus,
      currentPeriodEnd: workspace.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: workspace.cancelAtPeriodEnd,
      manageAvailable: Boolean(workspace.stripeCustomerId),
    },
    plans: Object.values(planCatalog),
  };
}

export async function persistStripeCustomer(workspaceId: string, stripeCustomerId: string): Promise<void> {
  await db
    .update(workspacesTable)
    .set({ stripeCustomerId })
    .where(eq(workspacesTable.id, workspaceId));
}

export async function getWorkspaceByStripeCustomerId(stripeCustomerId: string) {
  const [workspace] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.stripeCustomerId, stripeCustomerId));
  return workspace ?? null;
}

export async function reserveStripeCheckout(workspaceId: string, planId: string): Promise<Date | null> {
  const currentTime = now();
  const expiresAt = new Date(currentTime.getTime() + 31 * 60 * 1_000);
  const reserved = await db
    .update(workspacesTable)
    .set({
      pendingPlan: planId,
      checkoutExpiresAt: expiresAt,
      stripeCheckoutSessionId: null,
    })
    .where(
      and(
        eq(workspacesTable.id, workspaceId),
        or(isNull(workspacesTable.checkoutExpiresAt), lt(workspacesTable.checkoutExpiresAt, currentTime)),
      ),
    )
    .returning({ id: workspacesTable.id });
  return reserved.length === 1 ? expiresAt : null;
}

export async function persistStripeCheckoutSession(workspaceId: string, sessionId: string): Promise<void> {
  await db
    .update(workspacesTable)
    .set({ stripeCheckoutSessionId: sessionId })
    .where(eq(workspacesTable.id, workspaceId));
}

export async function releaseStripeCheckout(workspaceId: string): Promise<void> {
  await db
    .update(workspacesTable)
    .set({ pendingPlan: null, checkoutExpiresAt: null, stripeCheckoutSessionId: null })
    .where(eq(workspacesTable.id, workspaceId));
}

export async function applyStripeSubscriptionState({
  eventId,
  eventCreatedAt,
  workspaceId,
  stripeCustomerId,
  stripeSubscriptionId,
  status,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  planId,
}: {
  eventId: string;
  eventCreatedAt: Date;
  workspaceId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  planId: string;
}): Promise<"applied" | "duplicate" | "stale" | "conflict"> {
  const isPaidPlan = planId in planCatalog && planId !== "free";
  const plan = isPaidPlan && billableSubscriptionStatuses.has(status) ? planId : "free";

  return db.transaction(async (tx) => {
    const lockedWorkspace = await tx.execute<{ id: string }>(
      sql`SELECT id FROM ${workspacesTable} WHERE id = ${workspaceId} FOR UPDATE`,
    );
    if (lockedWorkspace.rows.length === 0) return "stale";

    const inserted = await tx
      .insert(stripeEventsTable)
      .values({ id: eventId, workspaceId, createdAt: eventCreatedAt })
      .onConflictDoNothing()
      .returning({ id: stripeEventsTable.id });
    if (inserted.length === 0) return "duplicate";

    const [current] = await tx
      .select({
        stripeSubscriptionId: workspacesTable.stripeSubscriptionId,
        subscriptionStatus: workspacesTable.subscriptionStatus,
        lastStripeEventCreatedAt: workspacesTable.lastStripeEventCreatedAt,
        lastStripeEventId: workspacesTable.lastStripeEventId,
      })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId));
    if (
      !current ||
      (current.lastStripeEventCreatedAt &&
        (current.lastStripeEventCreatedAt > eventCreatedAt ||
          (current.lastStripeEventCreatedAt.getTime() === eventCreatedAt.getTime() &&
              (current.lastStripeEventId ?? "") >= eventId)))
    ) {
      return "stale";
    }

    const currentSubscriptionIsBillable = billableSubscriptionStatuses.has(current.subscriptionStatus);
    if (
      current.stripeSubscriptionId &&
      current.stripeSubscriptionId !== stripeSubscriptionId &&
      currentSubscriptionIsBillable
    ) {
      return "conflict";
    }

    await tx
      .update(workspacesTable)
      .set({
        plan,
        stripeCustomerId,
        stripeSubscriptionId,
        subscriptionStatus: status,
        subscriptionCurrentPeriodEnd: currentPeriodEnd,
        cancelAtPeriodEnd,
        pendingPlan: null,
        checkoutExpiresAt: null,
        stripeCheckoutSessionId: null,
        lastStripeEventCreatedAt: eventCreatedAt,
        lastStripeEventId: eventId,
      })
      .where(eq(workspacesTable.id, workspaceId));
    return "applied";
  });
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

type MedicalDossierInput = {
  name: string;
  volume: string;
  sourceLinks?: string[];
  registrationSafety: string;
  approvedClaims?: string[];
  audiences?: string[];
  reviewState: "needs_evidence" | "in_review" | "approved" | "changes_requested";
};

type MedicalDossierUpdate = Partial<MedicalDossierInput>;
type ContentReviewInput = {
  decision: "in_review" | "changes_requested" | "approved";
  reviewer?: string;
  notes?: string;
};

export async function getMedicalDossiers(workspaceId: string) {
  return db
    .select()
    .from(medicalDossiersTable)
    .where(eq(medicalDossiersTable.workspaceId, workspaceId))
    .orderBy(desc(medicalDossiersTable.updatedAt));
}

export async function createMedicalDossier(workspaceId: string, input: MedicalDossierInput) {
  const createdAt = now();
  const [dossier] = await db
    .insert(medicalDossiersTable)
    .values({
      id: id("dossier"),
      workspaceId,
      name: input.name.trim(),
      volume: input.volume.trim(),
      sourceLinks: input.sourceLinks ?? [],
      registrationSafety: input.registrationSafety.trim(),
      approvedClaims: input.approvedClaims ?? [],
      audiences: input.audiences ?? [],
      reviewState: input.reviewState,
      version: 1,
      createdAt,
      updatedAt: createdAt,
    })
    .returning();
  await addActivity(workspaceId, "Продавец", "Создал dossier продукта", `${dossier.name} · ${dossier.volume}`, "success");
  return dossier;
}

export async function updateMedicalDossier(
  workspaceId: string,
  dossierId: string,
  input: MedicalDossierUpdate,
) {
  const [dossier] = await db
    .update(medicalDossiersTable)
    .set({
      ...input,
      updatedAt: now(),
      version: sql`${medicalDossiersTable.version} + 1`,
    })
    .where(and(
      eq(medicalDossiersTable.workspaceId, workspaceId),
      eq(medicalDossiersTable.id, dossierId),
    ))
    .returning();
  if (dossier) {
    await addActivity(workspaceId, "Продавец", "Обновил dossier продукта", `${dossier.name} · версия ${dossier.version}`, "success");
  }
  return dossier ?? null;
}

const namedPerson = String.raw`(?:[А-ЯЁ][а-яё-]{1,}|[A-Z][a-z-]{1,})`;
const namedPersonMedicalRequest = new RegExp(
  String.raw`(?:[Пп]одбер\w*|[Рр]екоменд\w*|[Пп]редлож\w*|[Оо]предел\w*|[Оо]цен\w*|[Нн]азнач\w*|[Rr]ecommend\w*|[Ss]uggest\w*|[Dd]etermine\w*|[Aa]ssess\w*|[Pp]rescrib\w*)[\s\S]{0,120}(?:для|for)\s+${namedPerson}|(?:[Dd]etermine|[Aa]ssess|[Оо]предел\w*|[Оо]цен\w*)\s+(?:whether\s+)?${namedPerson}\s+(?:has|have|is|есть|имеет)`,
  "u",
);

const prohibitedMedicalPolicy = [
  { label: "диагнозы или определение заболевания", expression: /(диагноз\w*|заболев\w*|болезн\w*|патолог\w*|симптом\w*|определ\w*.*(состояни|болезн|заболев|патолог)|выяв\w*.*(болезн|заболев|патолог)|diagnos(?:is|tic)?|disease|condition|symptom|identif\w*.*(disease|condition))/i },
  { label: "назначения или лечение", expression: /(назнач\w*|лечени\w*|\bprescrib\w*|\btreat(?:ment|s|ing)?\b)/i },
  { label: "дозировки или инъекции", expression: /(дозиров\w*|инъекц\w*|\bdos(?:e|age|ing)\b|\binject\w*)/i },
  { label: "персональные рекомендации или процедуры для пациента", expression: /(пациент\w*|конкретн\w*.*(человек|клиент|лиц)|индивидуальн\w*.*(процедур|рекоменд)|patient[- ]specific|individuali[sz]ed (procedure|recommendation)|your patient|for a specific person)/i },
  { label: "персонализированные запросы для именованного человека", expression: namedPersonMedicalRequest },
  { label: "гарантированные клинические результаты", expression: /(гарант\w*.*(результат|эффект)|клиническ\w*.*(результат|исход)|излеч\w*|обеспеч\w*.*(результат|эффект)|обеща\w*.*(результат|эффект)|улучш\w*.*(состояни|кож|лиц|внешност)|измен\w*.*(состояни|кож|лиц|внешност)|\bguarantee\w*.*(outcome|result|effect)|\bensure\w*.*(outcome|result|effect)|\bpromise\w*.*(outcome|result|effect)|\bimprov\w*.*(skin|face|condition|outcome)|\btransform\w*.*(skin|face|condition|outcome)|\bclinical outcome\b|\bcure[sd]?\b)/i },
] as const;

export function medicalPolicyViolations(values: ReadonlyArray<string | null | undefined>): string[] {
  const source = values.filter((value): value is string => Boolean(value)).join("\n");
  return prohibitedMedicalPolicy
    .filter(({ expression }) => expression.test(source))
    .map(({ label }) => label);
}

function claimWarningsFor(
  topic: string,
  dossier: typeof medicalDossiersTable.$inferSelect | null,
): string[] {
  const warnings: string[] = [];
  if (!dossier) warnings.push("Черновик не привязан к dossier: добавьте проверяемую evidence basis до approval.");
  if (dossier && !dossier.approvedClaims.length) warnings.push("В dossier нет утверждённых claims: перед использованием добавьте проверяемые формулировки.");
  if (dossier && dossier.reviewState !== "approved") warnings.push("Dossier не утверждён: сначала завершите evidence review продукта.");
  if (/(пациент|диагноз|лечен|назнач|дозир|инъекц|процедур|беремен)/i.test(topic)) {
    warnings.push("Запрос затрагивает клиническое или пациент-специфическое применение. Нужна проверка лицензированным специалистом.");
  }
  return warnings;
}

const medicalSafetyDisclosure = "Материал предназначен для лицензированных специалистов. Это не диагноз, не назначение, не гарантия клинического результата и не инструкция для пациентов. Перед использованием требуется человеческая проверка.";

function contentPolicyViolations(title: string, body: string): string[] {
  return medicalPolicyViolations([title, body.replaceAll(medicalSafetyDisclosure, "")]);
}

function governedContentBody(
  format: "expert_post" | "product_card" | "reels_brief" | "sales_message",
  topic: string,
  tone: string | undefined,
  dossier: typeof medicalDossiersTable.$inferSelect | null,
): string {
  const product = dossier ? `${dossier.name} · ${dossier.volume}` : "выбранный продукт";
  const claimLine = dossier?.approvedClaims.length
    ? `Разрешённые формулировки: ${dossier.approvedClaims.join("; ")}.`
    : "Используйте только формулировки из утверждённого dossier; не добавляйте клинические обещания.";
  const formatCopy = {
    expert_post: `Тема для профессионального обсуждения: ${topic}.\n\nСформулируйте практический контекст для лицензированных специалистов и предложите свериться с документацией продукта.`,
    product_card: `${product}\n\nКраткая карточка по теме «${topic}»: позиционирование, происхождение утверждённых фактов и следующий безопасный шаг — запросить dossier.`,
    reels_brief: `Reels brief: первые 2 секунды — «${topic}»; затем факт из dossier, визуальная ссылка на источник и CTA «проверить с медицинским специалистом».`,
    sales_message: `Здравствуйте! По теме «${topic}» подготовлен материал о ${product}. Можем отправить dossier с источниками и утверждёнными claims для профессионального ознакомления.`,
  }[format];
  return [
    formatCopy,
    claimLine,
    `Тон: ${tone ?? "уверенный, доброжелательный, профессиональный"}.`,
    medicalSafetyDisclosure,
  ].join("\n\n");
}

function toConnectionStatus(connection: typeof channelConnectionsTable.$inferSelect) {
  const provider = connection.provider as ChannelProvider;
  if (provider === "instagram") {
    return {
      id: connection.id,
      provider: channelDefinitions[provider].provider,
      category: "channel" as const,
      status: "unavailable" as const,
      detail: "Интеграция Instagram пока недоступна. Existing credential не используется для delivery.",
      channel: provider,
      target: connection.target,
      lastCheckedAt: connection.lastCheckedAt,
      canDisconnect: false,
    };
  }
  const credentialAvailable = Boolean(decryptCredential(connection.credentialCiphertext));
  const status = credentialAvailable && connection.status === "connected" ? "connected" : "needs_setup";
  return {
    id: connection.id,
    provider: channelDefinitions[provider].provider,
    category: "channel" as const,
    status,
    detail: connectionDetail(provider, connection.target, status, connection.lastCheckedAt, connection.lastError),
    channel: provider,
    target: connection.target,
    lastCheckedAt: connection.lastCheckedAt,
    canDisconnect: true,
  };
}

export async function getConnections(workspaceId: string) {
  const saved = await db
    .select()
    .from(channelConnectionsTable)
    .where(and(eq(channelConnectionsTable.workspaceId, workspaceId), eq(channelConnectionsTable.isActive, true)))
    .orderBy(desc(channelConnectionsTable.createdAt));
  const savedByProvider = new Map(saved.map((connection) => [connection.provider, connection]));
  const channels = (Object.keys(channelDefinitions) as ChannelProvider[]).map((provider) => {
    const connection = savedByProvider.get(provider);
    if (connection) return toConnectionStatus(connection);
    if (provider === "instagram") {
      return {
        id: `available-${provider}`,
        provider: channelDefinitions[provider].provider,
        category: "channel" as const,
        status: "unavailable" as const,
        detail: "Интеграция Instagram появится после отдельного запуска Meta workflow.",
        channel: provider,
        target: null,
        lastCheckedAt: null,
        canDisconnect: false,
      };
    }
    return {
      id: `available-${provider}`,
      provider: channelDefinitions[provider].provider,
      category: "channel" as const,
      status: "needs_setup" as const,
      detail: `Не подключён. Укажите ${channelDefinitions[provider].targetHint} и подтвердите доступ канала.`,
      channel: provider,
      target: null,
      lastCheckedAt: null,
      canDisconnect: false,
    };
  });

  return [
    { id: "youtube", provider: "YouTube / yt-dlp", category: "source", status: "configured", detail: "Локальный сборщик подготовлен." },
    { id: "search", provider: "Google + Brave", category: "source", status: "needs_setup", detail: "Добавьте ключи поисковых провайдеров для живой выдачи." },
    ...channels,
    { id: "payments", provider: "ЮKassa / CloudPayments", category: "payment", status: "needs_setup", detail: "Подключите платёжного провайдера перед отправкой ссылок." },
    { id: "memory", provider: "PostgreSQL memory", category: "memory", status: "connected", detail: "Журнал, инсайты и память хранятся в Replit Postgres." },
    { id: "ai", provider: "Replit AI / OpenAI", category: "ai", status: "connected", detail: "LLM включена для суммаризации и контента." },
  ];
}

export async function createChannelConnection(
  workspaceId: string,
  provider: ChannelProvider,
  target: string,
  credential: string,
) {
  const [connection] = await db
    .insert(channelConnectionsTable)
    .values({
      id: id("connection"),
      workspaceId,
      provider,
      target,
      credentialCiphertext: encryptCredential(credential),
      isActive: true,
      status: "connected",
      lastCheckedAt: now(),
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [channelConnectionsTable.workspaceId, channelConnectionsTable.provider],
      targetWhere: sql`is_active = true`,
      set: {
        target,
        credentialCiphertext: encryptCredential(credential),
        status: "connected",
        lastCheckedAt: now(),
        lastError: null,
      },
    })
    .returning();
  await addActivity(workspaceId, "Продавец", "Подключил канал", `${channelDefinitions[provider].provider}: ${target}`, "success");
  return connection;
}

export async function checkChannelConnection(workspaceId: string, idValue: string) {
  const [connection] = await db
    .select()
    .from(channelConnectionsTable)
    .where(and(
      eq(channelConnectionsTable.workspaceId, workspaceId),
      eq(channelConnectionsTable.id, idValue),
      eq(channelConnectionsTable.isActive, true),
    ));
  if (!connection) return null;

  const credential = decryptCredential(connection.credentialCiphertext);
  const verification = credential && isSupportedChannel(connection.provider)
    ? await verifyChannelTarget(connection.provider, connection.target, credential)
    : { verified: false, detail: "Ключ доступа не удалось расшифровать. Подключите канал заново.", target: null };
  const [updated] = await db
    .update(channelConnectionsTable)
    .set({
      target: verification.target ?? connection.target,
      status: verification.verified ? "connected" : "needs_setup",
      lastCheckedAt: now(),
      lastError: verification.verified ? null : verification.detail,
    })
    .where(and(eq(channelConnectionsTable.workspaceId, workspaceId), eq(channelConnectionsTable.id, idValue)))
    .returning();
  return updated;
}

export async function disconnectChannelConnection(workspaceId: string, idValue: string) {
  const [connection] = await db
    .update(channelConnectionsTable)
    .set({ credentialCiphertext: null, isActive: false, status: "needs_setup", lastError: null })
    .where(and(
      eq(channelConnectionsTable.workspaceId, workspaceId),
      eq(channelConnectionsTable.id, idValue),
      eq(channelConnectionsTable.isActive, true),
    ))
    .returning();
  if (connection) {
    await addActivity(workspaceId, "Продавец", "Отключил канал", `${channelDefinitions[connection.provider as ChannelProvider]?.provider ?? "Канал"}: ${connection.target}`, "warning");
  }
  return connection ?? null;
}

async function deliverToChannel(
  provider: ChannelProvider,
  target: string,
  body: string,
  credential: string,
): Promise<{ status: "published" | "failed"; detail: string; externalId: string | null }> {
  try {
    if (provider === "telegram") {
      const response = await fetch(`https://api.telegram.org/bot${credential}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: target, text: body }),
        signal: AbortSignal.timeout(10_000),
      });
      const payload = (await response.json()) as { ok?: boolean; result?: { message_id?: number } };
      if (!response.ok || !payload.ok) {
        return { status: "failed", detail: "Telegram отклонил публикацию. Проверьте права бота и цель канала.", externalId: null };
      }
      return {
        status: "published",
        detail: "Публикация подтверждена Telegram.",
        externalId: payload.result?.message_id ? String(payload.result.message_id) : null,
      };
    }

    if (provider === "vk") {
      const response = await fetch("https://api.vk.com/method/wall.post", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: credential,
          owner_id: target.startsWith("-") ? target : `-${target}`,
          message: body,
          v: "5.199",
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const payload = (await response.json()) as { response?: { post_id?: number }; error?: unknown };
      if (!response.ok || payload.error || !payload.response) {
        return { status: "failed", detail: "VK отклонил публикацию. Проверьте права сообщества и цель канала.", externalId: null };
      }
      return {
        status: "published",
        detail: "Публикация подтверждена VK.",
        externalId: payload.response.post_id ? String(payload.response.post_id) : null,
      };
    }

    return { status: "failed", detail: "Публикация в Instagram пока недоступна для этого подключения.", externalId: null };
  } catch {
    return { status: "failed", detail: "Канал временно недоступен. Результат сохранён, повторите попытку позже.", externalId: null };
  }
}

export async function createContent(
  workspaceId: string,
  planId: string,
  topic: string,
  channels: string[],
  tone?: string,
  dossierId?: string,
  format: "expert_post" | "product_card" | "reels_brief" | "sales_message" = "expert_post",
) {
  const dossierIdValue = dossierId?.trim() || null;
  const [dossier] = dossierIdValue
    ? await db
      .select()
      .from(medicalDossiersTable)
      .where(and(eq(medicalDossiersTable.workspaceId, workspaceId), eq(medicalDossiersTable.id, dossierIdValue)))
    : [null];
  if (dossierIdValue && !dossier) return { error: "dossier_not_found" as const };
  const claimWarnings = claimWarningsFor(topic, dossier);
  const createdAt = now();
  const title = `${format === "expert_post" ? "Экспертный материал" : format === "product_card" ? "Карточка продукта" : format === "reels_brief" ? "Reels brief" : "Sales message"}: ${topic}`;
  const body = governedContentBody(format, topic, tone, dossier);
  const policyViolations = contentPolicyViolations(title, body);
  if (policyViolations.length) return { error: "unsafe_medical_content" as const, violations: policyViolations };
  if (!(await consumeQuota(workspaceId, planId, "content"))) return null;
  const item = {
    id: id("content"),
    workspaceId,
    title,
    body,
    channels,
    status: "draft",
    imageUrl: null,
    format,
    dossierId: dossierIdValue,
    reviewState: "pending",
    claimWarnings,
    requiresHumanReview: true,
    reviewedBy: null,
    reviewedAt: null,
    contentVersion: 1,
    reviewTrail: [],
    createdAt,
  };
  await db.insert(contentItemsTable).values(item);
  await addActivity(workspaceId, "Продавец", "Сгенерировал medical-черновик", item.title, claimWarnings.length ? "warning" : "success");
  return item;
}

export async function reviewContent(workspaceId: string, idValue: string, input: ContentReviewInput) {
  const [candidate] = await db
    .select()
    .from(contentItemsTable)
    .where(and(eq(contentItemsTable.workspaceId, workspaceId), eq(contentItemsTable.id, idValue)));
  if (!candidate) return null;
  if (!input.reviewer?.trim()) return { error: "reviewer_required" as const };
  const policyViolations = contentPolicyViolations(candidate.title, candidate.body);
  if (policyViolations.length) return { error: "unsafe_medical_content" as const, violations: policyViolations };
  if (input.decision === "approved" && candidate.claimWarnings.length > 0) {
    return { error: "unresolved_claim_warnings" as const };
  }
  const createdAt = now();
  const reviewer = input.reviewer.trim();
  const reviewTrail = Array.isArray(candidate.reviewTrail) ? candidate.reviewTrail : [];
  const event = {
    decision: input.decision,
    reviewer,
    notes: input.notes?.trim() || "Решение зафиксировано оператором.",
    attested: true,
    version: candidate.contentVersion,
    createdAt: createdAt.toISOString(),
  };
  const [updated] = await db
    .update(contentItemsTable)
    .set({
      status: input.decision,
      reviewState: input.decision,
      reviewedBy: reviewer,
      reviewedAt: createdAt,
      reviewTrail: [...reviewTrail, event],
    })
    .where(and(eq(contentItemsTable.workspaceId, workspaceId), eq(contentItemsTable.id, idValue)))
    .returning();
  await addActivity(
    workspaceId,
    "Продавец",
    input.decision === "approved" ? "Материал одобрен оператором" : "Обновлено review-состояние материала",
    `${updated.title} · v${updated.contentVersion}`,
    input.decision === "approved" ? "success" : "warning",
  );
  return updated;
}

export async function publishContent(workspaceId: string, idValue: string, channels: string[]) {
  const [candidate] = await db
    .select({
      id: contentItemsTable.id,
      title: contentItemsTable.title,
      body: contentItemsTable.body,
      status: contentItemsTable.status,
      channels: contentItemsTable.channels,
      reviewState: contentItemsTable.reviewState,
    })
    .from(contentItemsTable)
    .where(and(eq(contentItemsTable.workspaceId, workspaceId), eq(contentItemsTable.id, idValue)));
  if (!candidate) return null;
  if (new Set(channels).size !== channels.length) {
    return { error: "duplicate_channels", channels: [] as string[] };
  }
  const invalidChannels = channels.filter((channel) => !candidate.channels.includes(channel));
  if (invalidChannels.length > 0) {
    return { error: "channel_not_selected", channels: invalidChannels };
  }
  const policyViolations = contentPolicyViolations(candidate.title, candidate.body);
  if (policyViolations.length) return { error: "unsafe_medical_content" as const, violations: policyViolations };
  if (candidate.status !== "approved" || candidate.reviewState !== "approved") {
    return { error: "requires_review", channels: [] as string[] };
  }

  const [existing] = await db
    .update(contentItemsTable)
    .set({ status: "publishing" })
    .where(
      and(
        eq(contentItemsTable.workspaceId, workspaceId),
        eq(contentItemsTable.id, idValue),
        eq(contentItemsTable.status, "approved"),
      ),
    )
    .returning();
  if (!existing) {
    const [matching] = await db
      .select({ id: contentItemsTable.id })
      .from(contentItemsTable)
      .where(and(eq(contentItemsTable.workspaceId, workspaceId), eq(contentItemsTable.id, idValue)));
    return matching ? { error: "requires_review", channels: [] as string[] } : null;
  }

  const connections = await db
    .select()
    .from(channelConnectionsTable)
    .where(and(eq(channelConnectionsTable.workspaceId, workspaceId), eq(channelConnectionsTable.isActive, true)));
  const connectedByProvider = new Map(
    connections
      .map((connection) => ({
        connection,
        credential: decryptCredential(connection.credentialCiphertext),
      }))
      .filter(({ connection, credential }) => (
        connection.status === "connected"
        && connection.provider !== "instagram"
        && isSupportedChannel(connection.provider)
        && credential !== null
      ))
      .map(({ connection, credential }) => [connection.provider, { connection, credential }]),
  );
  const missingChannels = channels.filter((channel) => !connectedByProvider.has(channel));
  if (missingChannels.length > 0) {
    await db
      .update(contentItemsTable)
      .set({ status: "approved" })
      .where(and(eq(contentItemsTable.workspaceId, workspaceId), eq(contentItemsTable.id, idValue)));
    await addActivity(
      workspaceId,
      "Продавец",
      "Публикация остановлена",
      `Каналы не подключены: ${missingChannels.join(", ")}.`,
      "failed",
    );
    return { error: "not_connected", channels: missingChannels };
  }

  const results = await Promise.all(
    channels.map(async (provider) => {
      const delivery = connectedByProvider.get(provider)!;
      const connection = delivery.connection;
      const deliveryId = id("delivery");
      await db.insert(publishDeliveriesTable).values({
        id: deliveryId,
        workspaceId,
        contentId: existing.id,
        connectionId: connection.id,
        provider,
        target: connection.target,
        status: "pending",
        detail: "Подготовлено к отправке в канал.",
        externalId: null,
        createdAt: now(),
      });
      await addActivity(workspaceId, "Продавец", "Публикация подготовлена", `${provider}: ожидается ответ канала.`, "running");
      const result = await deliverToChannel(provider as ChannelProvider, connection.target, existing.body, delivery.credential!);
      await db
        .update(publishDeliveriesTable)
        .set({ status: result.status, detail: result.detail, externalId: result.externalId })
        .where(eq(publishDeliveriesTable.id, deliveryId));
      await addActivity(
        workspaceId,
        "Продавец",
        result.status === "published" ? "Канал опубликован" : "Ошибка публикации",
        `${provider}: ${result.detail}`,
        result.status === "published" ? "success" : "failed",
      );
      return {
        channel: provider,
        target: connection.target,
        status: result.status,
        detail: result.detail,
        externalId: result.externalId,
      };
    }),
  );
  const succeeded = results.filter((result) => result.status === "published").length;
  const status = succeeded === results.length ? "published" : succeeded > 0 ? "partial" : "failed";
  const [item] = await db
    .update(contentItemsTable)
    .set({ channels, status })
    .where(and(eq(contentItemsTable.workspaceId, workspaceId), eq(contentItemsTable.id, idValue)))
    .returning();
  return { item, deliveries: results };
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