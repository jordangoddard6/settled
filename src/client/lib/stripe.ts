import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { AppConfig } from "../../shared/protocol";

let configPromise: Promise<AppConfig> | null = null;
let stripePromise: Promise<Stripe | null> | null = null;

/** Server config, fetched once. Keys live only on the server (.env locally, Render settings in production). */
export function getConfig(): Promise<AppConfig> {
  configPromise ??= fetch("/api/config")
    .then((r) => r.json() as Promise<AppConfig>)
    .catch(() => {
      configPromise = null; // Let a later call retry.
      return { stripePublishableKey: null };
    });
  return configPromise;
}

/** Stripe.js, loaded once and only when checkout needs it. Resolves null if payments aren't configured. */
export function getStripe(): Promise<Stripe | null> {
  stripePromise ??= getConfig().then((c) =>
    c.stripePublishableKey
      ? // Hide Stripe's test-mode developer panel (the "stripe >" button) so testers only see our UI.
        loadStripe(c.stripePublishableKey, { developerTools: { assistant: { enabled: false } } })
      : null,
  );
  return stripePromise;
}
