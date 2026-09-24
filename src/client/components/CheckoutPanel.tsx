import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { computeTotals, formatCents } from "../../shared/pricing";
import type { CheckoutSession } from "../../shared/protocol";
import type { Cart, Result } from "../../shared/types";
import type { CartConnection } from "../hooks/useCart";
import { getStripe } from "../lib/stripe";
import { Spinner } from "./MenuPanel";

interface Props {
  cart: Cart;
  you: string | null;
  accent: string;
  checkout: CartConnection["checkout"];
  onError: (message: string) => void;
}

export function CheckoutPanel({ cart, you, accent, checkout: raw, onError }: Props) {
  const host = cart.participants.find((p) => p.isHost);
  const isHost = !!you && you === cart.hostId;

  // Clicking "Check out" locks the cart, which immediately swaps in the payment form. Both ask for
  // the payment session, so share one in-flight request instead of creating two PaymentIntents.
  const inflight = useRef<Promise<Result<CheckoutSession>> | null>(null);
  const checkout = useMemo(
    () => ({
      ...raw,
      start: () =>
        (inflight.current ??= raw.start().finally(() => {
          inflight.current = null;
        })),
    }),
    [raw],
  );

  if (cart.status === "ordered") return null;

  if (!isHost) {
    return (
      <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-stone-200">
        {cart.status === "locked" ? (
          <p className="font-medium">🔒 {host?.name ?? "The host"} is paying now — the cart is locked.</p>
        ) : (
          <p className="text-stone-600">{host?.name ?? "The host"} will pay for the whole order at checkout.</p>
        )}
      </div>
    );
  }

  return cart.status === "open" ? (
    <StartCheckout cart={cart} checkout={checkout} onError={onError} />
  ) : (
    <HostPayment accent={accent} checkout={checkout} onError={onError} />
  );
}

function StartCheckout({ cart, checkout, onError }: Pick<Props, "cart" | "checkout" | "onError">) {
  const [pending, setPending] = useState(false);
  const { totalCents } = computeTotals(cart.items);
  const empty = cart.items.length === 0;

  async function start() {
    setPending(true);
    const res = await checkout.start();
    setPending(false);
    if (!res.ok) onError(res.error);
  }

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <button
        onClick={start}
        disabled={empty || pending}
        className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white disabled:opacity-40"
      >
        {pending ? <Spinner /> : `Check out · ${formatCents(totalCents)}`}
      </button>
      <p className="mt-2 text-center text-xs text-stone-500">
        {empty ? "Add items to check out." : "You'll pay for the whole order. Checking out locks the cart for everyone."}
      </p>
    </div>
  );
}

/** Host view while the cart is locked: fetch (or resume) the payment session and show Stripe's card form. */
function HostPayment({ accent, checkout, onError }: Pick<Props, "accent" | "checkout" | "onError">) {
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [stripe, setStripe] = useState<Stripe | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([checkout.start(), getStripe()]).then(([res, stripeInstance]) => {
      if (cancelled) return;
      setStripe(stripeInstance);
      if (res.ok) setSession({ clientSecret: res.clientSecret, amountCents: res.amountCents });
      else setLoadError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [checkout, attempt]);

  let body;
  if (loadError) {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-red-700">{loadError}</p>
        <button onClick={() => setAttempt((n) => n + 1)} className="text-sm font-semibold underline">
          Try again
        </button>
      </div>
    );
  } else if (!session || stripe === undefined) {
    body = (
      <p className="flex items-center gap-2 text-sm text-stone-600">
        <Spinner /> Preparing secure payment…
      </p>
    );
  } else if (stripe === null) {
    body = <p className="text-sm text-red-700">Payments aren't set up on this server yet (missing Stripe test keys).</p>;
  } else {
    body = (
      <Elements
        key={session.clientSecret}
        stripe={stripe}
        options={{ clientSecret: session.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: accent, borderRadius: "10px" } } }}
      >
        <PayForm amountCents={session.amountCents} complete={checkout.complete} onError={onError} />
      </Elements>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 ring-2 ring-[var(--accent)]">
      <div className="flex items-baseline justify-between">
        <h3 className="font-bold">Pay for the group</h3>
        <span className="text-xs font-semibold tracking-wide text-amber-700 uppercase">Test mode</span>
      </div>
      <p className="text-xs text-stone-500">
        No real charges. Use card <span className="font-mono">4242 4242 4242 4242</span>, any future date, any CVC and ZIP.
      </p>
      {body}
      <CancelButton cancel={checkout.cancel} onError={onError} />
    </div>
  );
}

function PayForm({ amountCents, complete, onError }: { amountCents: number; complete: () => Promise<Result<object>>; onError: (m: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setMessage(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required", // Cards (incl. 3-D Secure) complete in-page.
      confirmParams: { return_url: window.location.href },
    });
    if (error) {
      // Declined card etc. The cart stays locked so the host can try another card or cancel.
      setMessage(error.message ?? "Payment failed.");
      setPaying(false);
      return;
    }
    if (paymentIntent?.status === "succeeded") {
      const res = await complete();
      if (!res.ok) onError(res.error);
      // On success the server broadcasts the "ordered" cart and this form unmounts.
    }
    setPaying(false);
  }

  return (
    <form onSubmit={pay} className="space-y-3">
      <PaymentElement />
      {message && (
        <p role="alert" className="text-sm text-red-700">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || paying}
        className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {paying ? <Spinner /> : `Pay ${formatCents(amountCents)}`}
      </button>
    </form>
  );
}

function CancelButton({ cancel, onError }: { cancel: () => Promise<Result<object>>; onError: (m: string) => void }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      onClick={async () => {
        setPending(true);
        const res = await cancel();
        setPending(false);
        if (!res.ok) onError(res.error);
      }}
      disabled={pending}
      className="w-full rounded-xl px-4 py-2 text-sm font-semibold text-stone-600 ring-1 ring-stone-300 disabled:opacity-50"
    >
      {pending ? <Spinner /> : "Cancel checkout & unlock cart"}
    </button>
  );
}
