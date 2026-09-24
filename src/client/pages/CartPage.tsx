import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { RESTAURANTS } from "../../shared/menus";
import { computeTotals, formatCents } from "../../shared/pricing";
import { CartPanel } from "../components/CartPanel";
import { CheckoutPanel } from "../components/CheckoutPanel";
import { OrderPlacedBanner } from "../components/Receipt";
import { ConnectionPill, ReconnectBanner } from "../components/ConnectionPill";
import { JoinCard } from "../components/JoinCard";
import { MenuPanel } from "../components/MenuPanel";
import { People } from "../components/People";
import { SharePanel } from "../components/SharePanel";
import { ToastStack, useToasts } from "../components/Toasts";
import { useCart } from "../hooks/useCart";

export default function CartPage() {
  const cartId = (useParams().cartId ?? "").toUpperCase();
  const { cart, you, online, connection, error, lastRemoteActivity, join, act, checkout } = useCart(cartId);
  const { toasts, push } = useToasts();
  const [tab, setTab] = useState<"menu" | "cart">("menu");
  const status = cart?.status;

  useEffect(() => {
    if (lastRemoteActivity) push(lastRemoteActivity.text);
  }, [lastRemoteActivity, push]);

  // On phones, jump to the cart tab when checkout starts so everyone sees why it's locked.
  useEffect(() => {
    if (status === "locked") setTab("cart");
  }, [status]);

  if (error) {
    return (
      <CenteredMessage title="Hmm, that didn't work" body={error}>
        <Link to="/" className="mt-6 inline-block rounded-xl bg-brand px-5 py-3 font-semibold text-white">
          Start a new order
        </Link>
      </CenteredMessage>
    );
  }

  if (!cart) {
    return (
      <CenteredMessage
        title="Connecting to the cart…"
        body="If the server has been asleep, this can take up to a minute the first time."
      />
    );
  }

  const restaurant = RESTAURANTS[cart.restaurantId];
  const host = cart.participants.find((p) => p.isHost);
  const joined = you !== null;
  const disabledReason = !joined
    ? "Join the order above to add items."
    : cart.status !== "open"
      ? "The cart is locked while the host checks out."
      : null;
  const totals = computeTotals(cart.items);
  const onError = (message: string) => push(message, "error");

  return (
    <div className="min-h-dvh pb-24 lg:pb-8" style={{ "--accent": restaurant.accent } as CSSProperties}>
      <ReconnectBanner state={connection} />

      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-bold tracking-tight" aria-label="Settled home">
            🍽️ <span className="hidden sm:inline">Settled</span>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">
              {restaurant.emoji} {restaurant.name} group order
            </p>
            <p className="text-xs text-stone-500">
              Code <span className="font-mono font-semibold">{cart.id}</span>
              {host && <> · hosted by {host.name}</>}
            </p>
          </div>
          <ConnectionPill state={connection} />
        </div>
      </header>

      {cart.status === "ordered" ? (
        <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
          <OrderPlacedBanner cart={cart} restaurant={restaurant} />
          <People participants={cart.participants} online={online} you={you} />
          <h2 className="text-sm font-bold tracking-wide text-stone-500 uppercase">Receipt</h2>
          <CartPanel cart={cart} you={you} act={act} onError={onError} />
          <div className="pt-2 text-center">
            <Link to="/" className="inline-block rounded-xl bg-stone-900 px-5 py-3 font-semibold text-white">
              Start another order
            </Link>
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-6xl space-y-4 px-4 pt-4">
          {!joined && host && (
            <JoinCard hostName={host.name} restaurantName={restaurant.name} locked={cart.status === "locked"} onJoin={join} />
          )}
          <SharePanel cartId={cart.id} restaurantName={restaurant.name} />
          <People participants={cart.participants} online={online} you={you} />

          {/* Mobile: tabs. Desktop: menu and cart side by side. */}
          <div className="grid grid-cols-2 rounded-xl bg-stone-200 p-1 text-sm font-semibold lg:hidden" role="tablist">
            {(["menu", "cart"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-lg py-2 ${tab === t ? "bg-white shadow-sm" : "text-stone-600"}`}
              >
                {t === "menu" ? "Menu" : `Cart (${cart.items.length})`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className={`min-w-0 ${tab === "menu" ? "" : "hidden lg:block"}`}>
              <MenuPanel restaurant={restaurant} disabledReason={disabledReason} act={act} onError={onError} />
            </div>
            <aside className={`min-w-0 lg:sticky lg:top-4 lg:self-start ${tab === "cart" ? "" : "hidden lg:block"}`}>
              <h2 className="mb-2 hidden text-sm font-bold tracking-wide text-stone-500 uppercase lg:block">Group cart</h2>
              <div className="space-y-4">
                <CartPanel cart={cart} you={you} act={act} onError={onError} />
                <CheckoutPanel cart={cart} you={you} accent={restaurant.accent} checkout={checkout} onError={onError} />
              </div>
            </aside>
          </div>
        </main>
      )}

      {/* Mobile cart summary bar */}
      {tab === "menu" && cart.status !== "ordered" && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 p-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setTab("cart")}
            className="flex w-full items-center justify-between rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white"
          >
            <span>View group cart · {cart.items.length}</span>
            <span>{formatCents(totals.totalCents)}</span>
          </button>
        </div>
      )}

      <ToastStack toasts={toasts} />
    </div>
  );
}

function CenteredMessage({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-4xl" aria-hidden>
          🍽️
        </p>
        <h1 className="mt-3 text-xl font-bold">{title}</h1>
        <p className="mt-2 max-w-sm text-stone-600">{body}</p>
        {children}
      </div>
    </div>
  );
}
