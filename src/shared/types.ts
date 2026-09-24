// Types shared by the server and the React client. All money is integer cents.

export type RestaurantId = "chick-fil-a" | "swig";

export type CartStatus = "open" | "locked" | "ordered";

/** optionGroupId -> chosen optionIds */
export type Selections = Record<string, string[]>;

export interface Participant {
  /** Public ID, safe to broadcast. The secret token that proves identity never leaves the server. */
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  joinedAt: number;
}

export interface LineItem {
  id: string;
  ownerId: string;
  menuItemId: string;
  quantity: number;
  selections: Selections;
  note: string;
  /** Computed by the server from the menu, never trusted from the client. */
  unitPriceCents: number;
  addedAt: number;
}

export interface ActivityEntry {
  id: string;
  at: number;
  actorId: string;
  text: string;
}

/** The cart as every participant sees it. */
export interface Cart {
  id: string;
  restaurantId: RestaurantId;
  status: CartStatus;
  /** Bumped by exactly 1 on every accepted change. Clients ignore any snapshot older than what they hold. */
  version: number;
  hostId: string;
  participants: Participant[];
  items: LineItem[];
  /** Most recent last, capped at ACTIVITY_LIMIT. */
  activity: ActivityEntry[];
  createdAt: number;
  updatedAt: number;
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
