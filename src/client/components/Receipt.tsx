import type { Restaurant } from "../../shared/menus";
import { formatCents } from "../../shared/pricing";
import type { Cart } from "../../shared/types";

export function OrderPlacedBanner({ cart, restaurant }: { cart: Cart; restaurant: Restaurant }) {
  const host = cart.participants.find((p) => p.isHost);
  const order = cart.order;
  const time = order ? new Date(order.placedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  return (
    <section className="rounded-2xl bg-white p-6 text-center shadow-sm ring-2 ring-emerald-500">
      <p className="text-5xl" aria-hidden>
        🎉
      </p>
      <h2 className="mt-3 text-2xl font-extrabold">Order sent to {restaurant.name}!</h2>
      <p className="mt-2 text-stone-600">
        {host?.name ?? "The host"} paid {order ? formatCents(order.totalCents) : ""} for {cart.participants.length}{" "}
        {cart.participants.length === 1 ? "person" : "people"}
        {time && <> at {time}</>}.
      </p>
      <p className="mt-3 text-xs text-stone-400">Demo only — no order was actually sent to the restaurant, and no real card was charged.</p>
    </section>
  );
}
