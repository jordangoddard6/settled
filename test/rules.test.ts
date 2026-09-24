import { describe, expect, it } from "vitest";
import { applyAction, createCart, joinCart, toPublicCart, type RuleResult, type StoredCart } from "../src/server/cart/rules";
import { RESTAURANTS } from "../src/shared/menus";
import { computeTotals, normalizeSelections, unitPriceCents } from "../src/shared/pricing";

const NOW = 1_700_000_000_000;

function unwrap(result: RuleResult): StoredCart {
  if (!result.ok) throw new Error(result.error);
  return result.cart;
}

function setup() {
  const cart = createCart({ id: "ABC234", restaurantId: "chick-fil-a", hostName: "Jordan", token: "host-token", now: NOW });
  const joined = joinCart(cart, "guest-token", "Alex", NOW + 1);
  if (!joined.ok) throw new Error(joined.error);
  return { cart: joined.cart, hostId: cart.hostId, guestId: joined.participantId };
}

const add = (menuItemId: string, quantity = 1, selections = {}) => ({ type: "addItem" as const, menuItemId, quantity, selections, note: "" });

describe("createCart / joinCart", () => {
  it("creates an open cart with the host as its only participant", () => {
    const cart = createCart({ id: "ABC234", restaurantId: "swig", hostName: "Jordan", token: "t", now: NOW });
    expect(cart.status).toBe("open");
    expect(cart.version).toBe(1);
    expect(cart.participants).toEqual([expect.objectContaining({ name: "Jordan", isHost: true })]);
    expect(cart.tokens).toEqual({ t: cart.hostId });
  });

  it("never exposes tokens in the public cart", () => {
    const { cart } = setup();
    expect(toPublicCart(cart)).not.toHaveProperty("tokens");
  });

  it("adds a participant and bumps the version", () => {
    const { cart } = setup();
    expect(cart.participants.map((p) => p.name)).toEqual(["Jordan", "Alex"]);
    expect(cart.version).toBe(2);
  });

  it("rejects bad names and duplicate joins", () => {
    const { cart } = setup();
    expect(joinCart(cart, "new", "   ", NOW).ok).toBe(false);
    expect(joinCart(cart, "new", "x".repeat(31), NOW).ok).toBe(false);
    expect(joinCart(cart, "guest-token", "Alex again", NOW).ok).toBe(false);
  });

  it("collapses whitespace in names", () => {
    const { cart } = setup();
    const result = joinCart(cart, "new", "  Sam   Lee ", NOW);
    expect(unwrap(result).participants.at(-1)?.name).toBe("Sam Lee");
  });
});

