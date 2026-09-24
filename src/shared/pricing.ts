import { TAX_RATE } from "./config";
import type { MenuItem } from "./menus";
import type { LineItem, Selections } from "./types";

/**
 * Checks a client's option choices against the menu and returns a normalized copy
 * (defaults filled in, unknown groups dropped, duplicates removed), or an error message.
 */
export function normalizeSelections(
  item: MenuItem,
  raw: Selections,
): { ok: true; selections: Selections } | { ok: false; error: string } {
  const selections: Selections = {};
  for (const key of Object.keys(raw)) {
    if (!item.optionGroups.some((g) => g.id === key)) {
      return { ok: false, error: `Unknown option group "${key}" for ${item.name}` };
    }
  }
  for (const group of item.optionGroups) {
    const chosen = [...new Set(raw[group.id] ?? [])];
    for (const optionId of chosen) {
      if (!group.options.some((o) => o.id === optionId)) {
        return { ok: false, error: `Unknown option "${optionId}" in ${group.name}` };
      }
    }
    if (group.type === "single") {
      if (chosen.length > 1) return { ok: false, error: `Pick only one ${group.name}` };
      if (chosen.length === 0 && group.required) {
        if (!group.defaultOptionId) return { ok: false, error: `Pick a ${group.name}` };
        chosen.push(group.defaultOptionId);
      }
    } else if (group.max !== undefined && chosen.length > group.max) {
      return { ok: false, error: `Pick at most ${group.max} ${group.name}` };
    }
    if (chosen.length > 0) selections[group.id] = chosen;
  }
  return { ok: true, selections };
}

/** Price of one unit with the given (already normalized) selections. */
export function unitPriceCents(item: MenuItem, selections: Selections): number {
  let price = item.basePriceCents;
  for (const group of item.optionGroups) {
    for (const optionId of selections[group.id] ?? []) {
      price += group.options.find((o) => o.id === optionId)?.priceDeltaCents ?? 0;
    }
  }
  return price;
}

/** Human-readable summary of selections, in menu order: "Meal (medium fries + drink), Polynesian". */
export function describeSelections(item: MenuItem, selections: Selections): string {
  const parts: string[] = [];
  for (const group of item.optionGroups) {
    for (const optionId of selections[group.id] ?? []) {
      const option = group.options.find((o) => o.id === optionId);
      if (option) parts.push(option.name);
    }
  }
  return parts.join(", ");
}

export function lineTotalCents(line: Pick<LineItem, "unitPriceCents" | "quantity">): number {
  return line.unitPriceCents * line.quantity;
}

export interface Totals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

export function computeTotals(items: Pick<LineItem, "unitPriceCents" | "quantity">[]): Totals {
  const subtotalCents = items.reduce((sum, line) => sum + lineTotalCents(line), 0);
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
