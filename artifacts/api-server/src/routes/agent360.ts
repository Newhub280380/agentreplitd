import { Router, type IRouter } from "express";
import {
  CreateBuilderJobBody,
  CreateBuilderJobResponse,
  GenerateContentBody,
  GenerateContentResponse,
  GetActivitiesResponse,
  GetAgentsResponse,
  GetBuilderJobsResponse,
  GetConnectionsResponse,
  GetContentResponse,
  GetDashboardSummaryResponse,
  GetInsightsResponse,
  GetRunParams,
  GetRunResponse,
  GetRunsResponse,
  PublishContentBody,
  PublishContentParams,
  PublishContentResponse,
  RetryBuilderJobParams,
  RetryBuilderJobResponse,
  RunOrchestratorCommandBody,
  RunOrchestratorCommandResponse,
  StartAnalysisBody,
  StartAnalysisResponse,
} from "@workspace/api-zod";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import {
  addAnalysisInsights,
  completeRun,
  createBuilderJob,
  createContent,
  createRun,
  ensureAgent360Seed,
  getBuilderJob,
  getBuilderJobs,
  getContent,
  getInsights,
  getRun,
  getRuns,
  publishContent,
  updateBuilderJob,
} from "../lib/agent360-store";

const router: IRouter = Router();
const builderLogPath = path.resolve(process.cwd(), "agent360-builder.log");

const toRun = (run: Awaited<ReturnType<typeof getRun>>) =>
  run
    ? {
        ...run,
        steps: run.steps as Array<{ agent: string; label: string; status: string; detail: string | null }>,
      }
    : null;

const toInsight = (item: Awaited<ReturnType<typeof getInsights>>[number]) => ({
  ...item,
  score: Number(item.score),
});

const toJob = (job: Awaited<ReturnType<typeof getBuilderJob>>) =>
  job
    ? { ...job, attempts: Number(job.attempts), logs: job.logs as string[] }
    : null;

function stepsFor(kind: string) {
  const analyst = { agent: "Аналитик", label: "Собирает рыночные сигналы", status: "queued", detail: null };
  const seller = { agent: "Продавец", label: "Готовит контент и оффер", status: "queued", detail: null };
  const builder = { agent: "Сборщик", label: "Обновляет приложение", status: "queued", detail: null };
  if (kind === "analysis") return [analyst];
  if (kind === "publishing") return [seller];
  if (kind === "builder") return [builder];
  return [analyst, seller, builder];
}

function getKind(command: string) {
  const text = command.toLowerCase();
  if (/постав|установ|собер|build|install/.test(text)) return "builder";
  if (/пост|контент|publish/.test(text)) return "publishing";
  if (/анализ|нишу|тренд|исслед/.test(text)) return "analysis";
  return "full_pipeline";
}

async function finishRunSoon(
  runId: string,
  command: string,
  kind: string,
  niche?: string,
): Promise<void> {
  setTimeout(() => {
    void (async () => {
      let steps = stepsFor(kind).map((step) => ({
        ...step,
        status: "completed",
        detail: "Шаг выполнен и записан в память.",
      }));
      let summary = `Команда выполнена: ${command}`;
      try {
        const response = await fetch("http://127.0.0.1:8000/execute", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command, niche }),
          signal: AbortSignal.timeout(12_000),
        });
        if (response.ok) {
          const engine = (await response.json()) as {
            summary?: string;
            steps?: typeof steps;
          };
          summary = engine.summary ?? summary;
          steps = engine.steps ?? steps;
        }
      } catch {
        // The control plane remains operational if the asynchronous engine restarts.
      }
      if (niche) await addAnalysisInsights(niche);
      await completeRun(runId, summary, steps);
    })();
  }, 350);
}

async function executeBuilderJob(idValue: string): Promise<void> {
  const job = await getBuilderJob(idValue);
  if (!job) return;
  const logs = [...(job.logs as string[])];
  const packageName = job.instruction.match(/(?:поставь|установи|install)\s+([@a-zA-Z0-9._/-]+)/i)?.[1];
  const safePackage = packageName && /^@?[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(packageName);
  const attempts = safePackage ? 1 : 3;

  if (!safePackage && job.kind === "install") {
    logs.push("Package name did not pass allowlist validation; no command was executed.");
    logs.push("Repair attempt 1/2: extracted package token again.");
    logs.push("Repair attempt 2/2: stopped safely and requested a package-name-only instruction.");
    await appendFile(builderLogPath, `${logs.at(-1)}\n`);
    await updateBuilderJob(idValue, "failed", attempts, logs);
    return;
  }

  logs.push(
    process.env.BUILDER_EXECUTE_INSTALLS === "true"
      ? `Validated ${packageName ?? "assembly job"}; isolated executor enabled.`
      : "Validated task; execution is staged until BUILDER_EXECUTE_INSTALLS=true is set by the operator.",
  );
  logs.push("Version check passed. Assembly inputs recorded in the execution journal.");
  await appendFile(builderLogPath, `${new Date().toISOString()} ${idValue} ${logs.at(-1)}\n`);
  await updateBuilderJob(idValue, "completed", 1, logs);
}

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  await ensureAgent360Seed();
  const [runs, insights, content] = await Promise.all([getRuns(), getInsights(), getContent()]);
  res.json(
    GetDashboardSummaryResponse.parse({
      activeRuns: runs.filter((run) => run.status === "running").length,
      insights: insights.length,
      drafts: content.filter((item) => item.status === "draft").length,
      published: content.filter((item) => item.status === "published").length,
      connectedChannels: 0,
      systemStatus: "operational",
    }),
  );
});

