// Pure cart rules: given a cart and a request, return the next cart or an error.
// No I/O here, so every rule is unit-testable and the service can apply changes atomically.
import { randomUUID } from "node:crypto";
import { ACTIVITY_LIMIT, LIMITS } from "../../shared/config";
import { findMenuItem, RESTAURANTS } from "../../shared/menus";
import { normalizeSelections, unitPriceCents } from "../../shared/pricing";
import type { CartAction } from "../../shared/protocol";
import type { ActivityEntry, Cart, LineItem, Participant, RestaurantId } from "../../shared/types";

/** The cart as stored on the server: the public cart plus the secret token -> participant map. */
export interface StoredCart extends Cart {
  tokens: Record<string, string>;
}

export type RuleResult =
  | { ok: true; cart: StoredCart; activity: ActivityEntry; participantId: string }
  | { ok: false; error: string };

const fail = (error: string): RuleResult => ({ ok: false, error });

export function toPublicCart(cart: StoredCart): Cart {
  const { tokens: _tokens, ...publicCart } = cart;
  return publicCart;
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= LIMITS.nameMax ? name : null;
}

function cleanNote(raw: unknown): string | null {
  if (raw === undefined) return "";
  if (typeof raw !== "string") return null;
  const note = raw.trim();
  return note.length <= LIMITS.noteMax ? note : null;
}

function validQuantity(q: unknown): q is number {
  return Number.isInteger(q) && (q as number) >= LIMITS.quantityMin && (q as number) <= LIMITS.quantityMax;
}

export function createCart(opts: {
  id: string;
  restaurantId: RestaurantId;
  hostName: string;
  token: string;
  now: number;
}): StoredCart {
  const host: Participant = { id: randomUUID(), name: opts.hostName, isHost: true, ready: false, joinedAt: opts.now };
  return {
    id: opts.id,
    restaurantId: opts.restaurantId,
    status: "open",
    version: 1,
    hostId: host.id,
    participants: [host],
    items: [],
    activity: [{ id: randomUUID(), at: opts.now, actorId: host.id, text: `${host.name} started a ${RESTAURANTS[opts.restaurantId].name} order` }],
    tokens: { [opts.token]: host.id },
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}

/** Returns a copy of `cart` with the change recorded: version + 1, timestamp, activity entry. */
function commit(cart: StoredCart, actorId: string, text: string, now: number, change: (draft: StoredCart) => void): RuleResult {
  const draft = structuredClone(cart);
  change(draft);
  const activity: ActivityEntry = { id: randomUUID(), at: now, actorId, text };
  draft.activity = [...draft.activity, activity].slice(-ACTIVITY_LIMIT);
  draft.version = cart.version + 1;
  draft.updatedAt = now;
  return { ok: true, cart: draft, activity, participantId: actorId };
}

export function joinCart(cart: StoredCart, token: string, rawName: unknown, now: number): RuleResult {
  if (cart.status === "ordered") return fail("This order has already been placed.");
  const existing = cart.tokens[token];
  if (existing) return fail("You've already joined this cart.");
  const name = cleanName(rawName);
  if (!name) return fail(`Name must be 1–${LIMITS.nameMax} characters.`);
  if (cart.participants.length >= LIMITS.participantsPerCart) {
    return fail(`This cart is full (${LIMITS.participantsPerCart} people max).`);
  }
  const participant: Participant = { id: randomUUID(), name, isHost: false, ready: false, joinedAt: now };
  return commit(cart, participant.id, `${name} joined`, now, (draft) => {
    draft.participants.push(participant);
    draft.tokens[token] = participant.id;
  });
}

export function applyAction(cart: StoredCart, actorId: string, action: CartAction, now: number): RuleResult {
  const actor = cart.participants.find((p) => p.id === actorId);
  if (!actor) return fail("Join the cart first.");
  if (cart.status !== "open") {
    return fail(cart.status === "locked" ? "The host is checking out — the cart is locked." : "This order has already been placed.");
  }

  switch (action.type) {
    case "addItem": {
      const item = findMenuItem(cart.restaurantId, action.menuItemId);
      if (!item) return fail("That item isn't on the menu.");
      if (!validQuantity(action.quantity)) return fail(`Quantity must be ${LIMITS.quantityMin}–${LIMITS.quantityMax}.`);
      const note = cleanNote(action.note);
      if (note === null) return fail(`Notes are limited to ${LIMITS.noteMax} characters.`);
      if (cart.items.length >= LIMITS.linesPerCart) return fail(`Carts are limited to ${LIMITS.linesPerCart} items.`);
      const normalized = normalizeSelections(item, action.selections ?? {});
      if (!normalized.ok) return fail(normalized.error);

      const line: LineItem = {
        id: randomUUID(),
        ownerId: actor.id,
        menuItemId: item.id,
        quantity: action.quantity,
        selections: normalized.selections,
        note,
        unitPriceCents: unitPriceCents(item, normalized.selections),
        addedAt: now,
      };
      const qty = action.quantity > 1 ? `${action.quantity}× ` : "";
      return commit(cart, actor.id, `${actor.name} added ${qty}${item.name}`, now, (draft) => {
        draft.items.push(line);
      });
    }

    case "updateItem": {
      const line = cart.items.find((l) => l.id === action.lineId);
      if (!line) return fail("That item is no longer in the cart.");
      if (line.ownerId !== actor.id) return fail("You can only edit your own items.");
      const item = findMenuItem(cart.restaurantId, line.menuItemId);
      if (!item) return fail("That item isn't on the menu.");

      const next: LineItem = { ...line };
      if (action.quantity !== undefined) {
        if (!validQuantity(action.quantity)) return fail(`Quantity must be ${LIMITS.quantityMin}–${LIMITS.quantityMax}.`);
        next.quantity = action.quantity;
      }
      if (action.note !== undefined) {
        const note = cleanNote(action.note);
        if (note === null) return fail(`Notes are limited to ${LIMITS.noteMax} characters.`);
        next.note = note;
      }
      if (action.selections !== undefined) {
        const normalized = normalizeSelections(item, action.selections);
        if (!normalized.ok) return fail(normalized.error);
        next.selections = normalized.selections;
        next.unitPriceCents = unitPriceCents(item, normalized.selections);
      }
      const text =
        action.quantity !== undefined && action.quantity !== line.quantity && action.selections === undefined && action.note === undefined
          ? `${actor.name} changed ${item.name} to ${next.quantity}×`
          : `${actor.name} updated ${item.name}`;
      return commit(cart, actor.id, text, now, (draft) => {
        draft.items = draft.items.map((l) => (l.id === line.id ? next : l));
      });
    }

    case "removeItem": {
      const line = cart.items.find((l) => l.id === action.lineId);
      if (!line) return fail("That item is no longer in the cart.");
      const isOwner = line.ownerId === actor.id;
      if (!isOwner && !actor.isHost) return fail("You can only remove your own items.");
      const itemName = findMenuItem(cart.restaurantId, line.menuItemId)?.name ?? "an item";
      const ownerName = cart.participants.find((p) => p.id === line.ownerId)?.name ?? "someone";
      const text = isOwner ? `${actor.name} removed ${itemName}` : `${actor.name} (host) removed ${ownerName}'s ${itemName}`;
      return commit(cart, actor.id, text, now, (draft) => {
        draft.items = draft.items.filter((l) => l.id !== line.id);
      });
    }

    default:
      return fail("Unknown action.");
  }
}
