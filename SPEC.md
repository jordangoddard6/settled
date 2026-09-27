# Settled — MVP spec

Real-time group food ordering. One person starts an order and shares a link; everyone adds their
own items to a shared cart that updates live on every device; the host pays for the whole order.

**Goal:** a working MVP that can be tested on two different devices, with the cart updating live
and accurately. (Class rubric: "functional MVP ready for testing" — minimal features encouraged.)

## Stack

- Vite + React + TypeScript + Tailwind (client), Node + Express + Socket.IO (server), one repo.
- `src/client`, `src/server`, `src/shared` (types, menus, pricing shared by both).
- Hosting: Render (free tier; ~1 min cold start after 15 min idle is accepted). Not Vercel — its
  serverless functions can't hold WebSocket connections.

## Real-time model

- The server holds the one true copy of each cart. Every change is applied there, in arrival
  order, and the full cart is broadcast to everyone in the cart.
- Each cart has a `version` that increases by exactly 1 per accepted change. Clients ignore any
  snapshot older than the one they hold.
- The UI updates when the server confirms a change (brief spinner), never optimistically.
- On (re)connect, the client re-opens the cart and receives a full snapshot. A "Reconnecting…"
  banner shows while offline, and changes are refused rather than queued while offline.
- Visible live signals: who's online (presence dots), toasts for other people's changes, and a
  brief highlight on new items.

## People and permissions

- No accounts. You enter a display name; your browser keeps a random secret token. The server
  maps token → participant and never broadcasts tokens. Creator = host.
- The cart has one line per item added, tagged with its owner, and is grouped by person
  (sets up bill splitting later).
- You edit/remove only your own items; the host can also remove anyone's.
- Known limitation: the host role is tied to the host's browser.

## Cart lifecycle

- Home → pick a restaurant + enter name → cart created at `/c/XXXXXX` (6 chars, no 0/O/1/I).
  Share via copy link, the phone's share menu, or a QR code. Friends can also type the code into
  the "Have a code?" box on the home page.
- `open` → `locked` (host is paying; others can join and watch but not add) → `ordered`
  (read-only receipt).
- The restaurant is fixed per cart.
- The host can cancel checkout to unlock the cart. There is no automatic unlock: if the host
  abandons checkout and never returns, the cart stays locked (accepted for the MVP).
- No expiry: carts live until the server restarts.

## Menus and totals

- Chick-fil-A and Swig, ~10–13 items each, in `src/shared/menus.ts`. Items are added with their
  default options (e.g. entrée only, medium, 24 oz); there is no options screen in the MVP, though
  the menu data and server support options. Prices are approximate; the server prices every line
  from the menu.
- Subtotal + Provo, UT tax (8.45% = 7.45% sales + 1% Utah County restaurant tax). No tip, no fees.
  Pickup only.
- Names only — no official logos or photos.

## Payment

- Stripe Payment Element (inside the page), test mode, cards only. The server computes the amount.
- After the client confirms, the server asks Stripe directly whether the payment succeeded
  (no webhook), then marks the order sent and shows "Order sent" to everyone. Nothing is actually
  sent to a restaurant.
- A declined card keeps the cart locked with the card form open, so the host can try another card
  or cancel checkout.
- The server refuses live Stripe keys; only `sk_test_…` / `pk_test_…` are accepted.

## Saving carts

- Server memory only for the MVP. Carts are lost when the server restarts, sleeps (Render free
  tier, after 15 idle minutes) or is redeployed — so testers start a fresh order from the home page.
- Storage sits behind a `CartStore` interface, so Neon Postgres (one `carts` table, cart as a JSON
  document) can be added later without rework.

## Safeguards

Names 1–30 characters, quantity 1–20, notes up to 140 characters, at most 100 lines and 25 people
per cart. All input is validated on the server. No rate limiting (known limitation).

## Testing

- Vitest unit tests for the cart rules and pricing.
- An integration test with two real Socket.IO clients making simultaneous changes, checking that
  both end with identical carts and see every version exactly once.
- UI checked by hand in two browser windows / two devices.

## Build order

1. The shared cart: create/join, add/remove, live sync, reconnect, two-user test. ✅
2. Checkout: join-by-code box, lock/cancel, Stripe Payment Element, server verification,
   "Order sent" + receipt. ✅ *(needs Stripe test keys to try)*
3. Deploy to Render and test on two real devices. ✅ Live at https://settled-bcn8.onrender.com
4. Wrap-up: README with setup, deploy steps and known limitations. ✅

Cut from the MVP: options screen, activity feed, "I'm done" toggles, auto-unlock timeout, cart
expiry, Neon storage, on-site "How to test" notes (instructions go to the tester directly).
