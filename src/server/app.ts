import { existsSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";
import { z } from "zod";
import { isRestaurantId } from "../shared/menus";
import type { CreateCartResponse } from "../shared/protocol";
import { cleanName } from "./cart/rules";
import { CartService } from "./cart/service";
import type { CartStore } from "./cart/store";
import { registerSocketHandlers, type IO } from "./socket";

const createCartSchema = z.object({ restaurantId: z.string(), name: z.string(), token: z.string().min(8).max(100) });

export interface App {
  httpServer: HttpServer;
  io: IO;
  service: CartService;
}

export function createApp(store: CartStore): App {
  const service = new CartService(store);
  const app = express();
  app.use(express.json({ limit: "20kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/carts", async (req, res) => {
    const send = (status: number, body: CreateCartResponse) => res.status(status).json(body);
    const parsed = createCartSchema.safeParse(req.body);
    if (!parsed.success || !isRestaurantId(parsed.data.restaurantId)) return send(400, { ok: false, error: "Invalid request." });
    const name = cleanName(parsed.data.name);
    if (!name) return send(400, { ok: false, error: "Please enter your name (up to 30 characters)." });
    const cart = await service.create(parsed.data.restaurantId, name, parsed.data.token);
    send(201, { ok: true, cartId: cart.id });
  });

  // In production the server also serves the built React app.
  const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist/client");
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
  }

  const httpServer = createServer(app);
  // No connection-state recovery: on every (re)connect the client re-opens the cart and receives
  // a full snapshot, so there's a single, simple path back to the correct state.
  const io: IO = new Server(httpServer);
  registerSocketHandlers(io, service);

  return { httpServer, io, service };
}
