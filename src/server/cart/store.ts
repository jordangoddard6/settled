import type { StoredCart } from "./rules";

/** Where carts are saved. Memory for local dev; Neon Postgres when DATABASE_URL is set (step 4). */
export interface CartStore {
  load(id: string): Promise<StoredCart | null>;
  save(cart: StoredCart): Promise<void>;
}

export class MemoryCartStore implements CartStore {
  private carts = new Map<string, StoredCart>();

  async load(id: string): Promise<StoredCart | null> {
    const cart = this.carts.get(id);
    return cart ? structuredClone(cart) : null;
  }

  async save(cart: StoredCart): Promise<void> {
    this.carts.set(cart.id, structuredClone(cart));
  }
}
