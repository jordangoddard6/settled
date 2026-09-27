# Settled

Real-time group food ordering: start an order, share the link, and watch everyone's items land in
one cart — live, on every device. See [SPEC.md](SPEC.md) for the full MVP spec.

**Live demo:** https://settled-bcn8.onrender.com (may take up to a minute to wake up)

## Run locally

Requires Node 22+.

```bash
npm install
npm run dev
```

- App: http://localhost:5173 (Vite; proxies `/api` and `/socket.io` to the server on port 3001).
- To try it as two people on one computer, open the cart link on `localhost` in one tab and on
  `127.0.0.1` in another — they're separate sites to the browser, so each gets its own identity.
- To try it on your phone, use the "Network" URL Vite prints (same Wi-Fi).

## Stripe (test mode)

Copy `.env.example` to `.env` and add your Stripe **test** keys from
https://dashboard.stripe.com/test/apikeys. Without keys, everything works except checkout. The
server refuses live keys.

## Deploy (Render)

`render.yaml` defines one free web service that serves both the React app and the Socket.IO server.

1. Render → **New → Blueprint** → select this repo.
2. Enter `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` (test keys) when prompted.
3. Deploy. Pushes to `main` redeploy automatically.

Carts live in server memory, so they reset whenever the service restarts, redeploys, or sleeps
(free services sleep after 15 idle minutes; the first request afterwards takes about a minute).

## Known limitations (MVP)

- **Carts are temporary.** They live in server memory and disappear when the server restarts,
  redeploys, or sleeps. Start a fresh order from the home page rather than reusing old links.
- **Slow first load after idle.** Render's free tier sleeps after 15 idle minutes; waking takes
  about a minute.
- **No accounts.** Identity is a random token in the browser. The host role is tied to the host's
  browser, so clearing site data or switching devices loses it.
- **Abandoned checkout stays locked.** If the host starts checkout and never returns, the cart
  stays locked (the host can cancel from the same browser).
- **Default options only.** Items are added with their default size/options; there's no options
  screen yet (the menu data and server already support options).
- **The host pays for everyone.** Splitting the bill per person is future work (each item already
  records who added it).
- **Test payments only, no real ordering.** Stripe runs in test mode, and "Order sent" is a demo
  message — nothing is sent to a restaurant.
- **No rate limiting.** Anyone with a cart link or code can join (up to 25 people per cart).
- **Single server instance.** Live state is in one process's memory, so it can't scale across
  multiple servers without a shared store.
- **Tax is a flat approximation** (8.45% for Provo, UT restaurant food).

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Server (with reload) + Vite dev server        |
| `npm test`          | Unit tests + two-client real-time sync test   |
| `npm run typecheck` | TypeScript check                              |
| `npm run build`     | Build the client into `dist/client`           |
| `npm start`         | Production server (serves the built client)   |
