import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import {
  CreateMedicalDossierResponse,
  GenerateContentResponse,
  GetAccountOverviewResponse,
  GetContentResponse,
  GetMedicalDossiersResponse,
  ReviewContentResponse,
} from "@workspace/api-zod";
import type { ErrorResponse, QuotaExceededResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import productionApp, { createTestApp } from "./app";
import { initializeAgent360Schema } from "./lib/agent360-schema-init";
import { applyStripeSubscriptionState } from "./lib/agent360-store";
import { getOrCreatePrice } from "./lib/stripeService";
import { getStripeCredentials } from "./lib/stripeClient";
import Stripe from "stripe";

const testUserPrefix = `security-test-${Date.now()}-`;
const userIds = new Set<string>();
const paidPlanIds = ["starter", "pro"] as const;
type PaidPlanId = (typeof paidPlanIds)[number];
type StripeTestResource = {
  customerId?: string;
  checkoutSessionId?: string;
  checkoutSessionUrl?: string;
  paymentMethodId?: string;
  planId: PaidPlanId;
  subscriptionId?: string;
  workspaceId: string;
  userId: string;
};
const stripeWebhookRegressionEnabled = process.env.RUN_STRIPE_WEBHOOK_REGRESSION === "true";
const stripeCheckoutBrowserHoldSeconds = Number.parseInt(
  process.env.STRIPE_CHECKOUT_BROWSER_HOLD_SECONDS ?? "0",
  10,
);
const stripeCheckoutBrowserRegressionEnabled = Number.isFinite(stripeCheckoutBrowserHoldSeconds)
  && stripeCheckoutBrowserHoldSeconds > 0;
const stripeCheckoutBrowserSessionFile = process.env.STRIPE_CHECKOUT_BROWSER_SESSION_FILE;
const stripeCheckoutBrowserCompletionFile = process.env.STRIPE_CHECKOUT_BROWSER_COMPLETION_FILE;
const stripeCheckoutBrowserFailureFile = process.env.STRIPE_CHECKOUT_BROWSER_FAILURE_FILE;
const releaseRunnerFile = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/src/stripe-webhook-browser-release-test.ts",
);

let server: Server;
let baseUrl: string;
let productionServer: Server;
let productionBaseUrl: string;

function registerUser(): string {
  const userId = `${testUserPrefix}${userIds.size}`;
  userIds.add(userId);
  return userId;
}

function assertErrorResponse(body: unknown): asserts body is ErrorResponse {
  assert.ok(body && typeof body === "object" && "error" in body);
  assert.equal(typeof body.error, "string");
}

async function request(
  path: string,
  userId: string | undefined,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (userId) headers.set("x-test-user-id", userId);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function json(response: Response): Promise<unknown> {
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/);
  return response.json();
}

function stripeObject(event: Stripe.Event): Record<string, unknown> {
  return event.data.object as unknown as Record<string, unknown>;
}

function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  return null;
}

function eventReferencesSubscription(event: Stripe.Event, subscriptionId: string, customerId: string): boolean {
  const object = stripeObject(event);
  if (event.type.startsWith("customer.subscription.") && object.id === subscriptionId) return true;
  if (stripeObjectId(object.customer) === customerId) {
    if (event.type.startsWith("invoice.")) {
      const parent = object.parent;
      if (parent && typeof parent === "object" && "subscription_details" in parent) {
        const details = parent.subscription_details;
        if (details && typeof details === "object" && "subscription" in details) {
          return stripeObjectId(details.subscription) === subscriptionId;
        }
      }
      return stripeObjectId(object.subscription) === subscriptionId;
    }
    if (event.type === "checkout.session.completed") {
      return stripeObjectId(object.subscription) === subscriptionId;
    }
  }
  return false;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForFile(path: string, timeoutMilliseconds: number): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      await readFile(path, "utf8");
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await wait(25);
  }
  throw new Error(`Expected marker ${path} within ${timeoutMilliseconds}ms.`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function waitForHostedCheckoutBrowser({
  resources,
  timeoutSeconds,
}: {
  resources: Map<PaidPlanId, StripeTestResource>;
  timeoutSeconds: number;
}): Promise<void> {
  if (!stripeCheckoutBrowserCompletionFile) {
    await wait(timeoutSeconds * 1_000);
    return;
  }

  const deadline = Date.now() + timeoutSeconds * 1_000;
  while (Date.now() < deadline) {
    if (stripeCheckoutBrowserFailureFile) {
      try {
        const reason = (await readFile(stripeCheckoutBrowserFailureFile, "utf8")).trim();
        throw new Error(reason || "The hosted Checkout browser harness reported a failure.");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    try {
      await readFile(stripeCheckoutBrowserCompletionFile, "utf8");
      return;
    } catch {
      await wait(1_000);
    }
  }

  const completedPlans = paidPlanIds
    .filter((planId) => resources.get(planId)?.checkoutSessionUrl)
    .join(", ");
  throw new Error(
    `Hosted Checkout browser harness did not complete within ${timeoutSeconds}s (sessions: ${completedPlans}).`,
  );
}

async function relatedStripeEvents(
  stripe: Stripe,
  subscriptionId: string,
  customerId: string,
  createdAfter: number,
  requireCheckoutCompletion = false,
): Promise<Stripe.Event[]> {
  const supportedLifecycleEvents = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
  ]);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const events = await stripe.events.list({
      created: { gte: createdAfter },
      limit: 100,
    });
    const related = events.data.filter(
      (event) =>
        supportedLifecycleEvents.has(event.type) &&
        eventReferencesSubscription(event, subscriptionId, customerId),
    );
    if (
      related.length >= 2 &&
      related.some((event) => event.type === "customer.subscription.created") &&
      related.some((event) => event.type === "invoice.paid" || event.type === "invoice.payment_failed") &&
      (!requireCheckoutCompletion || related.some((event) => event.type === "checkout.session.completed"))
    ) {
      return related;
    }
    await wait(500);
  }

  throw new Error(`Stripe did not expose the complete lifecycle for subscription ${subscriptionId}.`);
}

