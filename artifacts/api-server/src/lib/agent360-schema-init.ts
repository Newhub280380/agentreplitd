import { runAgent360BillingMigration } from "./agent360-billing-migration";
import { logger } from "./logger";

/**
 * Applies Agent 360 schema compatibility changes independently of optional
 * Stripe webhook configuration. A configured database must not serve routes
 * against a partial Agent 360 schema.
 */
export async function initializeAgent360Schema(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    logger.warn("Agent 360 database schema is unavailable until DATABASE_URL is configured");
    return false;
  }

  await runAgent360BillingMigration();
  logger.info("Agent 360 database schema is ready");
  return true;
}