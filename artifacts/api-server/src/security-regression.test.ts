import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, test } from "node:test";
import {
  GenerateContentResponse,
  GetAccountOverviewResponse,
  GetContentResponse,
} from "@workspace/api-zod";
import type { ErrorResponse, QuotaExceededResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import productionApp, { createTestApp } from "./app";
import { initializeAgent360Schema } from "./lib/agent360-schema-init";

const testUserPrefix = `security-test-${Date.now()}-`;
const userIds = new Set<string>();

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
    for (const table of [
      "agent360_activities",
      "agent360_memories",
      "agent360_runs",
      "agent360_insights",
      "agent360_content",
      "agent360_publish_deliveries",
      "agent360_channel_connections",
      "agent360_builder_jobs",
      "agent360_workspace_usage",
    ]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id IN ${workspaceQuery}`, ids);
    }
    await pool.query(`DELETE FROM agent360_workspaces WHERE user_id IN (${placeholders})`, ids);
  }
  await pool.end();
});

describe("agent 360 authentication and quota regression", () => {
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

      const draftResponse = await request("/api/content", userId, {
        method: "POST",
        body: JSON.stringify({ topic: "Verified delivery", channels: ["telegram"] }),
      });
      assert.equal(draftResponse.status, 201);
      const draft = GenerateContentResponse.parse(await json(draftResponse));

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