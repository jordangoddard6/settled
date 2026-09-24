import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { createApp, type App } from "../src/server/app";
import { MemoryCartStore } from "../src/server/cart/store";
import type { Payments } from "../src/server/payments";
import type { CartAction, CartSnapshot, ClientToServerEvents, ServerToClientEvents } from "../src/shared/protocol";
import type { Cart, Result } from "../src/shared/types";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** A minimal stand-in for the React client: keeps the newest snapshot and every version it saw. */
export class TestClient {
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

export const cookie: CartAction = { type: "addItem", menuItemId: "cookie", quantity: 1, selections: {}, note: "" };
export const fries: CartAction = { type: "addItem", menuItemId: "waffle-fries", quantity: 2, selections: { size: ["large"] }, note: "extra salt" };

export async function waitFor(check: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Starts a real server on a random port, with helpers to create a cart with a host and a guest. */
export async function startTestServer(payments: Payments | null = null) {
  const app: App = createApp(new MemoryCartStore(), payments);
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
  const url = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
  const clients: TestClient[] = [];

  function client(token: string) {
    const c = new TestClient(url, token);
    clients.push(c);
    return c;
  }

  async function newCart() {
    const hostToken = `host-token-${Math.random()}`;
    const res = await fetch(`${url}/api/carts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restaurantId: "chick-fil-a", name: "Jordan", token: hostToken }),
    });
    const body = (await res.json()) as Result<{ cartId: string }>;
    if (!body.ok) throw new Error(body.error);
    const host = client(hostToken);
    const guest = client(`guest-token-${Math.random()}`);
    await host.open(body.cartId);
    await guest.open(body.cartId);
    await guest.join("Alex");
    await waitFor(() => host.cart?.version === guest.cart?.version);
    return { cartId: body.cartId, host, guest };
  }

  async function close() {
    for (const c of clients) c.socket.disconnect();
    await app.io.close();
  }

  return { app, url, client, newCart, close };
}
