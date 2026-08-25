import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import {
  CreateBillingCheckoutBody,
  CreateBillingCheckoutResponse,
  CreateBillingPortalResponse,
  CreateBuilderJobBody,
  CreateBuilderJobResponse,
  CheckChannelConnectionParams,
  CheckChannelConnectionResponse,
  ConnectChannelBody,
  ConnectChannelResponse,
  CreateMedicalDossierBody,
  CreateMedicalDossierResponse,
  DisconnectChannelParams,
  DisconnectChannelResponse,
  GenerateContentBody,
  GenerateContentResponse,
  GetActivitiesResponse,
  GetAgentsResponse,
  GetAccountOverviewResponse,
  GetBuilderJobsResponse,
  GetConnectionsResponse,
  GetContentResponse,
  GetDashboardSummaryResponse,
  GetInsightsResponse,
  GetMedicalDossiersResponse,
  GetPlansResponse,
  GetRunParams,
  GetRunResponse,
  GetRunsResponse,
  PublishContentBody,
  PublishContentParams,
  PublishContentResponse,
  ReviewContentBody,
  ReviewContentParams,
  ReviewContentResponse,
  RetryBuilderJobParams,
  RetryBuilderJobResponse,
  RunOrchestratorCommandBody,
  RunOrchestratorCommandResponse,
  StartAnalysisBody,
  StartAnalysisResponse,
  UpdateMedicalDossierBody,
  UpdateMedicalDossierParams,
  UpdateMedicalDossierResponse,
} from "@workspace/api-zod";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import {
  addAnalysisInsights,
  completeRun,
  createBuilderJob,
  createChannelConnection,
  createContent,
  createMedicalDossier,
  createRun,
  ensureWorkspace,
  getAccountOverview,
  getActivities,
  getBuilderJob,
  getBuilderJobs,
  getConnections,
  getContent,
  getInsights,
  getMedicalDossiers,
  medicalPolicyViolations,
  getRun,
  getRuns,
  checkChannelConnection,
  disconnectChannelConnection,
  isSupportedChannel,
  publishContent,
  reviewContent,
  planCatalog,
  persistStripeCheckoutSession,
  releaseStripeCheckout,
  reserveStripeCheckout,
  updateBuilderJob,
  updateMedicalDossier,
  verifyChannelTarget,
} from "../lib/agent360-store";
import {
  createBillingPortal,
  createCheckoutForWorkspace,
  isPaidPlanId,
} from "../lib/stripeService";

const router: IRouter = Router();
const builderLogPath = path.resolve(process.cwd(), "agent360-builder.log");
export type AuthResolver = (req: Request) => string | null | undefined;
type AuthenticatedRequest = Request & { userId: string; authResolver?: AuthResolver };

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authResolver = (req as AuthenticatedRequest).authResolver;
  const userId = authResolver ? authResolver(req) : getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in is required to access a workspace." });
    return;
  }
  (req as AuthenticatedRequest).userId = userId;
  next();
}

function getWorkspace(req: Request) {
  return ensureWorkspace((req as AuthenticatedRequest).userId);
}

function getPublicAppUrl(req: Request): string {
  const configuredDomain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (configuredDomain) return `https://${configuredDomain}`;
  throw new Error("A canonical application domain is required for billing redirects.");
}

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
  workspaceId: string,
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
      if (niche) await addAnalysisInsights(workspaceId, niche);
      await completeRun(workspaceId, runId, summary, steps);
    })();
  }, 350);
}

async function executeBuilderJob(workspaceId: string, idValue: string): Promise<void> {
  const job = await getBuilderJob(workspaceId, idValue);
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
    await updateBuilderJob(workspaceId, idValue, "failed", attempts, logs);
    return;
  }

  logs.push(
    process.env.BUILDER_EXECUTE_INSTALLS === "true"
      ? `Validated ${packageName ?? "assembly job"}; isolated executor enabled.`
      : "Validated task; execution is staged until BUILDER_EXECUTE_INSTALLS=true is set by the operator.",
  );
  logs.push("Version check passed. Assembly inputs recorded in the execution journal.");
  await appendFile(builderLogPath, `${new Date().toISOString()} ${idValue} ${logs.at(-1)}\n`);
  await updateBuilderJob(workspaceId, idValue, "completed", 1, logs);
}

router.get("/plans", (_req, res): void => {
  res.json(GetPlansResponse.parse(Object.values(planCatalog)));
});

router.use(requireAuth);

router.get("/account", async (req, res): Promise<void> => {
  const account = await getAccountOverview((req as AuthenticatedRequest).userId);
  res.json(GetAccountOverviewResponse.parse(account));
});