async function relatedStripeEventByType(
  stripe: Stripe,
  type: Stripe.Event.Type,
  subscriptionId: string,
  customerId: string,
  createdAfter: number,
): Promise<Stripe.Event> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const events = await stripe.events.list({
      type,
      created: { gte: createdAfter },
      limit: 100,
    });
    const event = events.data.find((candidate) =>
      eventReferencesSubscription(candidate, subscriptionId, customerId),
    );
    if (event) return event;
    await wait(500);
  }

  throw new Error(`Stripe did not expose ${type} for subscription ${subscriptionId}.`);
}

async function waitForPersistedStripeEvents(workspaceId: string, eventIds: string[]): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const processedEvents = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM agent360_stripe_events
       WHERE workspace_id = $1 AND id = ANY($2::text[])`,
      [workspaceId, eventIds],
    );
    if (Number(processedEvents.rows[0]?.count ?? 0) === eventIds.length) return;
    await wait(1_000);
  }

  throw new Error(`Stripe did not deliver every lifecycle event for workspace ${workspaceId}.`);
}

async function waitForStripeWebhookDelivery({
  userId,
  workspaceId,
  planId,
  events,
}: {
  userId: string;
  workspaceId: string;
  planId: PaidPlanId;
  events: Stripe.Event[];
}): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const accountResponse = await request("/api/account", userId);
    const account = GetAccountOverviewResponse.parse(await json(accountResponse));
    const processedEvents = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM agent360_stripe_events
       WHERE workspace_id = $1 AND id = ANY($2::text[])`,
      [workspaceId, events.map((event) => event.id)],
    );
    if (
      account.workspace.plan === planId &&
      account.subscription.status === "active" &&
      Number(processedEvents.rows[0]?.count ?? 0) === events.length
    ) {
      return;
    }
    await wait(1_000);
  }

  throw new Error(`Stripe did not deliver the lifecycle events for ${planId} to the managed webhook.`);
}

before(async () => {
  productionServer = createServer(productionApp);
  await new Promise<void>((resolve) => {
    productionServer.listen(0, "127.0.0.1", () => resolve());
  });
  const productionAddress = productionServer.address();
  assert.ok(productionAddress && typeof productionAddress !== "string");
  productionBaseUrl = `http://127.0.0.1:${productionAddress.port}`;

  const testApp = createTestApp({
    authResolver: (req) => req.header("x-test-user-id") || null,
  });
  server = createServer(testApp);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await new Promise<void>((resolve, reject) => {
    productionServer.close((error) => (error ? reject(error) : resolve()));
  });

  const ids = [...userIds];
  if (ids.length > 0) {
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    const workspaceQuery = `(SELECT id FROM agent360_workspaces WHERE user_id IN (${placeholders}))`;
    const workspaceResult = await pool.query<{ id: string }>(
      `SELECT id FROM agent360_workspaces WHERE user_id IN (${placeholders})`,
      ids,
    );
    const workspaceIds = workspaceResult.rows.map(({ id }) => id);
    for (const table of [
      "agent360_activities",
      "agent360_memories",
      "agent360_runs",
      "agent360_insights",
      "agent360_content",
      "agent360_medical_dossiers",
      "agent360_publish_deliveries",
      "agent360_channel_connections",
      "agent360_builder_jobs",
      "agent360_workspace_usage",
      "agent360_stripe_events",
    ]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id IN ${workspaceQuery}`, ids);
    }
    await pool.query(`DELETE FROM agent360_workspaces WHERE user_id IN (${placeholders})`, ids);
    if (workspaceIds.length > 0) {
      const remainingEvents = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM agent360_stripe_events
         WHERE workspace_id = ANY($1::text[])`,
        [workspaceIds],
      );
      assert.equal(Number(remainingEvents.rows[0]?.count ?? 0), 0);
      console.log(`Confirmed no Stripe test event rows remain for ${workspaceIds.length} workspace(s).`);
    }
  }
  await pool.end();
});