describe("applyAction", () => {
  it("adds an item priced by the server from the menu", () => {
    const { cart, guestId } = setup();
    const next = unwrap(applyAction(cart, guestId, add("spicy-sandwich", 2, { meal: ["meal"] }), NOW));
    const line = next.items[0]!;
    expect(line.ownerId).toBe(guestId);
    expect(line.unitPriceCents).toBe(579 + 469);
    expect(line.quantity).toBe(2);
    expect(next.version).toBe(cart.version + 1);
    expect(next.activity.at(-1)?.text).toBe("Alex added 2× Spicy Chicken Sandwich");
  });

  it("does not mutate the input cart", () => {
    const { cart, guestId } = setup();
    const before = structuredClone(cart);
    applyAction(cart, guestId, add("cookie"), NOW);
    expect(cart).toEqual(before);
  });

  it("rejects unknown items, bad quantities and invalid options", () => {
    const { cart, guestId } = setup();
    expect(applyAction(cart, guestId, add("big-mac"), NOW).ok).toBe(false);
    expect(applyAction(cart, guestId, add("cookie", 0), NOW).ok).toBe(false);
    expect(applyAction(cart, guestId, add("cookie", 21), NOW).ok).toBe(false);
    expect(applyAction(cart, guestId, add("cookie", 1.5), NOW).ok).toBe(false);
    expect(applyAction(cart, guestId, add("nuggets", 1, { sauce: ["cfa-sauce", "bbq", "ranch"] }), NOW).ok).toBe(false);
    expect(applyAction(cart, guestId, add("nuggets", 1, { meal: ["free"] }), NOW).ok).toBe(false);
  });

  it("rejects actions from non-participants", () => {
    const { cart } = setup();
    expect(applyAction(cart, "stranger", add("cookie"), NOW)).toEqual({ ok: false, error: "Join the cart first." });
  });

  it("lets owners edit their items but not other people's", () => {
    const { cart, hostId, guestId } = setup();
    const withItem = unwrap(applyAction(cart, guestId, add("lemonade"), NOW));
    const lineId = withItem.items[0]!.id;
    expect(applyAction(withItem, hostId, { type: "updateItem", lineId, quantity: 3 }, NOW).ok).toBe(false);
    const updated = unwrap(applyAction(withItem, guestId, { type: "updateItem", lineId, quantity: 3, selections: { size: ["large"] } }, NOW));
    expect(updated.items[0]).toMatchObject({ quantity: 3, unitPriceCents: 239 + 90 });
  });

  it("lets owners and the host remove items, but not other guests", () => {
    const { cart, hostId, guestId } = setup();
    const withThird = unwrap(joinCart(cart, "third", "Sam", NOW));
    const samId = withThird.participants.at(-1)!.id;
    const withItem = unwrap(applyAction(withThird, guestId, add("cookie"), NOW));
    const lineId = withItem.items[0]!.id;

    expect(applyAction(withItem, samId, { type: "removeItem", lineId }, NOW).ok).toBe(false);
    const byHost = unwrap(applyAction(withItem, hostId, { type: "removeItem", lineId }, NOW));
    expect(byHost.items).toHaveLength(0);
    expect(byHost.activity.at(-1)?.text).toBe("Jordan (host) removed Alex's Chocolate Chunk Cookie");
    expect(unwrap(applyAction(withItem, guestId, { type: "removeItem", lineId }, NOW)).items).toHaveLength(0);
  });

  it("rejects changes when the cart isn't open", () => {
    const { cart, guestId } = setup();
    expect(applyAction({ ...cart, status: "locked" }, guestId, add("cookie"), NOW).ok).toBe(false);
    expect(applyAction({ ...cart, status: "ordered" }, guestId, add("cookie"), NOW).ok).toBe(false);
  });

  it("caps the activity feed", () => {
    let { cart, guestId } = setup();
    for (let i = 0; i < 40; i++) cart = unwrap(applyAction(cart, guestId, add("cookie"), NOW));
    expect(cart.activity).toHaveLength(30);
    expect(cart.version).toBe(42);
  });
});

describe("pricing", () => {
  const nuggets = RESTAURANTS["chick-fil-a"].menu.find((m) => m.id === "nuggets")!;

  it("fills required defaults and prices options", () => {
    const result = normalizeSelections(nuggets, { count: ["12ct"], sauce: ["polynesian"] });
    expect(result).toEqual({ ok: true, selections: { count: ["12ct"], meal: ["entree"], sauce: ["polynesian"] } });
    if (result.ok) expect(unitPriceCents(nuggets, result.selections)).toBe(579 + 259);
  });

  it("computes Provo tax on the subtotal", () => {
    const totals = computeTotals([{ unitPriceCents: 1000, quantity: 2 }, { unitPriceCents: 549, quantity: 1 }]);
    expect(totals).toEqual({ subtotalCents: 2549, taxCents: 215, totalCents: 2764 });
  });

  it("every menu item's defaults are valid", () => {
    for (const restaurant of Object.values(RESTAURANTS)) {
      for (const item of restaurant.menu) {
        expect(normalizeSelections(item, {}).ok, `${restaurant.id}/${item.id}`).toBe(true);
      }
    }
  });
});
