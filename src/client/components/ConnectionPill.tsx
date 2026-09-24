import type { ConnectionState } from "../hooks/useCart";

const STYLES: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  connecting: { label: "Connecting…", dot: "bg-amber-400 animate-pulse", text: "text-amber-700" },
  connected: { label: "Live", dot: "bg-emerald-500", text: "text-emerald-700" },
  reconnecting: { label: "Reconnecting…", dot: "bg-red-500 animate-pulse", text: "text-red-700" },
};

export function ConnectionPill({ state }: { state: ConnectionState }) {
  const s = STYLES[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold ring-1 ring-stone-200 ${s.text}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function ReconnectBanner({ state }: { state: ConnectionState }) {
  if (state !== "reconnecting") return null;
  return (
    <div role="status" className="sticky top-0 z-30 bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
      Connection lost — reconnecting. Your cart will re-sync automatically.
    </div>
  );
}
