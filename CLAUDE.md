# Settled — AI agent rules

Every AI agent working in this repo (Claude Code, GitHub Copilot) follows these rules. Humans own
every change; agents propose, humans review and commit. Team playbook:
https://jordangoddard6.github.io/settled/

## What this is

Real-time group food ordering. One host starts a cart, friends join by link/QR/code, everyone adds
their own items, the host pays (Stripe **test mode**). The server holds the single source of truth
for each cart and broadcasts full snapshots over Socket.IO; clients never apply changes optimistically.

- `src/shared/` — types, menus, pricing, socket protocol (used by client and server)
- `src/server/` — Express + Socket.IO. `cart/rules.ts` is pure (all cart rules live here);
  `cart/service.ts` applies them; `checkout.ts` sequences Stripe calls; `payments.ts` wraps Stripe
- `src/client/` — React 19 + Vite + Tailwind 4. `hooks/useCart.ts` owns the socket connection
- `test/` — Vitest unit + integration (real server, real socket clients); `e2e/` — Playwright

## Commands

- `npm run dev` — server :3001 + Vite :5173
- `npm run check` — lint + format check + typecheck + Vitest. **Must pass before you say you're done.**
- `npm run test:e2e` — Playwright (builds and starts the production server itself)
- `npm run lint:fix`, `npm run format`

## Conventions

- TypeScript everywhere, strict mode. No `any`; no `// eslint-disable` or `@ts-ignore` without the
  human's explicit approval.
- New cart behavior goes in `cart/rules.ts` as a pure function with unit tests; anything that
  changes what users see in real time gets an integration test (`test/sync.test.ts` pattern).
- Money is integer cents. The server prices everything from the menu; never trust client prices.
- Match the surrounding code's style and comment density. Prettier owns formatting.

## Guardrails (non-negotiable)

1. **Never run `git commit`, `git push`, or change GitHub/Render settings** unless the human asks in
   that moment. Stop and say the work is ready for review.
2. **Never read, print, or edit `.env`** or any secret. Never put keys in code, tests, logs, or chat.
3. **Stripe test keys only.** Never add code paths for live keys (the server refuses them on purpose).
4. Don't add dependencies without saying why; prefer what's already installed.
5. Don't weaken a control (lint rules, CI steps, tests, branch rules) to make something pass — fix
   the code or ask.
6. Report honestly: if a test fails or a step was skipped, say so with the output.

## Agent roles (pick the cheapest model that fits)

| Role                   | When                                                       | Model tier                           |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------ |
| Inspect & plan         | Start of each issue; read the code + issue, write a plan   | Top (Claude Opus)                    |
| Implement              | Write the code from the agreed plan                        | Mid (Claude Sonnet) / Copilot inline |
| Test & verify          | Before every commit: `npm run check`, add missing tests    | Mid / small (Sonnet, Haiku)          |
| Bug diagnosis & fix    | Reproduce from logs/steps, write a failing test first      | Mid (Sonnet)                         |
| Code review & security | Before opening a PR: `/code-review` and `/security-review` | Top (Claude Opus)                    |
