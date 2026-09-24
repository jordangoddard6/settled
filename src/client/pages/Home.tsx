import { useState } from "react";
import { useNavigate } from "react-router";
import { LIMITS } from "../../shared/config";
import { RESTAURANT_LIST } from "../../shared/menus";
import type { CreateCartRequest, CreateCartResponse } from "../../shared/protocol";
import type { RestaurantId } from "../../shared/types";
import { getSavedName, getToken, saveName } from "../lib/identity";

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState(getSavedName);
  const [creating, setCreating] = useState<RestaurantId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(restaurantId: RestaurantId) {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter your name first so your friends know whose order it is.");
      document.getElementById("host-name")?.focus();
      return;
    }
    setError(null);
    setCreating(restaurantId);
    try {
      const body: CreateCartRequest = { restaurantId, name: trimmed, token: getToken() };
      const res = await fetch("/api/carts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as CreateCartResponse;
      if (!data.ok) throw new Error(data.error);
      saveName(trimmed);
      navigate(`/c/${data.cartId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the order. Try again?");
      setCreating(null);
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center gap-2 px-4 pt-6">
        <span className="text-2xl" aria-hidden>
          🍽️
        </span>
        <span className="text-xl font-bold tracking-tight">Settled</span>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16">
        <section className="pt-10 pb-8">
          <h1 className="text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">
            Order together.
            <br />
            <span className="text-brand">Pay once.</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-stone-600">
            Start a group order, share the link, and watch everyone's picks land in one cart — live, on every phone.
          </p>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6">
          <label htmlFor="host-name" className="text-sm font-semibold text-stone-700">
            Your name
          </label>
          <input
            id="host-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.nameMax}
            autoComplete="given-name"
            placeholder="e.g. Jordan"
            className="mt-1.5 w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />

          <h2 className="mt-6 text-sm font-semibold text-stone-700">Pick a restaurant to start a group order</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {RESTAURANT_LIST.map((r) => (
              <button
                key={r.id}
                onClick={() => start(r.id)}
                disabled={creating !== null}
                className="group flex items-center gap-4 rounded-xl border border-stone-200 p-4 text-left transition hover:border-stone-400 hover:shadow-sm disabled:opacity-60"
                style={{ borderLeft: `6px solid ${r.accent}` }}
              >
                <span className="text-4xl" aria-hidden>
                  {r.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold">{r.name}</span>
                  <span className="block text-sm text-stone-500">{r.tagline}</span>
                </span>
                <span className="text-sm font-semibold text-brand group-hover:underline">
                  {creating === r.id ? "Starting…" : "Start →"}
                </span>
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </section>

        <p className="mt-6 text-center text-xs text-stone-400">
          Sample menus with approximate prices. Not affiliated with any restaurant.
        </p>
      </main>
    </div>
  );
}
