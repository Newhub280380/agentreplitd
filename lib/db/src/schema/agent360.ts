import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const agentRunsTable = pgTable("agent360_runs", {
  id: text("id").primaryKey(),
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
  title: text("title").notNull(),
  body: text("body").notNull(),
  channels: jsonb("channels").notNull().$type<string[]>(),
  status: text("status").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const builderJobsTable = pgTable("agent360_builder_jobs", {
  id: text("id").primaryKey(),
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
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  agent: text("agent").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  status: text("status").notNull(),
});

export const agentMemoriesTable = pgTable("agent360_memories", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  content: text("content").notNull(),
  embedding: jsonb("embedding").$type<number[] | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentRunSchema = createInsertSchema(agentRunsTable);
export type AgentRun = typeof agentRunsTable.$inferSelect;
export type InsertAgentRun = z.infer<typeof insertAgentRunSchema>;