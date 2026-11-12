import app from "./app";
import { logger } from "./lib/logger";
import { initializeAgent360Schema } from "./lib/agent360-schema-init";
import { getStripeSync } from "./lib/stripeClient";
import { runMigrations } from "stripe-replit-sync";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initializeStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const publicDomain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!databaseUrl || !publicDomain) {
    logger.warn("Stripe sync is unavailable until DATABASE_URL and REPLIT_DOMAINS are configured");
    return;
  }

  await runMigrations({ databaseUrl });
  const sync = await getStripeSync();
  await sync.findOrCreateManagedWebhook(`https://${publicDomain}/api/stripe/webhook`);
  await sync.syncBackfill();
  logger.info("Stripe schema, webhook, and backfill are ready");
}

try {
  await initializeAgent360Schema();
} catch (err) {
  logger.error({ err }, "Agent 360 schema initialization failed; server will not start");
  throw err;
}

try {
  await initializeStripe();
} catch (err) {
  logger.error({ err }, "Stripe initialization failed; billing requests will return an explicit error");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
