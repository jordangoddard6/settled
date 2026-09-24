// Owns the live copy of every active cart. All changes go through `mutate`, which applies a
// rule synchronously against the latest in-memory cart — so concurrent requests are applied
// one at a time, in arrival order, and never overwrite each other.
import { randomInt } from "node:crypto";
import { CART_CODE_ALPHABET, CART_CODE_LENGTH } from "../../shared/config";
import type { RestaurantId } from "../../shared/types";
import { createCart, type PendingPayment, type RuleResult, type StoredCart } from "./rules";
import type { CartStore } from "./store";

export class CartService {
  private active = new Map<string, StoredCart>();
  private loading = new Map<string, Promise<void>>();
  private dirty = new Map<string, StoredCart>();
  private saving = new Set<string>();

  constructor(private store: CartStore, private now: () => number = Date.now) {}

  async get(id: string): Promise<StoredCart | null> {
    await this.ensureLoaded(id);
    return this.active.get(id) ?? null;
  }

  async create(restaurantId: RestaurantId, hostName: string, token: string): Promise<StoredCart> {
    const id = await this.newCartId();
    const cart = createCart({ id, restaurantId, hostName, token, now: this.now() });
    this.active.set(id, cart);
    this.schedulePersist(cart);
    return cart;
  }

  /**
   * Applies `rule` to the current cart. The read of the latest cart and the write of the result
   * happen in the same synchronous tick, so no other change can slip in between.
   */
  async mutate(id: string, rule: (cart: StoredCart, now: number) => RuleResult): Promise<RuleResult> {
    await this.ensureLoaded(id);
    const cart = this.active.get(id);
    if (!cart) return { ok: false, error: "Cart not found." };
    const result = rule(cart, this.now());
    if (result.ok) {
      this.active.set(id, result.cart);
      this.schedulePersist(result.cart);
    }
    return result;
  }

  /**
   * Records the Stripe payment for a checkout. Not a visible change, so no version bump or broadcast.
   * Returns false if that checkout is no longer in progress (e.g. the host cancelled meanwhile).
   */
  attachPayment(id: string, checkoutStartedAt: number, payment: PendingPayment): boolean {
    const cart = this.active.get(id);
    if (!cart || cart.status !== "locked" || cart.checkoutStartedAt !== checkoutStartedAt || cart.payment) return false;
    const next = { ...cart, payment };
    this.active.set(id, next);
    this.schedulePersist(next);
    return true;
  }

  /** Resolves once every pending save has finished. Used by tests and graceful shutdown. */
  async flush(): Promise<void> {
    while (this.saving.size > 0 || this.dirty.size > 0) {
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  private async ensureLoaded(id: string): Promise<void> {
    if (this.active.has(id)) return;
    let pending = this.loading.get(id);
    if (!pending) {
      pending = this.store
        .load(id)
        .then((cart) => {
          if (cart && !this.active.has(id)) this.active.set(id, cart);
        })
        .finally(() => this.loading.delete(id));
      this.loading.set(id, pending);
    }
    await pending;
  }

  /** Saves the newest version of a cart, coalescing bursts of changes into as few writes as possible. */
  private schedulePersist(cart: StoredCart): void {
    this.dirty.set(cart.id, cart);
    if (!this.saving.has(cart.id)) void this.persistLoop(cart.id);
  }

  private async persistLoop(id: string): Promise<void> {
    this.saving.add(id);
    try {
      for (let cart = this.dirty.get(id); cart; cart = this.dirty.get(id)) {
        this.dirty.delete(id);
        try {
          await this.store.save(cart);
        } catch (err) {
          console.error(`Failed to save cart ${id}:`, err);
        }
      }
    } finally {
      this.saving.delete(id);
    }
  }

  private async newCartId(): Promise<string> {
    for (;;) {
      let id = "";
      for (let i = 0; i < CART_CODE_LENGTH; i++) id += CART_CODE_ALPHABET[randomInt(CART_CODE_ALPHABET.length)];
      if (!this.active.has(id) && !(await this.store.load(id))) return id;
    }
  }
}
