import { useState, type FormEvent } from "react";
import { LIMITS } from "../../shared/config";
import type { Result } from "../../shared/types";
import { getSavedName, saveName } from "../lib/identity";

interface Props {
  hostName: string;
  restaurantName: string;
  locked: boolean;
  onJoin: (name: string) => Promise<Result<object>>;
}

export function JoinCard({ hostName, restaurantName, locked, onJoin }: Props) {
  const [name, setName] = useState(getSavedName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter your name.");
    setPending(true);
    setError(null);
    const res = await onJoin(name.trim());
    setPending(false);
    if (res.ok) saveName(name);
    else setError(res.error);
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-md ring-2 ring-[var(--accent)]">
      <h2 className="text-lg font-bold">
        {hostName} invited you to a {restaurantName} order
      </h2>
      <p className="mt-1 text-sm text-stone-600">
        {locked ? "The host is checking out right now, so you can watch but not add items." : "Enter your name to add your own items."}
      </p>
      <div className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.nameMax}
          autoComplete="given-name"
          placeholder="Your name"
          aria-label="Your name"
          className="min-w-0 flex-1 rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Joining…" : "Join"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
