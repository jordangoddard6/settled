// Live connection to one cart. The server is the source of truth: this hook only ever shows
// snapshots the server sent, and ignores any snapshot older than the one it already has.
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { CartAction, CartSnapshot, ClientToServerEvents, ServerToClientEvents } from "../../shared/protocol";
import type { ActivityEntry, Cart, Result } from "../../shared/types";
import { getToken } from "../lib/identity";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionState = "connecting" | "connected" | "reconnecting";

export interface CartConnection {
  cart: Cart | null;
  /** This browser's participant ID, or null while only watching. */
  you: string | null;
  online: string[];
  connection: ConnectionState;
  /** Fatal load error (e.g. cart not found). */
  error: string | null;
  /** Latest activity caused by someone else, for toasts/highlights. */
  lastRemoteActivity: ActivityEntry | null;
  join: (name: string) => Promise<Result<object>>;
  act: (action: CartAction) => Promise<Result<object>>;
}

const ACK_TIMEOUT_MS = 8000;

export function useCart(cartId: string): CartConnection {
  const [cart, setCart] = useState<Cart | null>(null);
  const [you, setYou] = useState<string | null>(null);
  const [online, setOnline] = useState<string[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [lastRemoteActivity, setLastRemoteActivity] = useState<ActivityEntry | null>(null);

  const socketRef = useRef<ClientSocket | null>(null);
  const youRef = useRef<string | null>(null);
  // Newest version applied on the current connection. Reset on disconnect so the first
  // snapshot after reconnecting always replaces whatever we had.
  const versionRef = useRef(-1);

  const applySnapshot = useCallback((next: Cart) => {
    if (next.version <= versionRef.current) return false;
    versionRef.current = next.version;
    setCart(next);
    return true;
  }, []);

  const applyYou = useCallback((id: string | null) => {
    youRef.current = id;
    setYou(id);
  }, []);

  useEffect(() => {
    const socket: ClientSocket = io({ transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const token = getToken();

    socket.on("connect", async () => {
      const res = await socket.emitWithAck("cart:open", { cartId, token });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      applyYou(res.you);
      applySnapshot(res.cart);
      setConnection("connected");
    });

    socket.on("disconnect", () => {
      versionRef.current = -1;
      setConnection("reconnecting");
    });

    socket.on("cart:state", ({ cart: next, activity }) => {
      if (applySnapshot(next) && activity && activity.actorId !== youRef.current) {
        setLastRemoteActivity(activity);
      }
    });

    socket.on("cart:presence", (event) => {
      if (event.cartId === cartId) setOnline(event.online);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [cartId, applySnapshot, applyYou]);

  const send = useCallback(async <T,>(fn: (s: ClientSocket) => Promise<Result<T>>): Promise<Result<T>> => {
    const socket = socketRef.current;
    // Don't let Socket.IO buffer changes while offline — they'd replay unexpectedly later.
    if (!socket?.connected) return { ok: false, error: "You're offline — reconnecting…" };
    try {
      return await fn(socket);
    } catch {
      return { ok: false, error: "The server didn't respond. Your cart will re-sync automatically." };
    }
  }, []);

  const join = useCallback(
    async (name: string) => {
      const res = await send<CartSnapshot>((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("cart:join", { name }));
      if (res.ok) {
        applyYou(res.you);
        applySnapshot(res.cart);
      }
      return res;
    },
    [send, applySnapshot, applyYou],
  );

  const act = useCallback(
    (action: CartAction) => send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("cart:action", action)),
    [send],
  );

  return { cart, you, online, connection, error, lastRemoteActivity, join, act };
}
