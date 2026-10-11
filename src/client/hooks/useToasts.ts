import { useCallback, useState } from "react";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
}

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), tone === "error" ? 5000 : 3000);
  }, []);
  return { toasts, push };
}
