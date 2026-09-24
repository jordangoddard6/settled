import type { Server, Socket } from "socket.io";
import { z } from "zod";
import type { Ack, ClientToServerEvents, ServerToClientEvents } from "../shared/protocol";
import type { ActivityEntry, Result } from "../shared/types";
import { applyAction, joinCart, toPublicCart, type StoredCart } from "./cart/rules";
import type { CartService } from "./cart/service";
import { Checkout } from "./checkout";
import type { Payments } from "./payments";

interface SocketData {
  cartId?: string;
  token?: string;
  participantId?: string;
}

export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const selectionsSchema = z.record(z.string(), z.array(z.string()).max(20));

const openSchema = z.object({ cartId: z.string().min(1).max(20), token: z.string().min(8).max(100) });
const joinSchema = z.object({ name: z.string() });
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addItem"), menuItemId: z.string(), quantity: z.number(), selections: selectionsSchema, note: z.string() }),
  z.object({ type: z.literal("updateItem"), lineId: z.string(), quantity: z.number().optional(), selections: selectionsSchema.optional(), note: z.string().optional() }),
  z.object({ type: z.literal("removeItem"), lineId: z.string() }),
]);

const room = (cartId: string) => `cart:${cartId}`;

/** Tracks which participants have at least one connected socket, per cart. */
class Presence {
  private byCart = new Map<string, Map<string, Set<string>>>();

  add(cartId: string, participantId: string, socketId: string): void {
    const cart = this.byCart.get(cartId) ?? new Map<string, Set<string>>();
    this.byCart.set(cartId, cart);
    const sockets = cart.get(participantId) ?? new Set<string>();
    cart.set(participantId, sockets);
    sockets.add(socketId);
  }

  remove(cartId: string, participantId: string, socketId: string): void {
    const cart = this.byCart.get(cartId);
    const sockets = cart?.get(participantId);
    if (!cart || !sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) cart.delete(participantId);
    if (cart.size === 0) this.byCart.delete(cartId);
  }

  online(cartId: string): string[] {
    return [...(this.byCart.get(cartId)?.keys() ?? [])];
  }
}

export function registerSocketHandlers(io: IO, service: CartService, payments: Payments | null): void {
  const presence = new Presence();

  const broadcastState = (cart: StoredCart, activity?: ActivityEntry) =>
    io.to(room(cart.id)).emit("cart:state", { cart: toPublicCart(cart), activity });
  const checkout = new Checkout(service, payments, (result) => broadcastState(result.cart, result.activity));
  const broadcastPresence = (cartId: string) =>
    io.to(room(cartId)).emit("cart:presence", { cartId, online: presence.online(cartId) });

  const leaveCurrentCart = (socket: AppSocket) => {
    const { cartId, participantId } = socket.data;
    if (!cartId) return;
    void socket.leave(room(cartId));
    if (participantId) {
      presence.remove(cartId, participantId, socket.id);
      broadcastPresence(cartId);
    }
    socket.data = {};
  };

  io.on("connection", (socket: AppSocket) => {
    socket.on("cart:open", async (payload, ack) => {
      const parsed = openSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "Invalid request." });
      const cartId = parsed.data.cartId.toUpperCase();
      const cart = await service.get(cartId);
      if (!cart) {
        return ack({
          ok: false,
          error: "We couldn't find that cart. Check the code — or, since carts in this demo are temporary and clear when the server restarts, start a new order.",
        });
      }

      leaveCurrentCart(socket);
      const participantId = cart.tokens[parsed.data.token];
      socket.data = { cartId, token: parsed.data.token, participantId };
      await socket.join(room(cartId));
      if (participantId) {
        presence.add(cartId, participantId, socket.id);
        broadcastPresence(cartId);
      } else {
        socket.emit("cart:presence", { cartId, online: presence.online(cartId) });
      }
      ack({ ok: true, cart: toPublicCart(cart), you: participantId ?? null });
    });

    socket.on("cart:join", async (payload, ack) => {
      const parsed = joinSchema.safeParse(payload);
      const { cartId, token } = socket.data;
      if (!parsed.success || !cartId || !token) return ack({ ok: false, error: "Open the cart first." });

      const result = await service.mutate(cartId, (cart, now) => joinCart(cart, token, parsed.data.name, now));
      if (!result.ok) return ack(result);

      // The socket may have switched carts while the change was being applied.
      if (socket.data.cartId === cartId) {
        socket.data.participantId = result.participantId;
        presence.add(cartId, result.participantId, socket.id);
      }
      broadcastState(result.cart, result.activity);
      broadcastPresence(cartId);
      ack({ ok: true, cart: toPublicCart(result.cart), you: result.participantId });
    });

    socket.on("cart:action", async (payload, ack) => {
      const parsed = actionSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "Invalid request." });
      const { cartId, participantId } = socket.data;
      if (!cartId || !participantId) return ack({ ok: false, error: "Join the cart first." });

      const result = await service.mutate(cartId, (cart, now) => applyAction(cart, participantId, parsed.data, now));
      if (!result.ok) return ack(result);
      // Broadcast before acking: Socket.IO preserves order, so the sender already has the new
      // state by the time its ack callback runs.
      broadcastState(result.cart, result.activity);
      ack({ ok: true, version: result.cart.version });
    });

    // Checkout events: host only (Checkout re-checks), and any Stripe failure becomes an error ack.
    const checkoutHandler =
      <T extends object>(run: (cartId: string, participantId: string) => Promise<Result<T>>) =>
      async (_payload: unknown, ack: Ack<T>) => {
        const { cartId, participantId } = socket.data;
        if (!cartId || !participantId) return ack({ ok: false, error: "Join the cart first." });
        try {
          ack(await run(cartId, participantId));
        } catch (err) {
          console.error(`Checkout error for cart ${cartId}:`, err);
          ack({ ok: false, error: "Something went wrong talking to Stripe. Try again." });
        }
      };

    socket.on("checkout:start", checkoutHandler((cartId, id) => checkout.start(cartId, id)));
    socket.on("checkout:cancel", checkoutHandler((cartId, id) => checkout.cancel(cartId, id)));
    socket.on("checkout:complete", checkoutHandler((cartId, id) => checkout.complete(cartId, id)));

    socket.on("disconnect", () => leaveCurrentCart(socket));
  });
}
