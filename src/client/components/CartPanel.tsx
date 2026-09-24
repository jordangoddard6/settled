import { useEffect, useRef, useState } from "react";
import { LIMITS } from "../../shared/config";
import { findMenuItem } from "../../shared/menus";
import { computeTotals, describeSelections, formatCents, lineTotalCents } from "../../shared/pricing";
import type { CartAction } from "../../shared/protocol";
import type { Cart, LineItem, Participant, Result } from "../../shared/types";
import { Spinner } from "./MenuPanel";

interface Props {
  cart: Cart;
  you: string | null;
  act: (action: CartAction) => Promise<Result<object>>;
  onError: (message: string) => void;
}

export function CartPanel({ cart, you, act, onError }: Props) {
  const fresh = useFreshRemoteLines(cart.items, you);
  const me = cart.participants.find((p) => p.id === you);
  const canEdit = cart.status === "open" && !!me;

  // You first, then everyone else in join order. Only people with items (plus you) get a section.
  const groups = [...cart.participants]
    .sort((a, b) => (a.id === you ? -1 : b.id === you ? 1 : a.joinedAt - b.joinedAt))
    .map((p) => ({ person: p, lines: cart.items.filter((l) => l.ownerId === p.id) }))
    .filter((g) => g.lines.length > 0 || g.person.id === you);

  const totals = computeTotals(cart.items);
  const itemCount = cart.items.reduce((n, l) => n + l.quantity, 0);

  return (
    <div className="space-y-4">
      {groups.map(({ person, lines }) => (
        <PersonGroup
          key={person.id}
          person={person}
          lines={lines}
          cart={cart}
          isYou={person.id === you}
          canEditOwn={canEdit && person.id === you}
          canRemove={canEdit && (person.id === you || !!me?.isHost)}
          fresh={fresh}
          act={act}
          onError={onError}
        />
      ))}
      {groups.length === 0 && <p className="text-sm text-stone-500">Nothing here yet.</p>}

      <dl className="space-y-1 rounded-2xl bg-white p-4 text-sm ring-1 ring-stone-200">
        <div className="flex justify-between">
          <dt className="text-stone-600">
            Subtotal · {itemCount} {itemCount === 1 ? "item" : "items"}
          </dt>
          <dd>{formatCents(totals.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-600">Tax (Provo, UT)</dt>
          <dd>{formatCents(totals.taxCents)}</dd>
        </div>
        <div className="flex justify-between border-t border-stone-100 pt-2 text-base font-bold">
          <dt>Total</dt>
          <dd>{formatCents(totals.totalCents)}</dd>
        </div>
      </dl>
    </div>
  );
}

function PersonGroup(props: {
  person: Participant;
  lines: LineItem[];
  cart: Cart;
  isYou: boolean;
  canEditOwn: boolean;
  canRemove: boolean;
  fresh: Set<string>;
  act: Props["act"];
  onError: Props["onError"];
}) {
  const { person, lines, isYou } = props;
  const subtotal = lines.reduce((s, l) => s + lineTotalCents(l), 0);
  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
      <header className="flex items-center justify-between bg-stone-50 px-4 py-2">
        <h3 className="font-semibold">
          {isYou ? "Your items" : `${person.name}'s items`}
          {person.isHost && <span className="ml-1.5 text-xs font-normal text-stone-500">host</span>}
        </h3>
        <span className="text-sm text-stone-600">{formatCents(subtotal)}</span>
      </header>
      {lines.length === 0 ? (
        <p className="px-4 py-3 text-sm text-stone-500">Add something from the menu.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              cart={props.cart}
              canEditOwn={props.canEditOwn}
              canRemove={props.canRemove}
              highlight={props.fresh.has(line.id)}
              act={props.act}
              onError={props.onError}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function LineRow({
  line,
  cart,
  canEditOwn,
  canRemove,
  highlight,
  act,
  onError,
}: {
  line: LineItem;
  cart: Cart;
  canEditOwn: boolean;
  canRemove: boolean;
  highlight: boolean;
  act: Props["act"];
  onError: Props["onError"];
}) {
  const [pending, setPending] = useState<null | "qty" | "remove">(null);
  const item = findMenuItem(cart.restaurantId, line.menuItemId);
  const details = item ? describeSelections(item, line.selections) : "";

  async function run(kind: "qty" | "remove", action: CartAction) {
    setPending(kind);
    const res = await act(action);
    setPending(null);
    if (!res.ok) onError(res.error);
  }

  const stepBtn = "grid h-8 w-8 place-items-center rounded-full ring-1 ring-stone-300 text-lg leading-none disabled:opacity-30";

  return (
    <li className={`flex items-start gap-3 px-4 py-3 ${highlight ? "animate-arrive" : ""}`}>
      <span className="text-xl" aria-hidden>
        {item?.emoji ?? "🍽️"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {!canEditOwn && line.quantity > 1 && <span className="text-stone-500">{line.quantity}× </span>}
          {item?.name ?? line.menuItemId}
        </p>
        {details && <p className="text-sm text-stone-500">{details}</p>}
        {line.note && <p className="text-sm text-stone-500 italic">“{line.note}”</p>}
        {(canEditOwn || canRemove) && (
          <div className="mt-2 flex items-center gap-2">
            {canEditOwn && (
              <>
                <button
                  className={stepBtn}
                  aria-label="Decrease quantity"
                  disabled={pending !== null || line.quantity <= LIMITS.quantityMin}
                  onClick={() => run("qty", { type: "updateItem", lineId: line.id, quantity: line.quantity - 1 })}
                >
                  −
                </button>
                <span className="w-6 text-center font-semibold tabular-nums">{pending === "qty" ? <Spinner /> : line.quantity}</span>
                <button
                  className={stepBtn}
                  aria-label="Increase quantity"
                  disabled={pending !== null || line.quantity >= LIMITS.quantityMax}
                  onClick={() => run("qty", { type: "updateItem", lineId: line.id, quantity: line.quantity + 1 })}
                >
                  +
                </button>
              </>
            )}
            {canRemove && (
              <button
                className="ml-auto text-sm font-medium text-red-600 disabled:opacity-40"
                disabled={pending !== null}
                onClick={() => run("remove", { type: "removeItem", lineId: line.id })}
              >
                {pending === "remove" ? <Spinner /> : "Remove"}
              </button>
            )}
          </div>
        )}
      </div>
      <span className="text-sm font-medium tabular-nums">{formatCents(lineTotalCents(line))}</span>
    </li>
  );
}

/** Line IDs that appeared from someone else since the last render, so they can flash briefly. */
function useFreshRemoteLines(items: LineItem[], you: string | null): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set(items.map((l) => l.id));
    if (seen.current === null) {
      seen.current = ids; // First load: nothing is "new".
      return;
    }
    const arrived = items.filter((l) => !seen.current!.has(l.id) && l.ownerId !== you).map((l) => l.id);
    seen.current = ids;
    if (arrived.length === 0) return;
    setFresh((prev) => new Set([...prev, ...arrived]));
    // No cleanup: a newer update must not cancel this batch's un-highlight.
    setTimeout(() => {
      setFresh((prev) => new Set([...prev].filter((id) => !arrived.includes(id))));
    }, 2500);
  }, [items, you]);

  return fresh;
}