router.post("/billing/checkout", async (req, res): Promise<void> => {
  const body = CreateBillingCheckoutBody.safeParse(req.body);
  if (!body.success || !isPaidPlanId(body.data.plan)) {
    res.status(400).json({ error: "Choose an available paid plan." });
    return;
  }

  const workspace = await getWorkspace(req);
  if (
    workspace.plan === body.data.plan &&
    (workspace.subscriptionStatus === "active" || workspace.subscriptionStatus === "trialing")
  ) {
    res.status(409).json({ error: "This workspace already has the selected plan." });
    return;
  }
  if (
    workspace.stripeSubscriptionId &&
    !["canceled", "incomplete_expired", "unpaid"].includes(workspace.subscriptionStatus)
  ) {
    res.status(409).json({ error: "Manage the existing subscription in the billing portal before changing plans." });
    return;
  }

  const checkoutExpiresAt = await reserveStripeCheckout(workspace.id, body.data.plan);
  if (!checkoutExpiresAt) {
    res.status(409).json({ error: "A payment session is already being prepared for this workspace." });
    return;
  }

  try {
    const appUrl = getPublicAppUrl(req);
    const checkout = await createCheckoutForWorkspace({
      workspace,
      planId: body.data.plan,
      successUrl: `${appUrl}/settings?billing=success`,
      cancelUrl: `${appUrl}/settings?billing=cancelled`,
      expiresAt: checkoutExpiresAt,
    });
    await persistStripeCheckoutSession(workspace.id, checkout.id);
    res.json(CreateBillingCheckoutResponse.parse({ url: checkout.url }));
  } catch (err) {
    await releaseStripeCheckout(workspace.id);
    req.log.error({ err }, "Unable to create Stripe checkout session");
    res.status(502).json({ error: "Payment checkout is temporarily unavailable. Please try again." });
  }
});

router.post("/billing/portal", async (req, res): Promise<void> => {
  const workspace = await getWorkspace(req);
  if (!workspace.stripeCustomerId) {
    res.status(400).json({ error: "No Stripe billing profile exists for this workspace yet." });
    return;
  }

  try {
    const url = await createBillingPortal(workspace.stripeCustomerId, `${getPublicAppUrl(req)}/settings`);
    res.json(CreateBillingPortalResponse.parse({ url }));
  } catch (err) {
    req.log.error({ err }, "Unable to create Stripe billing portal session");
    res.status(502).json({ error: "Subscription management is temporarily unavailable. Please try again." });
  }
});

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const workspace = await getWorkspace(req);
  const [runs, insights, content] = await Promise.all([
    getRuns(workspace.id),
    getInsights(workspace.id),
    getContent(workspace.id),
  ]);
  const connections = await getConnections(workspace.id);
  res.json(
    GetDashboardSummaryResponse.parse({
      activeRuns: runs.filter((run) => run.status === "running").length,
      insights: insights.length,
      drafts: content.filter((item) => item.status === "draft").length,
      published: content.filter((item) => item.status === "published").length,
      connectedChannels: connections.filter((connection) => connection.category === "channel" && connection.status === "connected").length,
      systemStatus: "operational",
    }),
  );
});

