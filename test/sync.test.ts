// End-to-end sync test: real server, real Socket.IO clients, simultaneous changes.
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../src/server/app";
import { MemoryCartStore } from "../src/server/cart/store";
import type { CartAction, CartSnapshot, ClientToServerEvents, ServerToClientEvents } from "../src/shared/protocol";
import type { Cart, Result } from "../src/shared/types";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** A minimal stand-in for the React client: keeps the newest snapshot and every version it saw. */
class TestClient {
  socket: ClientSocket;
  cart: Cart | null = null;
  seenVersions: number[] = [];
  you: string | null = null;

  constructor(url: string, public token: string) {
    this.socket = connect(url, { transports: ["websocket"], forceNew: true, reconnection: false });
    this.socket.on("cart:state", ({ cart }) => this.accept(cart));
  }

  private accept(cart: Cart) {
    this.seenVersions.push(cart.version);
    if (!this.cart || cart.version > this.cart.version) this.cart = cart;
  }

  async open(cartId: string) {
    const res = await this.socket.emitWithAck("cart:open", { cartId, token: this.token });
    this.handleSnapshot(res);
  }

  async join(name: string) {
    this.handleSnapshot(await this.socket.emitWithAck("cart:join", { name }));
  }

  act(action: CartAction) {
    return this.socket.emitWithAck("cart:action", action);
  }

  private handleSnapshot(res: Result<CartSnapshot>) {
    if (!res.ok) throw new Error(res.error);
    this.you = res.you;
    if (!this.cart || res.cart.version > this.cart.version) this.cart = res.cart;
  }
}

const cookie: CartAction = { type: "addItem", menuItemId: "cookie", quantity: 1, selections: {}, note: "" };
const fries: CartAction = { type: "addItem", menuItemId: "waffle-fries", quantity: 2, selections: { size: ["large"] }, note: "extra salt" };

async function waitFor(check: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("real-time sync across clients", () => {
  let app: App;
  let url: string;
  const clients: TestClient[] = [];

  beforeAll(async () => {
    app = createApp(new MemoryCartStore());
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
    url = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    for (const c of clients) c.socket.disconnect();
    await app.io.close();
  });

  async function newCart() {
    const res = await fetch(`${url}/api/carts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restaurantId: "chick-fil-a", name: "Jordan", token: "host-token-123" }),
    });
    const body = (await res.json()) as Result<{ cartId: string }>;
    if (!body.ok) throw new Error(body.error);
    const host = new TestClient(url, "host-token-123");
    const guest = new TestClient(url, `guest-token-${Math.random()}`);
    clients.push(host, guest);
    await host.open(body.cartId);
    await guest.open(body.cartId);
    await guest.join("Alex");
    await waitFor(() => host.cart?.version === guest.cart?.version);
    return { cartId: body.cartId, host, guest };
  }

  it("two users adding items at the same moment end with identical carts and nothing lost", async () => {
    const { host, guest } = await newCart();
    const startVersion = host.cart!.version;

    // Fire 25 adds from each client without waiting between them.
    const acks = await Promise.all([
      ...Array.from({ length: 25 }, () => host.act(cookie)),
      ...Array.from({ length: 25 }, () => guest.act(fries)),
    ]);
    expect(acks.every((a) => a.ok)).toBe(true);

    const finalVersion = startVersion + 50;
    await waitFor(() => host.cart?.version === finalVersion && guest.cart?.version === finalVersion);

    expect(host.cart).toEqual(guest.cart);
    expect(host.cart!.items).toHaveLength(50);
    expect(host.cart!.items.filter((i) => i.ownerId === host.you)).toHaveLength(25);
    expect(host.cart!.items.filter((i) => i.ownerId === guest.you)).toHaveLength(25);

    // Every client saw every version exactly once, in order — no gaps, no duplicates.
    for (const client of [host, guest]) {
      const tail = client.seenVersions.filter((v) => v > startVersion);
      expect(tail).toEqual(Array.from({ length: 50 }, (_, i) => startVersion + 1 + i));
    }
  });

  it("conflicting edits resolve the same way for everyone", async () => {
    const { host, guest } = await newCart();
    await guest.act(cookie);
    await waitFor(() => host.cart?.items.length === 1);
    const lineId = host.cart!.items[0]!.id;

    // Host removes the guest's item while the guest changes its quantity.
    const [removeAck, updateAck] = await Promise.all([
      host.act({ type: "removeItem", lineId }),
      guest.act({ type: "updateItem", lineId, quantity: 5 }),
    ]);

    // Exactly one order of events happened on the server; both clients agree on the outcome.
    expect(removeAck.ok).toBe(true);
    await waitFor(() => host.cart?.version === guest.cart?.version && host.cart?.items.length === 0);
    expect(host.cart).toEqual(guest.cart);
    if (!updateAck.ok) expect(updateAck.error).toMatch(/no longer in the cart/);
  });

  it("guests cannot remove other people's items", async () => {
    const { host, guest } = await newCart();
    await host.act(cookie);
    await waitFor(() => guest.cart?.items.length === 1);
    const res = await guest.act({ type: "removeItem", lineId: guest.cart!.items[0]!.id });
    expect(res).toEqual({ ok: false, error: "You can only remove your own items." });
  });

  it("a client that reconnects gets everything it missed", async () => {
    const { cartId, host, guest } = await newCart();
    guest.socket.disconnect();

    await host.act(cookie);
    await host.act(fries);

    const returning = new TestClient(url, guest.token);
    clients.push(returning);
    await returning.open(cartId);
    expect(returning.you).toBe(guest.you);
    expect(returning.cart).toEqual(host.cart);
  });

  it("reports who is online", async () => {
    const { cartId, host, guest } = await newCart();
    let online: string[] = [];
    host.socket.on("cart:presence", (e) => {
      if (e.cartId === cartId) online = e.online;
    });
    guest.socket.disconnect();
    await waitFor(() => online.length === 1 && online[0] === host.you);
  });
});
