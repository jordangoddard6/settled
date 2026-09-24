// Checkout orchestration: cart lock + Stripe PaymentIntent + server-side verification.
// Cart changes still go through CartService.mutate; this module only sequences them around
// the (async) Stripe calls.
import { RESTAURANTS } from "../shared/menus";
import { computeTotals } from "../shared/pricing";
import type { CheckoutSession } from "../shared/protocol";
import type { Result } from "../shared/types";
import { cancelCheckout, placeOrder, startCheckout, type RuleResult, type StoredCart } from "./cart/rules";
import type { CartService } from "./cart/service";
import type { IntentInfo, Payments } from "./payments";

export type Broadcast = (result: Extract<RuleResult, { ok: true }>) => void;

const NOT_CONFIGURED = "Payments aren't set up on this server yet (missing Stripe test keys).";

export class Checkout {
  constructor(
    private service: CartService,
    private payments: Payments | null,
    private broadcast: Broadcast,
  ) {}

  async start(cartId: string, hostId: string): Promise<Result<CheckoutSession>> {
    if (!this.payments) return { ok: false, error: NOT_CONFIGURED };
    const { gateway } = this.payments;

    const current = await this.service.get(cartId);
    if (!current) return { ok: false, error: "Cart not found." };

    // Resuming (e.g. the host reloaded mid-checkout): hand back the existing payment session.
    if (current.status === "locked" && current.hostId === hostId && current.payment) {
      const intent = await gateway.retrieveIntent(current.payment.intentId);
      if (intent.status === "succeeded") {
        const placed = await this.finalize(cartId, intent);
        return placed.ok ? { ok: false, error: "This order has already been paid." } : placed;
      }
      return { ok: true, clientSecret: current.payment.clientSecret, amountCents: current.payment.amountCents };
    }

    let cart: StoredCart;
    if (current.status === "locked" && current.hostId === hostId) {
      cart = current; // Locked but the payment wasn't created (an earlier attempt failed) — retry it.
    } else {
      const locked = await this.service.mutate(cartId, (c, now) => startCheckout(c, hostId, now));
      if (!locked.ok) return locked;
      this.broadcast(locked);
      cart = locked.cart;
    }

    // The cart is locked, so the items (and therefore the amount) can't change under us.
    const amountCents = computeTotals(cart.items).totalCents;
    let intent;
    try {
      intent = await gateway.createIntent({
        amountCents,
        cartId,
        description: `Settled group order ${cartId} — ${RESTAURANTS[cart.restaurantId].name}`,
      });
    } catch (err) {
      console.error(`Stripe createIntent failed for cart ${cartId}:`, err);
      const unlocked = await this.service.mutate(cartId, (c, now) => cancelCheckout(c, hostId, now));
      if (unlocked.ok) this.broadcast(unlocked);
      return { ok: false, error: "Couldn't reach Stripe. The cart has been unlocked — try again." };
    }

    const payment = { intentId: intent.id, clientSecret: intent.clientSecret, amountCents };
    if (!this.service.attachPayment(cartId, cart.checkoutStartedAt!, payment)) {
      // Checkout was cancelled (or another attempt won) while Stripe was responding.
      await gateway.cancelIntent(intent.id).catch(() => {});
      const latest = await this.service.get(cartId);
      if (latest?.status === "locked" && latest.payment) {
        return { ok: true, clientSecret: latest.payment.clientSecret, amountCents: latest.payment.amountCents };
      }
      return { ok: false, error: "Checkout was cancelled." };
    }
    return { ok: true, clientSecret: payment.clientSecret, amountCents };
  }

  /** Called after Stripe.js reports success. Never trusts the client: re-checks with Stripe. */
  async complete(cartId: string, hostId: string): Promise<Result<object>> {
    if (!this.payments) return { ok: false, error: NOT_CONFIGURED };
    const cart = await this.service.get(cartId);
    if (!cart) return { ok: false, error: "Cart not found." };
    if (cart.hostId !== hostId) return { ok: false, error: "Only the host can check out." };
    if (cart.status === "ordered") return { ok: true };
    if (cart.status !== "locked" || !cart.payment) return { ok: false, error: "Checkout isn't in progress." };

    const intent = await this.payments.gateway.retrieveIntent(cart.payment.intentId);
    if (intent.status !== "succeeded") return { ok: false, error: "Stripe hasn't confirmed the payment yet." };
    return this.finalize(cartId, intent);
  }

  async cancel(cartId: string, hostId: string): Promise<Result<object>> {
    const cart = await this.service.get(cartId);
    if (!cart) return { ok: false, error: "Cart not found." };
    if (cart.hostId !== hostId) return { ok: false, error: "Only the host can cancel checkout." };

    const payment = cart.payment;
    if (payment && this.payments) {
      // If the payment actually went through, cancelling would lose a paid order — place it instead.
      const intent = await this.payments.gateway.retrieveIntent(payment.intentId);
      if (intent.status === "succeeded") return this.finalize(cartId, intent);
      await this.payments.gateway.cancelIntent(payment.intentId).catch((err) => {
        console.warn(`Couldn't cancel PaymentIntent ${payment.intentId}:`, err);
      });
    }

    const unlocked = await this.service.mutate(cartId, (c, now) => cancelCheckout(c, hostId, now));
    if (!unlocked.ok) return unlocked;
    this.broadcast(unlocked);
    return { ok: true };
  }

  /** Places the order if `intent` (fresh from Stripe) is this cart's payment, succeeded, and matches the total. */
  private async finalize(cartId: string, intent: IntentInfo): Promise<Result<object>> {
    const result = await this.service.mutate(cartId, (cart, now) => {
      if (cart.status === "ordered") return { ok: false, error: "already-ordered" };
      if (cart.payment?.intentId !== intent.id) return { ok: false, error: "That payment doesn't belong to this checkout." };
      const expected = computeTotals(cart.items).totalCents;
      if (intent.status !== "succeeded" || intent.amountCents !== expected || cart.payment.amountCents !== expected) {
        return { ok: false, error: "The payment didn't match the order total." };
      }
      return placeOrder(cart, now);
    });
    if (!result.ok) return result.error === "already-ordered" ? { ok: true } : result;
    this.broadcast(result);
    return { ok: true };
  }
}
