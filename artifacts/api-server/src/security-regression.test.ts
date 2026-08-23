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
      body: JSON.stringify({ channels: ["vk"] }),
    });
    assert.equal(crossUserPublish.status, 404);
    assertErrorResponse(await json(crossUserPublish));

    const ownerPublish = await request(`/api/content/${aliceContent.id}/publish`, alice, {
      method: "POST",
      body: JSON.stringify({ channels: ["vk"] }),
    });
    assert.equal(ownerPublish.status, 200);
    assert.equal(GenerateContentResponse.parse(await json(ownerPublish)).status, "published");

    const afterSignOut = await request("/api/account", undefined);
    assert.equal(afterSignOut.status, 401);
    assertErrorResponse(await json(afterSignOut));
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