import type Stripe from "stripe";
import { applyStripeBillingEvent } from "./stripeService";
import { getStripeSync } from "./stripeClient";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must remain a raw Buffer.");
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
    const event = JSON.parse(payload.toString("utf8")) as Stripe.Event;
    await applyStripeBillingEvent(event);
  }
}