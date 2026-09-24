// Checkout flow against a real server with a fake Stripe gateway.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IntentInfo, PaymentGateway } from "../src/server/payments";
import { computeTotals } from "../src/shared/pricing";
import { cookie, fries, startTestServer, waitFor } from "./helpers";

/** In-memory stand-in for Stripe. Tests flip intents to "succeeded" to simulate a paid card. */
class FakeStripe implements PaymentGateway {
  intents = new Map<string, IntentInfo>();
  failCreate = false;
  private n = 0;

  async createIntent({ amountCents }: { amountCents: number }) {
    if (this.failCreate) throw new Error("Stripe is down");
    const id = `pi_${++this.n}`;
    const intent = { id, clientSecret: `${id}_secret`, amountCents, status: "requires_payment_method" };
    this.intents.set(id, intent);
    return { ...intent };
  }
  async retrieveIntent(id: string) {
    const intent = this.intents.get(id);
    if (!intent) throw new Error("No such intent");
    return { ...intent };
  }
  async cancelIntent(id: string) {
    const intent = this.intents.get(id);
    if (intent) intent.status = "canceled";
  }
  pay(id: string, amountCents?: number) {
    const intent = this.intents.get(id)!;
    intent.status = "succeeded";
    if (amountCents !== undefined) intent.amountCents = amountCents;
  }
}

describe("checkout", () => {
  const stripe = new FakeStripe();
  let server: Awaited<ReturnType<typeof startTestServer>>;

  beforeAll(async () => {
    server = await startTestServer({ gateway: stripe, publishableKey: "pk_test_fake" });
  });
  beforeEach(() => {
    stripe.failCreate = false;
  });
  afterAll(() => server.close());

  async function cartWithItems() {
    const ctx = await server.newCart();
    await ctx.host.act(cookie);
    await ctx.guest.act(fries);
    await waitFor(() => ctx.host.cart?.items.length === 2 && ctx.guest.cart?.items.length === 2);
    return ctx;
  }

  it("serves the publishable key", async () => {
    const res = await fetch(`${server.url}/api/config`);
    expect(await res.json()).toEqual({ stripePublishableKey: "pk_test_fake" });
  });

  it("locks the cart for everyone and charges the server-computed total", async () => {
    const { host, guest } = await cartWithItems();
    const session = await host.socket.emitWithAck("checkout:start", {});
    if (!session.ok) throw new Error(session.error);

    const expected = computeTotals(host.cart!.items).totalCents;
    expect(session.amountCents).toBe(expected);
    await waitFor(() => guest.cart?.status === "locked");

    // Nobody can change the cart while the host pays.
    expect(await guest.act(cookie)).toMatchObject({ ok: false, error: expect.stringMatching(/locked/) });
    expect(await host.act(cookie)).toMatchObject({ ok: false });
    // The client secret never reaches anyone else.
    expect(JSON.stringify(guest.cart)).not.toContain("secret");
  });

  it("only the host can check out", async () => {
    const { guest } = await cartWithItems();
    expect(await guest.socket.emitWithAck("checkout:start", {})).toEqual({ ok: false, error: "Only the host can check out." });
  });

  it("refuses to check out an empty cart", async () => {
    const { host } = await server.newCart();
    expect(await host.socket.emitWithAck("checkout:start", {})).toMatchObject({ ok: false, error: expect.stringMatching(/at least one item/) });
  });

  it("does not place the order until Stripe says the payment succeeded", async () => {
    const { host, guest } = await cartWithItems();
    const session = await host.socket.emitWithAck("checkout:start", {});
    if (!session.ok) throw new Error(session.error);

    expect(await host.socket.emitWithAck("checkout:complete", {})).toMatchObject({ ok: false });
    expect(guest.cart?.status).not.toBe("ordered");

    stripe.pay(session.clientSecret.replace("_secret", ""));
    expect(await host.socket.emitWithAck("checkout:complete", {})).toEqual({ ok: true });
    await waitFor(() => guest.cart?.status === "ordered" && host.cart?.status === "ordered");
    expect(guest.cart!.order).toMatchObject({ totalCents: session.amountCents });
    expect(guest.cart!.activity.at(-1)?.text).toBe("Order sent to Chick-fil-A 🎉");
  });

  it("rejects a payment whose amount doesn't match the cart", async () => {
    const { host } = await cartWithItems();
    const session = await host.socket.emitWithAck("checkout:start", {});
    if (!session.ok) throw new Error(session.error);
    stripe.pay(session.clientSecret.replace("_secret", ""), 50);
    expect(await host.socket.emitWithAck("checkout:complete", {})).toMatchObject({ ok: false, error: expect.stringMatching(/didn't match/) });
  });

  it("cancel unlocks the cart and cancels the payment", async () => {
    const { host, guest } = await cartWithItems();
    const session = await host.socket.emitWithAck("checkout:start", {});
    if (!session.ok) throw new Error(session.error);
    expect(await host.socket.emitWithAck("checkout:cancel", {})).toEqual({ ok: true });
    await waitFor(() => guest.cart?.status === "open");
    expect(stripe.intents.get(session.clientSecret.replace("_secret", ""))?.status).toBe("canceled");
    expect((await guest.act(cookie)).ok).toBe(true);
  });

  it("cancel after a successful payment places the order instead of losing it", async () => {
    const { host, guest } = await cartWithItems();
    const session = await host.socket.emitWithAck("checkout:start", {});
    if (!session.ok) throw new Error(session.error);
    stripe.pay(session.clientSecret.replace("_secret", ""));
    expect(await host.socket.emitWithAck("checkout:cancel", {})).toEqual({ ok: true });
    await waitFor(() => guest.cart?.status === "ordered");
  });

  it("a host who reloads mid-checkout gets the same payment session back", async () => {
    const { cartId, host } = await cartWithItems();
    const first = await host.socket.emitWithAck("checkout:start", {});
    host.socket.disconnect();
    const again = server.client(host.token);
    await again.open(cartId);
    const second = await again.socket.emitWithAck("checkout:start", {});
    expect(second).toEqual(first);
  });

  it("unlocks the cart if Stripe can't be reached", async () => {
    const { host, guest } = await cartWithItems();
    stripe.failCreate = true;
    expect(await host.socket.emitWithAck("checkout:start", {})).toMatchObject({ ok: false, error: expect.stringMatching(/unlocked/) });
    await waitFor(() => guest.cart?.status === "open");
  });
});

describe("checkout without Stripe keys", () => {
  it("is disabled with a clear message", async () => {
    const server = await startTestServer(null);
    try {
      const { host } = await server.newCart();
      await host.act(cookie);
      expect(await host.socket.emitWithAck("checkout:start", {})).toMatchObject({ ok: false, error: expect.stringMatching(/Stripe/) });
      expect(await (await fetch(`${server.url}/api/config`)).json()).toEqual({ stripePublishableKey: null });
    } finally {
      await server.close();
    }
  });
});