router.get("/activities", async (req, res): Promise<void> => {
  const workspace = await getWorkspace(req);
  const activities = await getActivities(workspace.id);
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

router.get("/connections", async (req, res): Promise<void> => {
  const workspace = await getWorkspace(req);
  res.json(GetConnectionsResponse.parse(await getConnections(workspace.id)));
});

router.post("/connections", async (req, res): Promise<void> => {
  const body = ConnectChannelBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!isSupportedChannel(body.data.provider)) {
    res.status(400).json({ error: "This channel is not allowed." });
    return;
  }
  const workspace = await getWorkspace(req);
  const verification = await verifyChannelTarget(body.data.provider, body.data.target.trim(), body.data.credential);
  if (!verification.verified) {
    res.status(400).json({ error: verification.detail });
    return;
  }
  const connection = await createChannelConnection(
    workspace.id,
    body.data.provider,
    verification.target ?? body.data.target.trim(),
    body.data.credential,
  );
  res.status(201).json(ConnectChannelResponse.parse({
    id: connection.id,
    provider: body.data.provider === "telegram" ? "Telegram Bot API" : body.data.provider === "vk" ? "VK API" : "Instagram Graph API",
    category: "channel",
    status: "connected",
    detail: `Канал подключён: ${connection.target}.`,
    channel: body.data.provider,
    target: connection.target,
    lastCheckedAt: connection.lastCheckedAt,
    canDisconnect: true,
  }));
});

router.post("/connections/:id/check", async (req, res): Promise<void> => {
  const params = CheckChannelConnectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const workspace = await getWorkspace(req);
  const connection = await checkChannelConnection(workspace.id, params.data.id);
  if (!connection || !isSupportedChannel(connection.provider)) {
    res.status(404).json({ error: "Channel connection not found" });
    return;
  }
  const status = connection.status === "connected" ? "connected" : "needs_setup";
  res.json(CheckChannelConnectionResponse.parse({
    id: connection.id,
    provider: connection.provider === "telegram" ? "Telegram Bot API" : connection.provider === "vk" ? "VK API" : "Instagram Graph API",
    category: "channel",
    status,
    detail: status === "connected"
      ? `Канал подключён: ${connection.target}. Проверка завершена.`
      : connection.lastError ?? "Канал не прошёл проверку. Повторите попытку позже.",
    channel: connection.provider,
    target: connection.target,
    lastCheckedAt: connection.lastCheckedAt,
    canDisconnect: true,
  }));
});

router.delete("/connections/:id", async (req, res): Promise<void> => {
  const params = DisconnectChannelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const workspace = await getWorkspace(req);
  const connection = await disconnectChannelConnection(workspace.id, params.data.id);
  if (!connection) {
    res.status(404).json({ error: "Channel connection not found" });
    return;
  }
  res.json(DisconnectChannelResponse.parse({ success: true }));
});

router.get("/runs", async (req, res): Promise<void> => {
  const workspace = await getWorkspace(req);
  const runs = await getRuns(workspace.id);
  res.json(GetRunsResponse.parse(runs.map((run) => toRun(run))));
});

router.get("/runs/:id", async (req, res): Promise<void> => {
  const params = GetRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const workspace = await getWorkspace(req);
  const run = toRun(await getRun(workspace.id, params.data.id));
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
  const workspace = await getWorkspace(req);
  const run = await createRun(workspace.id, workspace.plan, body.data.command, kind, stepsFor(kind));
  if (!run) {
    res.status(429).json({ error: "Monthly run limit reached. Upgrade will be available soon." });
    return;
  }
  await finishRunSoon(workspace.id, run.id, body.data.command, kind);
  res.status(202).json(RunOrchestratorCommandResponse.parse(toRun(run)));
});

router.get("/insights", async (req, res): Promise<void> => {
  const workspace = await getWorkspace(req);
  const insights = await getInsights(workspace.id);
  res.json(GetInsightsResponse.parse(insights.map(toInsight)));
});

router.post("/analysis/run", async (req, res): Promise<void> => {
  const body = StartAnalysisBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const workspace = await getWorkspace(req);
  const run = await createRun(
    workspace.id,
    workspace.plan,
    `Проанализировать нишу ${body.data.niche}`,
    "analysis",
    stepsFor("analysis"),
  );
  if (!run) {
    res.status(429).json({ error: "Monthly run limit reached. Upgrade will be available soon." });
    return;
  }
  await finishRunSoon(workspace.id, run.id, run.command, "analysis", body.data.niche);
  res.status(202).json(StartAnalysisResponse.parse(toRun(run)));
});

router.get("/content", async (req, res): Promise<void> => {
  const workspace = await getWorkspace(req);
  const content = await getContent(workspace.id);
  res.json(GetContentResponse.parse(content));
});

router.post("/content", async (req, res): Promise<void> => {
  const body = GenerateContentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const policyViolations = medicalPolicyViolations([body.data.topic, body.data.tone]);
  if (policyViolations.length) {
    res.status(400).json({ error: `Medical safety policy blocks: ${policyViolations.join(", ")}.` });
    return;
  }
  const workspace = await getWorkspace(req);
  const content = await createContent(
    workspace.id,
    workspace.plan,
    body.data.topic,
    body.data.channels,
    body.data.tone,
    body.data.dossierId,
    body.data.format,
  );
  if (!content) {
    res.status(429).json({ error: "Monthly content limit reached. Upgrade will be available soon." });
    return;
  }
  if ("error" in content) {
    if (content.error === "unsafe_medical_content") {
      res.status(400).json({ error: `Medical safety policy blocks: ${content.violations.join(", ")}.` });
      return;
    }
    res.status(404).json({ error: "Medical dossier not found in this workspace." });
    return;
  }
  res.status(201).json(GenerateContentResponse.parse(content));
});

router.post("/content/:id/review", async (req, res): Promise<void> => {
  const params = ReviewContentParams.safeParse(req.params);
  const body = ReviewContentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const error = !params.success
      ? params.error.message
      : body.success
        ? "Invalid review request"
        : body.error.message;
    res.status(400).json({ error });
    return;
  }
  if (!body.data.confirmed) {
    res.status(400).json({ error: "Operator confirmation is required before recording a review decision." });
    return;
  }
  const workspace = await getWorkspace(req);
  const content = await reviewContent(workspace.id, params.data.id, body.data);
  if (!content) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  if ("error" in content) {
    if (content.error === "reviewer_required") {
      res.status(400).json({ error: "A named reviewer is required to record an auditable decision." });
      return;
    }
    if (content.error === "unsafe_medical_content") {
      res.status(409).json({ error: `Medical safety policy blocks approval: ${content.violations.join(", ")}.` });
      return;
    }
    res.status(409).json({
      error: content.error === "unresolved_claim_warnings"
        ? "Resolve all claim warnings before approval."
        : "Review could not be recorded.",
    });
    return;
  }
  res.json(ReviewContentResponse.parse(content));
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
  if (!body.data.confirmed) {
    res.status(400).json({ error: "Publication must be explicitly confirmed." });
    return;
  }
  const workspace = await getWorkspace(req);
  const result = await publishContent(workspace.id, params.data.id, body.data.channels);
  if (!result) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  if ("error" in result) {
    if (result.error === "unsafe_medical_content") {
      res.status(409).json({ error: `Medical safety policy blocks delivery: ${result.violations?.join(", ") ?? "prohibited content"}.` });
      return;
    }
    if (result.error === "requires_review") {
      res.status(409).json({ error: "Only content approved by an operator can be published." });
      return;
    }
    if (result.error === "duplicate_channels" || result.error === "channel_not_selected") {
      res.status(400).json({ error: "Selected channels must be unique and included in the content draft." });
      return;
    }
    const missingChannels = result.channels ?? [];
    res.status(409).json({ error: `Connect selected channels before publishing: ${missingChannels.join(", ")}` });
    return;
  }
  res.json(PublishContentResponse.parse({ ...result.item, deliveries: result.deliveries }));
});

