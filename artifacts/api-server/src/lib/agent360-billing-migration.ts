import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const migrationId = "agent360-billing-v1";
const channelMigrationId = "agent360-channels-v1";

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
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS agent360_channel_connections (
        id text PRIMARY KEY,
        workspace_id text NOT NULL,
        provider text NOT NULL,
        target text NOT NULL,
        credential_ciphertext text,
        is_active boolean NOT NULL DEFAULT true,
        status text NOT NULL DEFAULT 'connected',
        last_checked_at timestamptz,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await tx.execute(sql`
      CREATE INDEX IF NOT EXISTS agent360_channel_connections_workspace_idx
      ON agent360_channel_connections (workspace_id)
    `);
    await tx.execute(sql`
      ALTER TABLE agent360_channel_connections
      ADD COLUMN IF NOT EXISTS credential_ciphertext text
    `);
    await tx.execute(sql`
      ALTER TABLE agent360_channel_connections
      ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true
    `);
    await tx.execute(sql`
      WITH ranked_connections AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY workspace_id, provider
            ORDER BY created_at DESC, id DESC
          ) AS rank
        FROM agent360_channel_connections
        WHERE is_active = true
      )
      UPDATE agent360_channel_connections AS connection
      SET
        is_active = false,
        credential_ciphertext = NULL,
        status = 'needs_setup',
        last_error = 'Заменено более новым подключением канала.'
      FROM ranked_connections
      WHERE connection.id = ranked_connections.id AND ranked_connections.rank > 1
    `);
    await tx.execute(sql`DROP INDEX IF EXISTS agent360_channel_connections_workspace_provider_unique`);
    await tx.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS agent360_channel_connections_workspace_provider_unique
      ON agent360_channel_connections (workspace_id, provider)
      WHERE is_active = true
    `);
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS agent360_publish_deliveries (
        id text PRIMARY KEY,
        workspace_id text NOT NULL,
        content_id text NOT NULL,
        connection_id text,
        provider text NOT NULL,
        target text NOT NULL,
        status text NOT NULL,
        detail text NOT NULL,
        external_id text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await tx.execute(sql`
      CREATE INDEX IF NOT EXISTS agent360_publish_deliveries_workspace_idx
      ON agent360_publish_deliveries (workspace_id, created_at DESC)
    `);
    await tx.execute(sql`
      INSERT INTO agent360_schema_migrations (id)
      VALUES (${channelMigrationId})
      ON CONFLICT (id) DO NOTHING
    `);
  });
}