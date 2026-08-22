import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const workspacesTable = pgTable("agent360_workspaces", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceUsageTable = pgTable(
  "agent360_workspace_usage",
  {
    workspaceId: text("workspace_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    runs: integer("runs").notNull().default(0),
    content: integer("content").notNull().default(0),
    builderJobs: integer("builder_jobs").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.periodStart] })],
);

export const agentRunsTable = pgTable("agent360_runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("system"),
  command: text("command").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  summary: text("summary"),
  steps: jsonb("steps").notNull().$type<unknown[]>(),
});

export const insightsTable = pgTable("agent360_insights", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("system"),
  trend: text("trend").notNull(),
  reach: text("reach").notNull(),
  emotion: text("emotion").notNull(),
  conclusion: text("conclusion").notNull(),
  source: text("source").notNull(),
  score: text("score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentItemsTable = pgTable("agent360_content", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("system"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  channels: jsonb("channels").notNull().$type<string[]>(),
  status: text("status").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const builderJobsTable = pgTable("agent360_builder_jobs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("system"),
  kind: text("kind").notNull(),
  instruction: text("instruction").notNull(),
  packageManager: text("package_manager").notNull(),
  status: text("status").notNull(),
  attempts: text("attempts").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  logs: jsonb("logs").notNull().$type<string[]>(),
});

export const activitiesTable = pgTable("agent360_activities", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("system"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  agent: text("agent").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  status: text("status").notNull(),
});

export const agentMemoriesTable = pgTable("agent360_memories", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("system"),
  scope: text("scope").notNull(),
  content: text("content").notNull(),
  embedding: jsonb("embedding").$type<number[] | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentRunSchema = createInsertSchema(agentRunsTable);
export type AgentRun = typeof agentRunsTable.$inferSelect;
export type InsertAgentRun = z.infer<typeof insertAgentRunSchema>;