import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const migrationId = "agent360-billing-v1";

/**
 * Keeps deployments of the existing application database compatible with the
 * billing state machine. Every statement is idempotent so fresh development
 * databases and already-migrated production databases are both safe.
 */
export async function runAgent360BillingMigration(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS agent360_schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await tx.execute(sql`ALTER TABLE agent360_workspaces ADD COLUMN IF NOT EXISTS stripe_customer_id text`);
    await tx.execute(sql`ALTER TABLE agent360_workspaces ADD COLUMN IF NOT EXISTS stripe_subscription_id text`);
    await tx.execute(sql`
      ALTER TABLE agent360_workspaces
      ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'inactive'
    `);
    await tx.execute(sql`
      ALTER TABLE agent360_workspaces
      ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz
    `);
    await tx.execute(sql`
      ALTER TABLE agent360_workspaces
      ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false
    `);
    await tx.execute(sql`ALTER TABLE agent360_workspaces ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text`);
    await tx.execute(sql`ALTER TABLE agent360_workspaces ADD COLUMN IF NOT EXISTS pending_plan text`);
    await tx.execute(sql`ALTER TABLE agent360_workspaces ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz`);
    await tx.execute(sql`
      ALTER TABLE agent360_workspaces
      ADD COLUMN IF NOT EXISTS last_stripe_event_created_at timestamptz
    `);
    await tx.execute(sql`ALTER TABLE agent360_workspaces ADD COLUMN IF NOT EXISTS last_stripe_event_id text`);
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS agent360_stripe_events (
        id text PRIMARY KEY,
        workspace_id text,
        created_at timestamptz NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await tx.execute(sql`
      INSERT INTO agent360_schema_migrations (id)
      VALUES (${migrationId})
      ON CONFLICT (id) DO NOTHING
    `);
  });
}