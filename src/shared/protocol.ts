// The Socket.IO contract between client and server.
//
// Flow: the client emits `cart:open` to subscribe to a cart (and learn whether its token is
// already a participant), `cart:join` to become one, then `cart:action` for every change.
// Every accepted change is applied on the server and broadcast to the whole room as a full
// `cart:state` snapshot. The client renders only what the server sends.
import type { ActivityEntry, Cart, Result, Selections } from "./types";

export type CartAction =
  | { type: "addItem"; menuItemId: string; quantity: number; selections: Selections; note: string }
  | { type: "updateItem"; lineId: string; quantity?: number; selections?: Selections; note?: string }
  | { type: "removeItem"; lineId: string };

export interface OpenPayload {
  cartId: string;
  /** Secret per-browser token. Proves "I am participant X" without exposing it to others. */
  token: string;
}

export interface CartSnapshot {
  cart: Cart;
  /** Participant ID of this socket's user, or null if they are only watching. */
  you: string | null;
}

export interface StateEvent {
  cart: Cart;
  /** The activity entry produced by this change, for toasts. Absent on plain resyncs. */
  activity?: ActivityEntry;
}

export interface PresenceEvent {
  cartId: string;
  online: string[];
}

export type Ack<T = object> = (result: Result<T>) => void;

export interface ClientToServerEvents {
  "cart:open": (payload: OpenPayload, ack: Ack<CartSnapshot>) => void;
  "cart:join": (payload: { name: string }, ack: Ack<CartSnapshot>) => void;
  "cart:action": (action: CartAction, ack: Ack<{ version: number }>) => void;
}

export interface ServerToClientEvents {
  "cart:state": (event: StateEvent) => void;
  "cart:presence": (event: PresenceEvent) => void;
}

export interface CreateCartRequest {
  restaurantId: string;
  name: string;
  token: string;
}

export type CreateCartResponse = Result<{ cartId: string }>;