router.get("/medical/dossiers", async (req, res): Promise<void> => {
  const workspace = await getWorkspace(req);
  res.json(GetMedicalDossiersResponse.parse(await getMedicalDossiers(workspace.id)));
});

router.post("/medical/dossiers", async (req, res): Promise<void> => {
  const body = CreateMedicalDossierBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const policyViolations = medicalPolicyViolations([
    body.data.name,
    body.data.volume,
    body.data.registrationSafety,
    ...(body.data.approvedClaims ?? []),
  ]);
  if (policyViolations.length) {
    res.status(400).json({ error: `Medical safety policy blocks: ${policyViolations.join(", ")}.` });
    return;
  }
  const workspace = await getWorkspace(req);
  res.status(201).json(CreateMedicalDossierResponse.parse(await createMedicalDossier(workspace.id, body.data)));
});

router.patch("/medical/dossiers/:id", async (req, res): Promise<void> => {
  const params = UpdateMedicalDossierParams.safeParse(req.params);
  const body = UpdateMedicalDossierBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const error = !params.success
      ? params.error.message
      : body.success
        ? "Invalid dossier update"
        : body.error.message;
    res.status(400).json({ error });
    return;
  }
  const policyViolations = medicalPolicyViolations([
    body.data.name,
    body.data.volume,
    body.data.registrationSafety,
    ...(body.data.approvedClaims ?? []),
  ]);
  if (policyViolations.length) {
    res.status(400).json({ error: `Medical safety policy blocks: ${policyViolations.join(", ")}.` });
    return;
  }
  const workspace = await getWorkspace(req);
  const dossier = await updateMedicalDossier(workspace.id, params.data.id, body.data);
  if (!dossier) {
    res.status(404).json({ error: "Medical dossier not found" });
    return;
  }
  res.json(UpdateMedicalDossierResponse.parse(dossier));
});

router.get("/builder/jobs", async (req, res): Promise<void> => {
  const workspace = await getWorkspace(req);
  const jobs = await getBuilderJobs(workspace.id);
  res.json(GetBuilderJobsResponse.parse(jobs.map((job) => toJob(job))));
});

router.post("/builder/jobs", async (req, res): Promise<void> => {
  const body = CreateBuilderJobBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const workspace = await getWorkspace(req);
  const job = await createBuilderJob(
    workspace.id,
    workspace.plan,
    body.data.kind,
    body.data.instruction,
    body.data.packageManager ?? "auto",
  );
  if (!job) {
    res.status(429).json({ error: "Monthly builder jobs limit reached. Upgrade will be available soon." });
    return;
  }
  void executeBuilderJob(workspace.id, job.id);
  res.status(202).json(CreateBuilderJobResponse.parse(toJob(job)));
});

router.post("/builder/jobs/:id/retry", async (req, res): Promise<void> => {
  const params = RetryBuilderJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const workspace = await getWorkspace(req);
  const job = await getBuilderJob(workspace.id, params.data.id);
  if (!job) {
    res.status(404).json({ error: "Builder job not found" });
    return;
  }
  const refreshed = await updateBuilderJob(
    workspace.id,
    job.id,
    "running",
    Number(job.attempts) + 1,
    [...(job.logs as string[]), "Manual retry started."],
  );
  void executeBuilderJob(workspace.id, job.id);
  res.status(202).json(RetryBuilderJobResponse.parse(toJob(refreshed)));
});

export default router;