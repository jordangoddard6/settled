// End-to-end sync test: real server, real Socket.IO clients, simultaneous changes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cookie, fries, startTestServer, waitFor } from "./helpers";

describe("real-time sync across clients", () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(() => server.close());

  it("two users adding items at the same moment end with identical carts and nothing lost", async () => {
    const { host, guest } = await server.newCart();
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
    const { host, guest } = await server.newCart();
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
    const { host, guest } = await server.newCart();
    await host.act(cookie);
    await waitFor(() => guest.cart?.items.length === 1);
    const res = await guest.act({ type: "removeItem", lineId: guest.cart!.items[0]!.id });
    expect(res).toEqual({ ok: false, error: "You can only remove your own items." });
  });

  it("a client that reconnects gets everything it missed", async () => {
    const { cartId, host, guest } = await server.newCart();
    guest.socket.disconnect();

    await host.act(cookie);
    await host.act(fries);

    const returning = server.client(guest.token);
    await returning.open(cartId);
    expect(returning.you).toBe(guest.you);
    expect(returning.cart).toEqual(host.cart);
  });

  it("reports who is online", async () => {
    const { cartId, host, guest } = await server.newCart();
    let online: string[] = [];
    host.socket.on("cart:presence", (e) => {
      if (e.cartId === cartId) online = e.online;
    });
    guest.socket.disconnect();
    await waitFor(() => online.length === 1 && online[0] === host.you);
  });
});