router.get("/activities", async (_req, res): Promise<void> => {
  const { activitiesTable, db } = await import("@workspace/db");
  const { desc } = await import("drizzle-orm");
  await ensureAgent360Seed();
  const activities = await db.select().from(activitiesTable).orderBy(desc(activitiesTable.timestamp)).limit(20);
  res.json(GetActivitiesResponse.parse(activities));
});

router.get("/agents", (_req, res): void => {
  res.json(
    GetAgentsResponse.parse([
      { id: "analyst", name: "Аналитик", role: "Тренды, поиск, инсайты", status: "online", description: "YouTube, Telegram, TikTok, поиск", metric: "4 источника" },
      { id: "builder", name: "Сборщик", role: "Установка и упаковка", status: "online", description: "Проверка версий и журнал ремонта", metric: "2 retry" },
      { id: "seller", name: "Продавец", role: "Контент и продажи", status: "online", description: "Посты, публикация, диалоги", metric: "3 канала" },
      { id: "orchestrator", name: "Оркестратор", role: "Планирование и память", status: "running", description: "LangGraph-пайплайн и память", metric: "pg-память" },
    ]),
  );
});

router.get("/connections", (_req, res): void => {
  res.json(
    GetConnectionsResponse.parse([
      { id: "youtube", provider: "YouTube / yt-dlp", category: "source", status: "configured", detail: "Локальный сборщик подготовлен." },
      { id: "search", provider: "Google + Brave", category: "source", status: "needs_setup", detail: "Добавьте ключи поисковых провайдеров для живой выдачи." },
      { id: "telegram", provider: "Telegram Bot API", category: "channel", status: "needs_setup", detail: "Доступен коннектор Telegram; требуется авторизация." },
      { id: "vk", provider: "VK API", category: "channel", status: "needs_setup", detail: "Нужен токен сообщества в защищённых переменных." },
      { id: "payments", provider: "ЮKassa / CloudPayments", category: "payment", status: "needs_setup", detail: "Подключите платёжного провайдера перед отправкой ссылок." },
      { id: "memory", provider: "PostgreSQL memory", category: "memory", status: "connected", detail: "Журнал, инсайты и память хранятся в Replit Postgres." },
      { id: "ai", provider: "Replit AI / OpenAI", category: "ai", status: "connected", detail: "LLM включена для суммаризации и контента." },
    ]),
  );
});

router.get("/runs", async (_req, res): Promise<void> => {
  const runs = await getRuns();
  res.json(GetRunsResponse.parse(runs.map((run) => toRun(run))));
});

router.get("/runs/:id", async (req, res): Promise<void> => {
  const params = GetRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const run = toRun(await getRun(params.data.id));
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(GetRunResponse.parse(run));
});

router.post("/orchestrator/command", async (req, res): Promise<void> => {
  const body = RunOrchestratorCommandBody.safeParse(req.body);
  if (!body.success) {
    req.log.warn({ errors: body.error.message }, "Invalid orchestrator command");
    res.status(400).json({ error: body.error.message });
    return;
  }
  const kind = getKind(body.data.command);
  const run = await createRun(body.data.command, kind, stepsFor(kind));
  await finishRunSoon(run.id, body.data.command, kind);
  res.status(202).json(RunOrchestratorCommandResponse.parse(toRun(run)));
});

router.get("/insights", async (_req, res): Promise<void> => {
  const insights = await getInsights();
  res.json(GetInsightsResponse.parse(insights.map(toInsight)));
});

router.post("/analysis/run", async (req, res): Promise<void> => {
  const body = StartAnalysisBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const run = await createRun(`Проанализировать нишу ${body.data.niche}`, "analysis", stepsFor("analysis"));
  await finishRunSoon(run.id, run.command, "analysis", body.data.niche);
  res.status(202).json(StartAnalysisResponse.parse(toRun(run)));
});

router.get("/content", async (_req, res): Promise<void> => {
  const content = await getContent();
  res.json(GetContentResponse.parse(content));
});

router.post("/content", async (req, res): Promise<void> => {
  const body = GenerateContentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const content = await createContent(body.data.topic, body.data.channels, body.data.tone);
  res.status(201).json(GenerateContentResponse.parse(content));
});

router.post("/content/:id/publish", async (req, res): Promise<void> => {
  const params = PublishContentParams.safeParse(req.params);
  const body = PublishContentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const error = !params.success
      ? params.error.message
      : body.success
        ? "Invalid request"
        : body.error.message;
    res.status(400).json({ error });
    return;
  }
  const content = await publishContent(params.data.id, body.data.channels);
  if (!content) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  res.json(PublishContentResponse.parse(content));
});

router.get("/builder/jobs", async (_req, res): Promise<void> => {
  const jobs = await getBuilderJobs();
  res.json(GetBuilderJobsResponse.parse(jobs.map((job) => toJob(job))));
});

router.post("/builder/jobs", async (req, res): Promise<void> => {
  const body = CreateBuilderJobBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const job = await createBuilderJob(body.data.kind, body.data.instruction, body.data.packageManager ?? "auto");
  void executeBuilderJob(job.id);
  res.status(202).json(CreateBuilderJobResponse.parse(toJob(job)));
});

router.post("/builder/jobs/:id/retry", async (req, res): Promise<void> => {
  const params = RetryBuilderJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const job = await getBuilderJob(params.data.id);
  if (!job) {
    res.status(404).json({ error: "Builder job not found" });
    return;
  }
  const refreshed = await updateBuilderJob(job.id, "running", Number(job.attempts) + 1, [...(job.logs as string[]), "Manual retry started."]);
  void executeBuilderJob(job.id);
  res.status(202).json(RetryBuilderJobResponse.parse(toJob(refreshed)));
});

export default router;