# Copilot instructions

Follow the repository's AI agent rules in [`CLAUDE.md`](../CLAUDE.md) — the same rules apply to every
approved AI tool. In short:

- TypeScript strict, no `any`, no lint/type suppressions. Prettier owns formatting.
- Cart rules are pure functions in `src/server/cart/rules.ts`; money is integer cents; the server
  prices everything.
- Never suggest secrets, `.env` contents, or live Stripe keys. Test keys only.
- Suggestions are drafts: the developer reviews every line and runs `npm run check` before committing.
