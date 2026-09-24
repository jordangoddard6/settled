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
- Visible live signals: who's online (presence dots), toasts for other people's changes, a brief
  highlight on new items, an activity feed.

## People and permissions

- No accounts. You enter a display name; your browser keeps a random secret token. The server
  maps token → participant and never broadcasts tokens. Creator = host.
- The cart has one line per item added, tagged with its owner, and is grouped by person
  (sets up bill splitting later).
- You edit/remove only your own items; the host can also remove anyone's.
- Known limitation: the host role is tied to the host's browser.

## Cart lifecycle

- Home → pick a restaurant + enter name → cart created at `/c/XXXXXX` (6 chars, no 0/O/1/I).
  Share via copy link, the phone's share menu, or a QR code.
- `open` → `locked` (host is paying; others can join and watch but not add) → `ordered`
  (read-only receipt).
- The restaurant is fixed per cart.
- Participants have an "I'm done" toggle. The host can cancel checkout; the lock also clears
  automatically after 10 minutes without payment.
- Open carts expire after 24 hours with no activity; ordered carts stay viewable for 7 days.

## Menus and totals

- Chick-fil-A and Swig, ~10–13 items each, in `src/shared/menus.ts`. Each item has a size and
  one or two option groups, plus a note. Prices are approximate; the server prices every line
  from the menu.
- Subtotal + Provo, UT tax (8.45% = 7.45% sales + 1% Utah County restaurant tax). No tip, no fees.
  Pickup only.
- Names only — no official logos or photos.

## Payment

- Stripe Payment Element (inside the page), test mode, cards only. The server computes the amount.
- After the client confirms, the server asks Stripe directly whether the payment succeeded
  (no webhook), then marks the order sent and shows "Order sent" to everyone. Nothing is actually
  sent to a restaurant.

## Saving carts

- Neon Postgres, one `carts` table, one row per cart with the cart as a JSON document.
- The server keeps active carts in memory and saves after every change (coalesced).
- Without `DATABASE_URL`, carts live in memory only (local dev).

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
2. Menus and UI: item options, activity feed, polish.
3. Checkout: ready toggles, lock/unlock and timeout, Stripe Payment Element, "Order sent". *(Stripe account)*
4. Saving and deploying: Neon storage, restore after restart, expiry, Render deploy, test on two devices. *(Neon account)*
5. Wrap-up: README, "How to test" note, known-limitations list.
