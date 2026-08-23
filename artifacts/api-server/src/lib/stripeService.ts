import type Stripe from "stripe";
import { pool } from "@workspace/db";
import {
  applyStripeSubscriptionState,
  getWorkspaceByStripeCustomerId,
  persistStripeCustomer,
} from "./agent360-store";
import { getUncachableStripeClient } from "./stripeClient";

const paidPlanIds = ["starter", "pro"] as const;
type PaidPlanId = (typeof paidPlanIds)[number];

const priceDefinitions: Record<PaidPlanId, { amount: number; productName: string; description: string }> = {
  starter: {
    amount: 900,
    productName: "Агент-мультитул 360 — Старт",
    description: "Регулярная работа одного эксперта.",
  },
  pro: {
    amount: 2900,
    productName: "Агент-мультитул 360 — Профессиональный",
    description: "Интенсивные исследования и контент-пайплайн.",
  },
};

function isPaidPlanId(planId: string): planId is PaidPlanId {
  return paidPlanIds.includes(planId as PaidPlanId);
}

function stripeId(value: string | { id: string }): string {
  return typeof value === "string" ? value : value.id;
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const latestEnd = subscription.items.data.reduce(
    (latest, item) => Math.max(latest, item.current_period_end),
    0,
  );
  return latestEnd ? new Date(latestEnd * 1_000) : null;
}

function invoiceSubscription(invoice: Stripe.Invoice): string | Stripe.Subscription | null {
  if (invoice.parent?.type !== "subscription_details") return null;
  return invoice.parent.subscription_details?.subscription ?? null;
}

async function withStripeCatalogLock<T>(planId: PaidPlanId, operation: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const lockKey = `agent360-stripe-catalog-${planId}`;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [lockKey]);
    return await operation();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]);
    } finally {
      client.release();
    }
  }
}

export async function getOrCreatePrice(planId: PaidPlanId, stripeClient?: Stripe): Promise<string> {
  return withStripeCatalogLock(planId, async () => {
    const stripe = stripeClient ?? await getUncachableStripeClient();
    const definition = priceDefinitions[planId];
    const products = await stripe.products.list({ active: true, limit: 100 });
    const matchingProducts = products.data
      .filter((item) => item.metadata.agent360_plan === planId)
      .sort((left, right) => (left.created - right.created) || left.id.localeCompare(right.id));
    let product = matchingProducts[0];

    if (!product) {
      product = await stripe.products.create(
        {
          name: definition.productName,
          description: definition.description,
          metadata: { agent360_plan: planId },
        },
        { idempotencyKey: `agent360-product-${planId}-v1` },
      );
    } else if (matchingProducts.length > 1) {
      await Promise.all(
        matchingProducts.slice(1).map((duplicate) => stripe.products.update(duplicate.id, { active: false })),
      );
    }

    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      type: "recurring",
      limit: 100,
    });
    const matchingPrices = prices.data
      .filter(
        (price) =>
          price.currency === "usd" &&
          price.unit_amount === definition.amount &&
          price.recurring?.interval === "month",
      )
      .sort((left, right) => (left.created - right.created) || left.id.localeCompare(right.id));
    const existing = matchingPrices[0];
    if (existing) {
      if (matchingPrices.length > 1) {
        await Promise.all(
          matchingPrices.slice(1).map((duplicate) => stripe.prices.update(duplicate.id, { active: false })),
        );
      }
      return existing.id;
    }

    const price = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: definition.amount,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { agent360_plan: planId },
      },
      { idempotencyKey: `agent360-price-${planId}-usd-monthly-v1` },
    );
    return price.id;
  });
}

async function getOrCreateCustomer(workspace: {
  id: string;
  userId: string;
  stripeCustomerId: string | null;
}): Promise<string> {
  if (workspace.stripeCustomerId) return workspace.stripeCustomerId;

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create(
    {
      metadata: {
        agent360_workspace_id: workspace.id,
        agent360_user_id: workspace.userId,
      },
    },
    { idempotencyKey: `agent360-customer-${workspace.id}` },
  );
  await persistStripeCustomer(workspace.id, customer.id);
  return customer.id;
}

export async function createCheckoutForWorkspace({
  workspace,
  planId,
  successUrl,
  cancelUrl,
  expiresAt,
}: {
  workspace: { id: string; userId: string; stripeCustomerId: string | null };
  planId: PaidPlanId;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}): Promise<{ id: string; url: string }> {
  const [stripe, customerId, priceId] = await Promise.all([
    getUncachableStripeClient(),
    getOrCreateCustomer(workspace),
    getOrCreatePrice(planId),
  ]);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      agent360_workspace_id: workspace.id,
      agent360_plan: planId,
    },
    subscription_data: {
      metadata: {
        agent360_workspace_id: workspace.id,
        agent360_plan: planId,
      },
    },
    expires_at: Math.floor(expiresAt.getTime() / 1_000),
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { id: session.id, url: session.url };
}

export async function createBillingPortal(customerId: string, returnUrl: string): Promise<string> {
  const stripe = await getUncachableStripeClient();
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  return session.url;
}

async function planForSubscription(subscription: Stripe.Subscription): Promise<PaidPlanId | null> {
  const subscriptionPriceIds = new Set(subscription.items.data.map((item) => item.price.id));
  const priceEntries = await Promise.all(
    paidPlanIds.map(async (planId) => [planId, await getOrCreatePrice(planId)] as const),
  );
  return priceEntries.find(([, priceId]) => subscriptionPriceIds.has(priceId))?.[0] ?? null;
}

async function applySubscription(subscription: Stripe.Subscription, event: Stripe.Event): Promise<void> {
  const stripeCustomerId = stripeId(subscription.customer);
  const metadataWorkspaceId = subscription.metadata.agent360_workspace_id;
  const workspace = metadataWorkspaceId
    ? { id: metadataWorkspaceId }
    : await getWorkspaceByStripeCustomerId(stripeCustomerId);
  const planId = await planForSubscription(subscription);

  if (!workspace || !planId) return;

  const outcome = await applyStripeSubscriptionState({
    eventId: event.id,
    eventCreatedAt: new Date(event.created * 1_000),
    workspaceId: workspace.id,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    planId,
  });
  if (outcome === "conflict" && subscription.status !== "canceled") {
    const stripe = await getUncachableStripeClient();
    await stripe.subscriptions.cancel(subscription.id);
  }
}

export async function applyStripeBillingEvent(event: Stripe.Event): Promise<void> {
  const stripe = await getUncachableStripeClient();

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object as Stripe.Subscription, event);
      return;
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || session.payment_status !== "paid" || !session.subscription) return;
      const subscription = await stripe.subscriptions.retrieve(stripeId(session.subscription));
      await applySubscription(subscription, event);
      return;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionReference = invoiceSubscription(invoice);
      if (!subscriptionReference) return;
      const subscription = await stripe.subscriptions.retrieve(stripeId(subscriptionReference));
      await applySubscription(subscription, event);
      return;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionReference = invoiceSubscription(invoice);
      if (!subscriptionReference) return;
      const subscription = await stripe.subscriptions.retrieve(stripeId(subscriptionReference));
      await applySubscription(subscription, event);
      return;
    }
    default:
      return;
  }
}

export { isPaidPlanId, type PaidPlanId };