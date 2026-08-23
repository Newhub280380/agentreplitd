import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

type StripeCredentials = {
  secretKey: string;
  webhookSecret?: string;
};

/**
 * Reads the current Stripe connection on demand. The connection can rotate
 * credentials, so callers must never cache this result or the Stripe client.
 */
export async function getStripeCredentials(): Promise<StripeCredentials> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;

  if (!hostname || !token) {
    throw new Error("Stripe connection is unavailable in this environment.");
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: token },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to read Stripe connection (${response.status}).`);
  }

  const data = (await response.json()) as {
    items?: Array<{
      settings?: {
        secret_key?: string;
        api_key?: string;
        stripe_secret_key?: string;
        secret?: string;
        webhook_secret?: string;
      };
    }>;
  };
  const settings = data.items?.[0]?.settings;
  const secretKey = settings?.secret_key ?? settings?.api_key ?? settings?.stripe_secret_key ?? settings?.secret;
  if (!secretKey) {
    throw new Error("Stripe connection does not contain a secret key.");
  }

  return { secretKey, webhookSecret: settings?.webhook_secret };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Stripe sync.");

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret,
  });
}