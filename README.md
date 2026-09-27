# Settled

Real-time group food ordering: start an order, share the link, and watch everyone's items land in
one cart — live, on every device. See [SPEC.md](SPEC.md) for the full MVP spec.

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

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Server (with reload) + Vite dev server        |
| `npm test`          | Unit tests + two-client real-time sync test   |
| `npm run typecheck` | TypeScript check                              |
| `npm run build`     | Build the client into `dist/client`           |
| `npm start`         | Production server (serves the built client)   |