describe("agent 360 authentication and quota regression", () => {
  test("release runner writes cancellation failure before child cleanup completes", async () => {
    const runDirectory = await mkdtemp(resolve(tmpdir(), "agent360-release-cancellation-"));
    const browserWaitStartedFile = resolve(runDirectory, "browser-wait-started");
    const completionFile = resolve(runDirectory, "cleanup-completed");
    const failureFile = resolve(runDirectory, "release-failed");
    const childScript = [
      "const { mkdir, writeFile } = require('node:fs/promises');",
      "const { dirname } = require('node:path');",
      "(async () => {",
      "  await mkdir(dirname(process.env.STRIPE_CHECKOUT_BROWSER_WAIT_STARTED_FILE), { recursive: true });",
      "  await writeFile(process.env.STRIPE_CHECKOUT_BROWSER_WAIT_STARTED_FILE, 'browser wait started');",
      "  await new Promise((resolve) => setTimeout(resolve, 1000));",
      "  await writeFile(process.env.STRIPE_CHECKOUT_BROWSER_COMPLETION_FILE, 'child cleanup completed');",
      "})().catch((error) => { console.error(error); process.exitCode = 1; });",
    ].join("\n");
    const runner = spawn(
      process.execPath,
      ["--import", "tsx/esm", releaseRunnerFile],
      {
        cwd: resolve(dirname(fileURLToPath(import.meta.url)), "../../../scripts"),
        env: {
          ...process.env,
          NODE_ENV: "test",
          STRIPE_CHECKOUT_BROWSER_SESSION_FILE: resolve(runDirectory, "sessions.json"),
          STRIPE_CHECKOUT_BROWSER_COMPLETION_FILE: completionFile,
          STRIPE_CHECKOUT_BROWSER_FAILURE_FILE: failureFile,
          STRIPE_CHECKOUT_BROWSER_RELEASE_CHILD_COMMAND: JSON.stringify({
            command: process.execPath,
            args: ["-e", childScript],
          }),
          STRIPE_CHECKOUT_BROWSER_WAIT_STARTED_FILE: browserWaitStartedFile,
        },
        stdio: "ignore",
      },
    );
    const runnerExit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolveExit, reject) => {
        runner.once("error", reject);
        runner.once("exit", (code, signal) => resolveExit({ code, signal }));
      },
    );

    try {
      await waitForFile(browserWaitStartedFile, 5_000);
      assert.equal(runner.kill("SIGTERM"), true);
      await waitForFile(failureFile, 2_000);
      assert.equal(await fileExists(completionFile), false);

      const result = await runnerExit;
      assert.equal(result.signal, null);
      assert.notEqual(result.code, 0);
      await waitForFile(completionFile, 2_000);
    } finally {
      if (runner.exitCode === null && runner.signalCode === null) {
        runner.kill("SIGKILL");
      }
      await rm(runDirectory, { recursive: true, force: true });
    }
  });

  test("reuses one Stripe product and price during parallel catalog creation", async () => {
    const products: Array<{ id: string; created: number; metadata: { agent360_plan: string } }> = [];
    const prices: Array<{
      id: string;
      created: number;
      currency: string;
      unit_amount: number;
      recurring: { interval: string };
    }> = [];
    let productCreates = 0;
    let priceCreates = 0;
    const wait = () => new Promise((resolve) => setTimeout(resolve, 25));
    const stripe = {
      products: {
        list: async () => ({ data: products }),
        create: async () => {
          productCreates += 1;
          await wait();
          const product = {
            id: "prod_agent360_starter",
            created: 1,
            metadata: { agent360_plan: "starter" },
          };
          products.push(product);
          return product;
        },
        update: async () => undefined,
      },
      prices: {
        list: async () => ({ data: prices }),
        create: async () => {
          priceCreates += 1;
          await wait();
          const price = {
            id: "price_agent360_starter_monthly",
            created: 1,
            currency: "usd",
            unit_amount: 900,
            recurring: { interval: "month" },
          };
          prices.push(price);
          return price;
        },
        update: async () => undefined,
      },
    } as unknown as Stripe;

    const result = await Promise.all([
      getOrCreatePrice("starter", stripe),
      getOrCreatePrice("starter", stripe),
    ]);

    assert.deepEqual(result, ["price_agent360_starter_monthly", "price_agent360_starter_monthly"]);
    assert.equal(productCreates, 1);
    assert.equal(priceCreates, 1);
  });

  test("deactivates every noncanonical active monthly USD price", async () => {
    const deactivatedPriceIds: string[] = [];
    const stripe = {
      products: {
        list: async () => ({
          data: [{ id: "prod_agent360_starter", created: 1, metadata: { agent360_plan: "starter" } }],
        }),
        create: async () => undefined,
        update: async () => undefined,
      },
      prices: {
        list: async () => ({
          data: [
            {
              id: "price_agent360_starter_monthly",
              created: 1,
              currency: "usd",
              unit_amount: 900,
              recurring: { interval: "month" },
            },
            {
              id: "price_agent360_starter_legacy_monthly",
              created: 2,
              currency: "usd",
              unit_amount: 1200,
              recurring: { interval: "month" },
            },
            {
              id: "price_agent360_starter_yearly",
              created: 3,
              currency: "usd",
              unit_amount: 9000,
              recurring: { interval: "year" },
            },
          ],
        }),
        create: async () => undefined,
        update: async (id: string, update: { active?: boolean }) => {
          if (update.active === false) deactivatedPriceIds.push(id);
        },
      },
    } as unknown as Stripe;

    assert.equal(await getOrCreatePrice("starter", stripe), "price_agent360_starter_monthly");
    assert.deepEqual(deactivatedPriceIds, ["price_agent360_starter_legacy_monthly"]);
  });

  test("does not persist a Stripe event after its workspace is deleted", async () => {
    const workspaceId = `deleted-workspace-${Date.now()}`;
    const eventId = `evt_deleted_workspace_${Date.now()}`;
    const outcome = await applyStripeSubscriptionState({
      eventId,
      eventCreatedAt: new Date(),
      workspaceId,
      stripeCustomerId: "cus_deleted_workspace",
      stripeSubscriptionId: "sub_deleted_workspace",
      status: "canceled",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      planId: "starter",
    });

    assert.equal(outcome, "stale");
    const persisted = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM agent360_stripe_events WHERE id = $1`,
      [eventId],
    );
    assert.equal(Number(persisted.rows[0]?.count ?? 0), 0);
  });

  test(
    "keeps one active monthly USD catalog per paid plan during real test-mode webhook delivery",
    { skip: stripeWebhookRegressionEnabled ? false : "Set RUN_STRIPE_WEBHOOK_REGRESSION=true to run Stripe test-mode delivery." },
    async () => {
      const { secretKey } = await getStripeCredentials();
      assert.match(secretKey, /^(sk|rk)_test_/);
      const stripeClient: Stripe = new Stripe(secretKey);
      const resources = new Map<PaidPlanId, StripeTestResource>();
      const amounts: Record<PaidPlanId, number> = { starter: 900, pro: 2900 };

      try {
        for (const planId of paidPlanIds) {
          const userId = registerUser();
          const accountResponse = await request("/api/account", userId);
          const account = GetAccountOverviewResponse.parse(await json(accountResponse));
          const resource: StripeTestResource = {
            planId,
            workspaceId: account.workspace.id,
            userId,
          };
          resources.set(planId, resource);
          const checkoutResponse = await request("/api/billing/checkout", userId, {
            method: "POST",
            body: JSON.stringify({ plan: planId }),
          });
          assert.equal(checkoutResponse.status, 200);
          const checkoutBody = (await json(checkoutResponse)) as { url?: string };
          assert.match(checkoutBody.url ?? "", /^https:\/\/checkout\.stripe\.com\//);
          resource.checkoutSessionUrl = checkoutBody.url;

          const workspaceResult = await pool.query<{ stripe_customer_id: string | null }>(
            "SELECT stripe_customer_id FROM agent360_workspaces WHERE id = $1",
            [account.workspace.id],
          );
          const customerId = workspaceResult.rows[0]?.stripe_customer_id;
          assert.ok(customerId, `Stripe customer was not persisted for ${planId}.`);
          resource.customerId = customerId;

          const checkoutSessions = await stripeClient.checkout.sessions.list({
            customer: customerId,
            limit: 100,
          });
          const checkoutSession = checkoutSessions.data.find(
            (session) =>
              session.metadata?.agent360_workspace_id === account.workspace.id &&
              session.metadata?.agent360_plan === planId,
          );
          assert.ok(checkoutSession, `Checkout session was not created for ${planId}.`);
          assert.equal(checkoutSession.status, "open");
          resource.checkoutSessionId = checkoutSession.id;

          const priceId = await getOrCreatePrice(planId, stripeClient);
          const checkoutWithItems = await stripeClient.checkout.sessions.retrieve(checkoutSession.id, {
            expand: ["line_items"],
          });
          assert.equal(checkoutWithItems.line_items?.data[0]?.price?.id, priceId);

        }

        if (stripeCheckoutBrowserRegressionEnabled) {
          if (stripeCheckoutBrowserSessionFile) {
            await mkdir(dirname(stripeCheckoutBrowserSessionFile), { recursive: true });
            await writeFile(
              stripeCheckoutBrowserSessionFile,
              JSON.stringify(
                paidPlanIds.map((planId) => ({
                  planId,
                  url: resources.get(planId)?.checkoutSessionUrl,
                })),
                null,
                2,
              ),
              "utf8",
            );
          }
          console.log(
            `Complete both hosted Checkout sessions within ${stripeCheckoutBrowserHoldSeconds}s: ${
              JSON.stringify(
                paidPlanIds.map((planId) => ({
                  planId,
                  url: resources.get(planId)?.checkoutSessionUrl,
                })),
              )
            }`,
          );
          await waitForHostedCheckoutBrowser({
            resources,
            timeoutSeconds: stripeCheckoutBrowserHoldSeconds,
          });
        }

        const subscriptions = await Promise.all(
          paidPlanIds.map(async (planId) => {
            const resource = resources.get(planId);
            assert.ok(resource);
            const customerId = resource.customerId;
            assert.ok(customerId, `Stripe customer was not persisted for ${planId}.`);
            assert.ok(resource.checkoutSessionId);
            const priceId = await getOrCreatePrice(planId, stripeClient);
            const checkoutSession = await stripeClient.checkout.sessions.retrieve(resource.checkoutSessionId);
            const checkoutSubscriptionId = stripeObjectId(checkoutSession.subscription);
            if (checkoutSession.status === "complete" && checkoutSession.payment_status === "paid") {
              assert.ok(
                checkoutSubscriptionId,
                `Completed ${planId} Checkout session did not create a subscription.`,
              );
              const subscription = await stripeClient.subscriptions.retrieve(checkoutSubscriptionId);
              assert.equal(subscription.items.data[0]?.price.id, priceId);
              resource.subscriptionId = subscription.id;
              return {
                createdAfter: checkoutSession.created - 5,
                planId,
                requireCheckoutCompletion: true,
                resource,
                subscription,
              };
            }
            assert.ok(
              !stripeCheckoutBrowserRegressionEnabled,
              `Hosted Checkout was not completed for ${planId} within ${stripeCheckoutBrowserHoldSeconds}s.`,
            );

            const createdAfter = Math.floor(Date.now() / 1_000) - 5;
            const paymentMethod = await stripeClient.paymentMethods.create({
              type: "card",
              card: { token: "tok_visa" },
            });
            await stripeClient.paymentMethods.attach(paymentMethod.id, {
              customer: customerId,
            });
            resource.paymentMethodId = paymentMethod.id;
            await stripeClient.customers.update(customerId, {
              invoice_settings: { default_payment_method: paymentMethod.id },
            });
            const subscription = await stripeClient.subscriptions.create({
              customer: customerId,
              items: [{ price: priceId, quantity: 1 }],
              default_payment_method: paymentMethod.id,
              payment_behavior: "error_if_incomplete",
              metadata: {
                agent360_workspace_id: resource.workspaceId,
                agent360_plan: planId,
              },
            });
            assert.equal(subscription.livemode, false);
            assert.equal(subscription.items.data[0]?.price.id, priceId);
            resource.subscriptionId = subscription.id;
            return { createdAfter, planId, requireCheckoutCompletion: false, resource, subscription };
          }),
        );

        const lifecycleEvents = await Promise.all(
          subscriptions.map(async ({ createdAfter, requireCheckoutCompletion, resource, subscription }) => {
            const events = await relatedStripeEvents(
              stripeClient,
              subscription.id,
              resource.customerId!,
              createdAfter,
              requireCheckoutCompletion,
            );
            assert.ok(events.some((event) => event.type === "customer.subscription.created"));
            assert.ok(events.some((event) => event.type === "invoice.paid"));
            if (requireCheckoutCompletion) {
              assert.ok(events.some((event) => event.type === "checkout.session.completed"));
            }
            return { events, resource, planId: resource.planId };
          }),
        );

        await Promise.all(
          lifecycleEvents.map(async ({ events, resource, planId }) => {
            await waitForStripeWebhookDelivery({
              userId: resource.userId,
              workspaceId: resource.workspaceId,
              planId,
              events,
            });
          }),
        );

        for (const planId of paidPlanIds) {
          const products = await stripeClient.products.list({ active: true, limit: 100 });
          const matchingProducts = products.data.filter(
            (product) => product.metadata.agent360_plan === planId,
          );
          assert.equal(matchingProducts.length, 1, `Expected one active ${planId} product.`);

          const prices = await stripeClient.prices.list({
            product: matchingProducts[0]!.id,
            active: true,
            type: "recurring",
            limit: 100,
          });
          const matchingPrices = prices.data.filter(
            (price) =>
              price.currency === "usd" &&
              price.recurring?.interval === "month",
          );
          assert.equal(matchingPrices.length, 1, `Expected one active monthly USD ${planId} price.`);
          assert.equal(matchingPrices[0]?.unit_amount, amounts[planId]);
        }
      } finally {
        const cleanupFailures: string[] = [];
        for (const [planId, resource] of resources) {
          if (!resource.customerId) {
            const workspaceResult = await pool.query<{ stripe_customer_id: string | null }>(
              "SELECT stripe_customer_id FROM agent360_workspaces WHERE id = $1",
              [resource.workspaceId],
            );
            resource.customerId = workspaceResult.rows[0]?.stripe_customer_id ?? undefined;
          }
          if (!resource.customerId) continue;

          if (resource.subscriptionId) {
            try {
              const cancellationStarted = Math.floor(Date.now() / 1_000) - 5;
              const subscription = await stripeClient.subscriptions.retrieve(resource.subscriptionId);
              if (subscription.status !== "canceled") {
                const canceledSubscription = await stripeClient.subscriptions.cancel(resource.subscriptionId);
                assert.equal(canceledSubscription.status, "canceled");
                const deletedEvent = await relatedStripeEventByType(
                  stripeClient,
                  "customer.subscription.deleted",
                  resource.subscriptionId,
                  resource.customerId,
                  cancellationStarted,
                );
                await waitForPersistedStripeEvents(resource.workspaceId, [deletedEvent.id]);
              }
            } catch (error) {
              cleanupFailures.push(`${planId} subscription: ${error instanceof Error ? error.message : String(error)}`);
            }
          }

          try {
            const sessions = await stripeClient.checkout.sessions.list({
              customer: resource.customerId,
              limit: 100,
            });
            for (const session of sessions.data) {
              if (session.status === "open") {
                const expiredSession = await stripeClient.checkout.sessions.expire(session.id);
                assert.equal(expiredSession.status, "expired");
              }
            }
          } catch (error) {
            cleanupFailures.push(`${planId} checkout: ${error instanceof Error ? error.message : String(error)}`);
          }

          if (resource.paymentMethodId) {
            try {
              const detachedPaymentMethod = await stripeClient.paymentMethods.detach(resource.paymentMethodId);
              assert.equal(detachedPaymentMethod.customer, null);
            } catch (error) {
              cleanupFailures.push(`${planId} payment method: ${error instanceof Error ? error.message : String(error)}`);
            }
          }

          try {
            const deletedCustomer = await stripeClient.customers.del(resource.customerId);
            assert.equal(deletedCustomer.deleted, true);
          } catch (error) {
            cleanupFailures.push(`${planId} customer: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        if (cleanupFailures.length > 0) {
          throw new Error(`Stripe test cleanup failed: ${cleanupFailures.join("; ")}`);
        }
      }
    },
  );

  test("initializes publishing schema without a Stripe domain", async () => {
    const originalDomain = process.env.REPLIT_DOMAINS;
    delete process.env.REPLIT_DOMAINS;
    try {
      assert.equal(await initializeAgent360Schema(), true);
      const result = await pool.query<{
        connections: string | null;
        deliveries: string | null;
      }>(`
        SELECT
          to_regclass('public.agent360_channel_connections')::text AS connections,
          to_regclass('public.agent360_publish_deliveries')::text AS deliveries
      `);
      assert.equal(result.rows[0]?.connections, "agent360_channel_connections");
      assert.equal(result.rows[0]?.deliveries, "agent360_publish_deliveries");
    } finally {
      if (originalDomain === undefined) delete process.env.REPLIT_DOMAINS;
      else process.env.REPLIT_DOMAINS = originalDomain;
    }
  });

  test("migration keeps the newest active connection and revokes older credentials", async () => {
    const userId = registerUser();
    const account = await request("/api/account", userId);
    const overview = GetAccountOverviewResponse.parse(await json(account));
    const olderId = `legacy-older-${Date.now()}`;
    const newerId = `legacy-newer-${Date.now()}`;
    const olderCredential = "legacy-older-encrypted-credential";
    const newerCredential = "legacy-newer-encrypted-credential";
    const olderCreatedAt = new Date("2026-01-01T00:00:00.000Z");
    const newerCreatedAt = new Date("2026-01-02T00:00:00.000Z");

    await pool.query("DROP INDEX IF EXISTS agent360_channel_connections_workspace_provider_unique");
    await pool.query(
      `INSERT INTO agent360_channel_connections
        (id, workspace_id, provider, target, credential_ciphertext, is_active, status, created_at)
       VALUES
        ($1, $3, 'telegram', '@legacy_old', $4, true, 'connected', $5),
        ($2, $3, 'telegram', '@legacy_new', $6, true, 'connected', $7)`,
      [olderId, newerId, overview.workspace.id, olderCredential, olderCreatedAt, newerCredential, newerCreatedAt],
    );

    await initializeAgent360Schema();

    const connections = await pool.query<{
      id: string;
      target: string;
      credential_ciphertext: string | null;
      is_active: boolean;
      status: string;
      last_error: string | null;
    }>(
      `SELECT id, target, credential_ciphertext, is_active, status, last_error
       FROM agent360_channel_connections
       WHERE workspace_id = $1 AND provider = 'telegram'
       ORDER BY created_at`,
      [overview.workspace.id],
    );
    assert.equal(connections.rows.length, 2);
    assert.deepEqual(connections.rows[0], {
      id: olderId,
      target: "@legacy_old",
      credential_ciphertext: null,
      is_active: false,
      status: "needs_setup",
      last_error: "Заменено более новым подключением канала.",
    });
    assert.deepEqual(connections.rows[1], {
      id: newerId,
      target: "@legacy_new",
      credential_ciphertext: newerCredential,
      is_active: true,
      status: "connected",
      last_error: null,
    });
  });

  test("parallel connects leave one active canonical provider target per workspace", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith("https://api.telegram.org/")) {
        return originalFetch(input, init);
      }
      if (url.includes("/getMe")) {
        return Response.json({ ok: true, result: { id: 901 } });
      }
      if (url.includes("/getChat?")) {
        return Response.json({ ok: true, result: { id: -100777 } });
      }
      if (url.includes("/getChatMember?")) {
        return Response.json({ ok: true, result: { status: "administrator", can_post_messages: true } });
      }
      return Response.json({ ok: false }, { status: 404 });
    };

    try {
      const userId = registerUser();
      const responses = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          request("/api/connections", userId, {
            method: "POST",
            body: JSON.stringify({
              provider: "telegram",
              target: `@parallel_${index}`,
              credential: `parallel-telegram-credential-${index}`,
            }),
          }),
        ),
      );
      assert.deepEqual(
        responses.map((response) => response.status).sort((left, right) => left - right),
        Array.from({ length: 12 }, () => 201),
      );
      for (const [index, response] of responses.entries()) {
        const body = await json(response);
        assert.doesNotMatch(JSON.stringify(body), new RegExp(`parallel-telegram-credential-${index}`));
      }

      const account = await request("/api/account", userId);
      const overview = GetAccountOverviewResponse.parse(await json(account));
      const activeConnections = await pool.query<{ count: string; target: string | null }>(
        `SELECT count(*)::text AS count, max(target) AS target
         FROM agent360_channel_connections
         WHERE workspace_id = $1 AND provider = 'telegram' AND is_active = true
         GROUP BY provider`,
        [overview.workspace.id],
      );
      assert.equal(activeConnections.rows.length, 1);
      assert.equal(activeConnections.rows[0]?.count, "1");
      assert.equal(activeConnections.rows[0]?.target, "-100777");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects cross-workspace channel checks and disconnects without changing the owner", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith("https://api.telegram.org/")) {
        return originalFetch(input, init);
      }
      if (url.includes("/getMe")) {
        return Response.json({ ok: true, result: { id: 901 } });
      }
      if (url.includes("/getChat?")) {
        return Response.json({ ok: true, result: { id: -100888 } });
      }
      if (url.includes("/getChatMember?")) {
        return Response.json({ ok: true, result: { status: "administrator", can_post_messages: true } });
      }
      return Response.json({ ok: false }, { status: 404 });
    };

    try {
      const owner = registerUser();
      const otherUser = registerUser();
      const ownerConnection = await request("/api/connections", owner, {
        method: "POST",
        body: JSON.stringify({
          provider: "telegram",
          target: "@owner_channel",
          credential: "cross-workspace-credential",
        }),
      });
      assert.equal(ownerConnection.status, 201);
      const ownerConnectionBody = await json(ownerConnection) as { id: string; target: string; status: string };
      assert.doesNotMatch(JSON.stringify(ownerConnectionBody), /cross-workspace-credential/);

      const crossWorkspaceCheck = await request(`/api/connections/${ownerConnectionBody.id}/check`, otherUser, {
        method: "POST",
      });
      assert.equal(crossWorkspaceCheck.status, 404);
      assertErrorResponse(await json(crossWorkspaceCheck));

      const crossWorkspaceDisconnect = await request(`/api/connections/${ownerConnectionBody.id}`, otherUser, {
        method: "DELETE",
      });
      assert.equal(crossWorkspaceDisconnect.status, 404);
      assertErrorResponse(await json(crossWorkspaceDisconnect));

      const ownerConnections = await request("/api/connections", owner);
      assert.equal(ownerConnections.status, 200);
      const ownerConnectionsBody = await json(ownerConnections);
      assert.doesNotMatch(JSON.stringify(ownerConnectionsBody), /cross-workspace-credential/);
      assert.equal(
        (ownerConnectionsBody as Array<{ channel?: string; id?: string; status?: string; target?: string }>)
          .find((connection) => connection.id === ownerConnectionBody.id)?.status,
        "connected",
      );
      assert.equal(
        (ownerConnectionsBody as Array<{ channel?: string; id?: string; status?: string; target?: string }>)
          .find((connection) => connection.id === ownerConnectionBody.id)?.target,
        "-100888",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("keeps the production Clerk path authoritative", async () => {
    const response = await fetch(`${productionBaseUrl}/api/account`, {
      headers: { "x-test-user-id": "attempted-auth-bypass" },
    });
    assert.equal(response.status, 401);
    assertErrorResponse(await json(response));
  });

  test("keeps workspace endpoints private while leaving plans public", async () => {
    const guest = await request("/api/account", undefined);
    assert.equal(guest.status, 401);
    assertErrorResponse(await json(guest));

    const plans = await request("/api/plans", undefined);
    assert.equal(plans.status, 200);
    assert.ok(Array.isArray(await json(plans)));
  });

  test("creates isolated workspaces and blocks cross-user reads and writes", async () => {
    const alice = registerUser();
    const bob = registerUser();

    const aliceAccount = await request("/api/account", alice);
    const bobAccount = await request("/api/account", bob);
    assert.equal(aliceAccount.status, 200);
    assert.equal(bobAccount.status, 200);
    const aliceOverview = GetAccountOverviewResponse.parse(await json(aliceAccount));
    const bobOverview = GetAccountOverviewResponse.parse(await json(bobAccount));
    assert.notEqual(aliceOverview.workspace.id, bobOverview.workspace.id);

    const created = await request("/api/content", alice, {
      method: "POST",
      body: JSON.stringify({ topic: "Private launch signal", channels: ["telegram"] }),
    });
    assert.equal(created.status, 201);
    const aliceContent = GenerateContentResponse.parse(await json(created));

    const bobContent = await request("/api/content", bob);
    assert.equal(bobContent.status, 200);
    assert.deepEqual(GetContentResponse.parse(await json(bobContent)), []);

    const crossUserPublish = await request(`/api/content/${aliceContent.id}/publish`, bob, {
      method: "POST",
      body: JSON.stringify({ channels: ["vk"], confirmed: true }),
    });
    assert.equal(crossUserPublish.status, 404);
    assertErrorResponse(await json(crossUserPublish));

    const unconfirmedPublish = await request(`/api/content/${aliceContent.id}/publish`, alice, {
      method: "POST",
      body: JSON.stringify({ channels: ["vk"], confirmed: false }),
    });
    assert.equal(unconfirmedPublish.status, 400);
    assertErrorResponse(await json(unconfirmedPublish));

    const wrongChannelPublish = await request(`/api/content/${aliceContent.id}/publish`, alice, {
      method: "POST",
      body: JSON.stringify({ channels: ["vk"], confirmed: true }),
    });
    assert.equal(wrongChannelPublish.status, 400);
    assertErrorResponse(await json(wrongChannelPublish));

    const duplicateChannelPublish = await request(`/api/content/${aliceContent.id}/publish`, alice, {
      method: "POST",
      body: JSON.stringify({ channels: ["telegram", "telegram"], confirmed: true }),
    });
    assert.equal(duplicateChannelPublish.status, 400);
    assertErrorResponse(await json(duplicateChannelPublish));

    const ownerPublish = await request(`/api/content/${aliceContent.id}/publish`, alice, {
      method: "POST",
      body: JSON.stringify({ channels: ["telegram"], confirmed: true }),
    });
    assert.equal(ownerPublish.status, 409);
    assertErrorResponse(await json(ownerPublish));

    const afterSignOut = await request("/api/account", undefined);
    assert.equal(afterSignOut.status, 401);
    assertErrorResponse(await json(afterSignOut));
  });

  test("keeps medical dossiers isolated and requires a confirmed human review before approval", async () => {
    const alice = registerUser();
    const bob = registerUser();
    const dossierResponse = await request("/api/medical/dossiers", alice, {
      method: "POST",
      body: JSON.stringify({
        name: "Zishell Rose Glam",
        volume: "10 ml",
        sourceLinks: ["https://example.org/source"],
        registrationSafety: "Требуется проверка регистрационных документов и инструкций перед коммерческим использованием.",
        approvedClaims: ["Материал доступен для профессионального ознакомления после проверки dossier."],
        audiences: ["Лицензированные специалисты эстетической медицины"],
        reviewState: "approved",
      }),
    });
    assert.equal(dossierResponse.status, 201);
    const dossier = CreateMedicalDossierResponse.parse(await json(dossierResponse));

    const bobDossiers = await request("/api/medical/dossiers", bob);
    assert.equal(bobDossiers.status, 200);
    assert.deepEqual(GetMedicalDossiersResponse.parse(await json(bobDossiers)), []);

    const crossWorkspaceEdit = await request(`/api/medical/dossiers/${dossier.id}`, bob, {
      method: "PATCH",
      body: JSON.stringify({ reviewState: "approved" }),
    });
    assert.equal(crossWorkspaceEdit.status, 404);
    assertErrorResponse(await json(crossWorkspaceEdit));

    const draftResponse = await request("/api/content", alice, {
      method: "POST",
      body: JSON.stringify({
        topic: "Разбор утверждённых материалов для профессионального сообщества",
        channels: ["telegram"],
        dossierId: dossier.id,
        format: "expert_post",
      }),
    });
    assert.equal(draftResponse.status, 201);
    const draft = GenerateContentResponse.parse(await json(draftResponse));
    assert.equal(draft.reviewState, "pending");
    assert.equal(draft.requiresHumanReview, true);

    const missingConfirmation = await request(`/api/content/${draft.id}/review`, alice, {
      method: "POST",
      body: JSON.stringify({ decision: "approved", reviewer: "Medical reviewer", confirmed: false }),
    });
    assert.equal(missingConfirmation.status, 400);
    assertErrorResponse(await json(missingConfirmation));

    const reviewResponse = await request(`/api/content/${draft.id}/review`, alice, {
      method: "POST",
      body: JSON.stringify({
        decision: "approved",
        reviewer: "Medical reviewer",
        notes: "Claims checked against the attached dossier.",
        confirmed: true,
      }),
    });
    assert.equal(reviewResponse.status, 200);
    const reviewed = ReviewContentResponse.parse(await json(reviewResponse));
    assert.equal(reviewed.status, "approved");
    assert.equal(reviewed.reviewState, "approved");
    assert.equal(reviewed.reviewTrail.length, 1);
    assert.equal(reviewed.reviewTrail[0]?.attested, true);

    const crossWorkspaceReview = await request(`/api/content/${draft.id}/review`, bob, {
      method: "POST",
      body: JSON.stringify({ decision: "approved", confirmed: true }),
    });
    assert.equal(crossWorkspaceReview.status, 404);
    assertErrorResponse(await json(crossWorkspaceReview));
  });

  test("blocks prohibited clinical claims and prevents approval with unresolved dossier warnings", async () => {
    const userId = registerUser();
    const unsafeDossier = await request("/api/medical/dossiers", userId, {
      method: "POST",
      body: JSON.stringify({
        name: "Unsafe dossier",
        volume: "10 ml",
        registrationSafety: "Проверка регистрационных документов обязательна перед любым использованием.",
        approvedClaims: ["Гарантирует клинический результат для каждого пациента."],
        audiences: ["Лицензированные специалисты"],
        reviewState: "needs_evidence",
      }),
    });
    assert.equal(unsafeDossier.status, 400);
    assertErrorResponse(await json(unsafeDossier));

    const unsafeDraft = await request("/api/content", userId, {
      method: "POST",
      body: JSON.stringify({
        topic: "Назначьте пациенту дозировку для гарантированного результата",
        channels: ["telegram"],
      }),
    });
    assert.equal(unsafeDraft.status, 400);
    assertErrorResponse(await json(unsafeDraft));

    const semanticBypassDraft = await request("/api/content", userId, {
      method: "POST",
      body: JSON.stringify({
        topic: "Определите заболевание для конкретного человека",
        channels: ["telegram"],
      }),
    });
    assert.equal(semanticBypassDraft.status, 400);
    assertErrorResponse(await json(semanticBypassDraft));

    for (const topic of [
      "Подберите методику для Анны",
      "recommend a procedure for Maria",
      "determine whether Ivan has flu",
    ]) {
      const namedPersonDraft = await request("/api/content", userId, {
        method: "POST",
        body: JSON.stringify({ topic, channels: ["telegram"] }),
      });
      assert.equal(namedPersonDraft.status, 400, topic);
      assertErrorResponse(await json(namedPersonDraft));
    }

    const connectionsResponse = await request("/api/connections", userId);
    assert.equal(connectionsResponse.status, 200);
    const connections = await json(connectionsResponse) as Array<{ channel?: string; status?: string }>;
    assert.equal(connections.find((connection) => connection.channel === "instagram")?.status, "unavailable");

    const warningDossierResponse = await request("/api/medical/dossiers", userId, {
      method: "POST",
      body: JSON.stringify({
        name: "Evidence pending dossier",
        volume: "10 ml",
        registrationSafety: "Проверка регистрационных документов обязательна перед любым использованием.",
        approvedClaims: [],
        audiences: ["Лицензированные специалисты"],
        reviewState: "approved",
      }),
    });
    assert.equal(warningDossierResponse.status, 201);
    const warningDossier = CreateMedicalDossierResponse.parse(await json(warningDossierResponse));

    const warningDraftResponse = await request("/api/content", userId, {
      method: "POST",
      body: JSON.stringify({
        topic: "Материал для профессионального ознакомления с dossier",
        channels: ["telegram"],
        dossierId: warningDossier.id,
        format: "product_card",
      }),
    });
    assert.equal(warningDraftResponse.status, 201);
    const warningDraft = GenerateContentResponse.parse(await json(warningDraftResponse));
    assert.ok(warningDraft.claimWarnings.length > 0);

    const dossierlessDraftResponse = await request("/api/content", userId, {
      method: "POST",
      body: JSON.stringify({
        topic: "Нейтральный материал для профессионального ознакомления",
        channels: ["telegram"],
      }),
    });
    assert.equal(dossierlessDraftResponse.status, 201);
    const dossierlessDraft = GenerateContentResponse.parse(await json(dossierlessDraftResponse));
    assert.ok(dossierlessDraft.claimWarnings.some((warning) => warning.includes("не привязан к dossier")));

    const blockedApproval = await request(`/api/content/${warningDraft.id}/review`, userId, {
      method: "POST",
      body: JSON.stringify({
        decision: "approved",
        reviewer: "Medical reviewer",
        confirmed: true,
      }),
    });
    assert.equal(blockedApproval.status, 409);
    assertErrorResponse(await json(blockedApproval));
  });

  test("publishes a confirmed Telegram draft without returning its credential", async () => {
    const originalFetch = globalThis.fetch;
    const telegramCredential = "test-telegram-credential";
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith("https://api.telegram.org/")) {
        return originalFetch(input, init);
      }
      if (url.includes("/getMe")) {
        return Response.json({ ok: true, result: { id: 901 } });
      }
      if (url.includes("/getChat?")) {
        return Response.json({ ok: true, result: { id: -100555 } });
      }
      if (url.includes("/getChatMember?")) {
        return Response.json({ ok: true, result: { status: "administrator", can_post_messages: true } });
      }
      if (url.includes("/sendMessage")) {
        return Response.json({ ok: true, result: { message_id: 77 } });
      }
      return Response.json({ ok: false }, { status: 404 });
    };

    try {
      const userId = registerUser();
      const connection = await request("/api/connections", userId, {
        method: "POST",
        body: JSON.stringify({
          provider: "telegram",
          target: "@workspace_test",
          credential: telegramCredential,
        }),
      });
      assert.equal(connection.status, 201);
      const connectionBody = await json(connection);
      assert.doesNotMatch(JSON.stringify(connectionBody), new RegExp(telegramCredential));

      const dossierResponse = await request("/api/medical/dossiers", userId, {
        method: "POST",
        body: JSON.stringify({
          name: "Delivery evidence dossier",
          volume: "10 ml",
          registrationSafety: "Регистрационные документы и инструкции проверены для профессионального ознакомления.",
          approvedClaims: ["Материал доступен для профессионального ознакомления после human review."],
          audiences: ["Лицензированные специалисты"],
          reviewState: "approved",
        }),
      });
      assert.equal(dossierResponse.status, 201);
      const dossier = CreateMedicalDossierResponse.parse(await json(dossierResponse));

      const draftResponse = await request("/api/content", userId, {
        method: "POST",
        body: JSON.stringify({ topic: "Verified delivery", channels: ["telegram"], dossierId: dossier.id }),
      });
      assert.equal(draftResponse.status, 201);
      const draft = GenerateContentResponse.parse(await json(draftResponse));

      const duplicateChannelPublish = await request(`/api/content/${draft.id}/publish`, userId, {
        method: "POST",
        body: JSON.stringify({ channels: ["telegram", "telegram"], confirmed: true }),
      });
      assert.equal(duplicateChannelPublish.status, 400);
      assertErrorResponse(await json(duplicateChannelPublish));

      const targetOutsideDraftPublish = await request(`/api/content/${draft.id}/publish`, userId, {
        method: "POST",
        body: JSON.stringify({ channels: ["vk"], confirmed: true }),
      });
      assert.equal(targetOutsideDraftPublish.status, 400);
      assertErrorResponse(await json(targetOutsideDraftPublish));

      const reviewResponse = await request(`/api/content/${draft.id}/review`, userId, {
        method: "POST",
        body: JSON.stringify({
          decision: "approved",
          reviewer: "Delivery test reviewer",
          notes: "Approved for the isolated Telegram delivery regression.",
          confirmed: true,
        }),
      });
      assert.equal(reviewResponse.status, 200);
      assert.equal(ReviewContentResponse.parse(await json(reviewResponse)).reviewState, "approved");

      const publishResponse = await request(`/api/content/${draft.id}/publish`, userId, {
        method: "POST",
        body: JSON.stringify({ channels: ["telegram"], confirmed: true }),
      });
      assert.equal(publishResponse.status, 200);
      const published = await json(publishResponse) as {
        status?: string;
        deliveries?: Array<{ status?: string; externalId?: string | null }>;
      };
      assert.equal(published.status, "published");
      assert.equal(published.deliveries?.[0]?.status, "published");
      assert.equal(published.deliveries?.[0]?.externalId, "77");
      assert.doesNotMatch(JSON.stringify(published), new RegExp(telegramCredential));

      const account = await request("/api/account", userId);
      const overview = GetAccountOverviewResponse.parse(await json(account));
      const journal = await pool.query<{ detail: string }>(
        `SELECT detail
         FROM agent360_activities
         WHERE workspace_id = $1
           AND (title ILIKE '%канал%' OR title ILIKE '%публикац%')`,
        [overview.workspace.id],
      );
      assert.doesNotMatch(JSON.stringify(journal.rows), new RegExp(telegramCredential));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("atomically enforces the monthly content limit under parallel requests", async () => {
    const userId = registerUser();
    const accountBefore = await request("/api/account", userId);
    const overviewBefore = GetAccountOverviewResponse.parse(await json(accountBefore));
    const limit = overviewBefore.usage.limits.content;
    const responses = await Promise.all(
      Array.from({ length: limit + 8 }, (_, index) =>
        request("/api/content", userId, {
          method: "POST",
          body: JSON.stringify({
            topic: `Concurrent topic ${index}`,
            channels: ["telegram"],
          }),
        }),
      ),
    );

    assert.equal(responses.filter((response) => response.status === 201).length, limit);
    const rejected = responses.filter((response) => response.status === 429);
    assert.equal(rejected.length, 8);
    for (const response of rejected) {
      const body = await json(response);
      assertErrorResponse(body);
      const quotaError: QuotaExceededResponse = body;
      assert.match(quotaError.error, /limit/i);
    }

    const accountAfter = await request("/api/account", userId);
    const overviewAfter = GetAccountOverviewResponse.parse(await json(accountAfter));
    assert.equal(overviewAfter.usage.content, limit);
  });
});