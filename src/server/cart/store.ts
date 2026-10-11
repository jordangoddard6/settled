import type { StoredCart } from "./rules";

/** Where carts are saved. Memory only for the MVP; a database (e.g. Neon Postgres) can implement this later. */
export interface CartStore {
  load(id: string): Promise<StoredCart | null>;
  save(cart: StoredCart): Promise<void>;
}

export class MemoryCartStore implements CartStore {
  private carts = new Map<string, StoredCart>();

  load(id: string): Promise<StoredCart | null> {
    const cart = this.carts.get(id);
    return Promise.resolve(cart ? structuredClone(cart) : null);
  }

  save(cart: StoredCart): Promise<void> {
    this.carts.set(cart.id, structuredClone(cart));
    return Promise.resolve();
  }
}
