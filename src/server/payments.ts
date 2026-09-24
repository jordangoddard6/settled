// Thin wrapper around Stripe so the checkout flow can be tested with a fake gateway.
import Stripe from "stripe";

export interface IntentInfo {
  id: string;
  clientSecret: string;
  amountCents: number;
  /** Stripe PaymentIntent status, e.g. "requires_payment_method", "succeeded". */
  status: string;
}

export interface PaymentGateway {
  createIntent(opts: { amountCents: number; cartId: string; description: string }): Promise<IntentInfo>;
  retrieveIntent(id: string): Promise<IntentInfo>;
  cancelIntent(id: string): Promise<void>;
}

export interface Payments {
  gateway: PaymentGateway;
  publishableKey: string;
}

function toInfo(intent: Stripe.PaymentIntent): IntentInfo {
  return { id: intent.id, clientSecret: intent.client_secret ?? "", amountCents: intent.amount, status: intent.status };
}

export function createStripeGateway(secretKey: string): PaymentGateway {
  const stripe = new Stripe(secretKey);
  return {
    async createIntent({ amountCents, cartId, description }) {
      const intent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        payment_method_types: ["card"],
        description,
        metadata: { cartId },
      });
      return toInfo(intent);
    },
    async retrieveIntent(id) {
      return toInfo(await stripe.paymentIntents.retrieve(id));
    },
    async cancelIntent(id) {
      await stripe.paymentIntents.cancel(id);
    },
  };
}

/**
 * Reads Stripe keys from the environment. Returns null (checkout disabled) when they're missing.
 * Refuses live keys: this MVP only ever takes test-mode payments.
 */
export function paymentsFromEnv(env: NodeJS.ProcessEnv = process.env): Payments | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const publishableKey = env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (!secretKey || !publishableKey) {
    console.warn("Stripe keys not set — checkout is disabled. See .env.example.");
    return null;
  }
  if (!secretKey.startsWith("sk_test_") || !publishableKey.startsWith("pk_test_")) {
    console.error("Only Stripe TEST keys (sk_test_…, pk_test_…) are allowed — checkout is disabled.");
    return null;
  }
  return { gateway: createStripeGateway(secretKey), publishableKey };
}
