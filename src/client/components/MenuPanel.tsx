import { useState } from "react";
import type { MenuItem, Restaurant } from "../../shared/menus";
import { formatCents, normalizeSelections, unitPriceCents } from "../../shared/pricing";
import type { CartAction } from "../../shared/protocol";
import type { Result } from "../../shared/types";

interface Props {
  restaurant: Restaurant;
  /** Null when the viewer can't add (not joined, or cart not open); the string explains why. */
  disabledReason: string | null;
  act: (action: CartAction) => Promise<Result<object>>;
  onError: (message: string) => void;
}

function defaultPrice(item: MenuItem): number {
  const normalized = normalizeSelections(item, {});
  return normalized.ok ? unitPriceCents(item, normalized.selections) : item.basePriceCents;
}

export function MenuPanel({ restaurant, disabledReason, act, onError }: Props) {
  const categories = [...new Set(restaurant.menu.map((m) => m.category))];
  return (
    <div className="space-y-6">
      {disabledReason && <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600">{disabledReason}</p>}
      {categories.map((category) => (
        <section key={category}>
          <h3 className="mb-2 text-sm font-bold tracking-wide text-stone-500 uppercase">{category}</h3>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            {restaurant.menu
              .filter((m) => m.category === category)
              .map((item) => (
                <MenuRow key={item.id} item={item} disabled={disabledReason !== null} act={act} onError={onError} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MenuRow({ item, disabled, act, onError }: { item: MenuItem; disabled: boolean } & Pick<Props, "act" | "onError">) {
  const [pending, setPending] = useState(false);

  async function add() {
    setPending(true);
    const res = await act({ type: "addItem", menuItemId: item.id, quantity: 1, selections: {}, note: "" });
    setPending(false);
    if (!res.ok) onError(res.error);
  }

  return (
    <li className="flex items-center gap-3 p-3">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-stone-100 text-2xl" aria-hidden>
        {item.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{item.name}</p>
        <p className="truncate text-sm text-stone-500">{item.description}</p>
        <p className="text-sm font-medium text-stone-700">{formatCents(defaultPrice(item))}</p>
      </div>
      <button
        onClick={add}
        disabled={disabled || pending}
        aria-label={`Add ${item.name}`}
        className="min-w-16 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? <Spinner /> : "Add"}
      </button>
    </li>
  );
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" aria-label="Working" />;
}
