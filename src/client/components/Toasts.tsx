import type { Toast } from "../hooks/useToasts";

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex flex-col items-center gap-2 px-4 lg:bottom-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${t.tone === "error" ? "bg-red-600" : "bg-stone-900"}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
