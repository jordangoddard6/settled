// Sample menus. Names and approximate prices only — edit freely.
import type { RestaurantId } from "./types";

export interface MenuOption {
  id: string;
  name: string;
  priceDeltaCents: number;
}

export interface OptionGroup {
  id: string;
  name: string;
  /** "single": pick exactly one (if required) or at most one. "multi": pick up to `max`. */
  type: "single" | "multi";
  required: boolean;
  max?: number;
  /** Used when the client sends no choice for a required single group. */
  defaultOptionId?: string;
  options: MenuOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  basePriceCents: number;
  optionGroups: OptionGroup[];
}

export interface Restaurant {
  id: RestaurantId;
  name: string;
  tagline: string;
  emoji: string;
  /** Hex color used to theme the cart page. */
  accent: string;
  menu: MenuItem[];
}

// ---------- Chick-fil-A ----------

const cfaMeal: OptionGroup = {
  id: "meal",
  name: "Entrée or meal",
  type: "single",
  required: true,
  defaultOptionId: "entree",
  options: [
    { id: "entree", name: "Entrée only", priceDeltaCents: 0 },
    { id: "meal", name: "Meal (medium fries + drink)", priceDeltaCents: 469 },
  ],
};

const cfaSauce: OptionGroup = {
  id: "sauce",
  name: "Sauces",
  type: "multi",
  required: false,
  max: 2,
  options: [
    { id: "cfa-sauce", name: "Chick-fil-A Sauce", priceDeltaCents: 0 },
    { id: "polynesian", name: "Polynesian", priceDeltaCents: 0 },
    { id: "honey-mustard", name: "Honey Mustard", priceDeltaCents: 0 },
    { id: "ranch", name: "Garden Herb Ranch", priceDeltaCents: 0 },
    { id: "bbq", name: "Barbeque", priceDeltaCents: 0 },
    { id: "buffalo", name: "Zesty Buffalo", priceDeltaCents: 0 },
  ],
};

const cfaCount = (id: string, small: number, large: number, delta: number): OptionGroup => ({
  id,
  name: "Count",
  type: "single",
  required: true,
  defaultOptionId: `${small}ct`,
  options: [
    { id: `${small}ct`, name: `${small} count`, priceDeltaCents: 0 },
    { id: `${large}ct`, name: `${large} count`, priceDeltaCents: delta },
  ],
});

const sizeGroup = (deltas: [number, number]): OptionGroup => ({
  id: "size",
  name: "Size",
  type: "single",
  required: true,
  defaultOptionId: "medium",
  options: [
    { id: "small", name: "Small", priceDeltaCents: 0 },
    { id: "medium", name: "Medium", priceDeltaCents: deltas[0] },
    { id: "large", name: "Large", priceDeltaCents: deltas[1] },
  ],
});

const chickFilA: Restaurant = {
  id: "chick-fil-a",
  name: "Chick-fil-A",
  tagline: "Chicken sandwiches, nuggets & lemonade",
  emoji: "🐔",
  accent: "#dd0031",
  menu: [
    { id: "chicken-sandwich", name: "Chicken Sandwich", description: "Boneless breast of chicken, pickles, toasted bun.", category: "Entrées", emoji: "🥪", basePriceCents: 549, optionGroups: [cfaMeal, cfaSauce] },
    { id: "spicy-sandwich", name: "Spicy Chicken Sandwich", description: "Spicy seasoned breast of chicken, pickles, toasted bun.", category: "Entrées", emoji: "🌶️", basePriceCents: 579, optionGroups: [cfaMeal, cfaSauce] },
    { id: "deluxe-sandwich", name: "Deluxe Sandwich", description: "With lettuce, tomato and American cheese.", category: "Entrées", emoji: "🍔", basePriceCents: 629, optionGroups: [cfaMeal, cfaSauce] },
    { id: "nuggets", name: "Nuggets", description: "Bite-sized pieces of boneless chicken.", category: "Entrées", emoji: "🍗", basePriceCents: 579, optionGroups: [cfaCount("count", 8, 12, 259), cfaMeal, cfaSauce] },
    { id: "grilled-nuggets", name: "Grilled Nuggets", description: "Marinated, grilled bite-sized chicken.", category: "Entrées", emoji: "🔥", basePriceCents: 689, optionGroups: [cfaCount("count", 8, 12, 329), cfaMeal, cfaSauce] },
    { id: "strips", name: "Chick-n-Strips", description: "Hand-breaded chicken tenders.", category: "Entrées", emoji: "🍗", basePriceCents: 599, optionGroups: [cfaCount("count", 3, 4, 149), cfaMeal, cfaSauce] },
    { id: "cool-wrap", name: "Grilled Cool Wrap", description: "Grilled chicken, cheese and greens in a flatbread.", category: "Entrées", emoji: "🌯", basePriceCents: 889, optionGroups: [cfaSauce] },
    { id: "waffle-fries", name: "Waffle Potato Fries", description: "Sea-salted waffle-cut fries.", category: "Sides", emoji: "🍟", basePriceCents: 219, optionGroups: [sizeGroup([40, 80])] },
    { id: "mac-cheese", name: "Mac & Cheese", description: "Baked with a blend of cheeses.", category: "Sides", emoji: "🧀", basePriceCents: 369, optionGroups: [sizeGroup([150, 300])] },
    { id: "lemonade", name: "Lemonade", description: "Fresh-squeezed, classic or diet.", category: "Drinks", emoji: "🍋", basePriceCents: 239, optionGroups: [sizeGroup([50, 90])] },
    { id: "sweet-tea", name: "Sweet Tea", description: "Freshly brewed iced tea.", category: "Drinks", emoji: "🥤", basePriceCents: 209, optionGroups: [sizeGroup([40, 80])] },
    { id: "frosted-lemonade", name: "Frosted Lemonade", description: "Lemonade hand-spun with vanilla Icedream.", category: "Treats", emoji: "🍦", basePriceCents: 529, optionGroups: [] },
    { id: "cookie", name: "Chocolate Chunk Cookie", description: "Warm, with semi-sweet chocolate chunks.", category: "Treats", emoji: "🍪", basePriceCents: 159, optionGroups: [] },
  ],
};

// ---------- Swig ----------

const swigSize: OptionGroup = {
  id: "size",
  name: "Size",
  type: "single",
  required: true,
  defaultOptionId: "24oz",
  options: [
    { id: "16oz", name: "16 oz", priceDeltaCents: 0 },
    { id: "24oz", name: "24 oz", priceDeltaCents: 50 },
    { id: "32oz", name: "32 oz", priceDeltaCents: 100 },
    { id: "44oz", name: "44 oz", priceDeltaCents: 150 },
  ],
};

const swigAddIns: OptionGroup = {
  id: "add-ins",
  name: "Add-ins",
  type: "multi",
  required: false,
  max: 3,
  options: [
    { id: "coconut", name: "Coconut", priceDeltaCents: 50 },
    { id: "vanilla", name: "Vanilla", priceDeltaCents: 50 },
    { id: "lime", name: "Fresh lime", priceDeltaCents: 50 },
    { id: "cream", name: "Cream", priceDeltaCents: 50 },
    { id: "peach", name: "Peach", priceDeltaCents: 50 },
    { id: "raspberry", name: "Raspberry", priceDeltaCents: 50 },
    { id: "strawberry", name: "Strawberry purée", priceDeltaCents: 75 },
  ],
};

const swigBase: OptionGroup = {
  id: "base",
  name: "Soda",
  type: "single",
  required: true,
  defaultOptionId: "dr-pepper",
  options: [
    { id: "dr-pepper", name: "Dr Pepper", priceDeltaCents: 0 },
    { id: "diet-dr-pepper", name: "Diet Dr Pepper", priceDeltaCents: 0 },
    { id: "coke", name: "Coke", priceDeltaCents: 0 },
    { id: "diet-coke", name: "Diet Coke", priceDeltaCents: 0 },
    { id: "mountain-dew", name: "Mountain Dew", priceDeltaCents: 0 },
    { id: "sprite", name: "Sprite", priceDeltaCents: 0 },
    { id: "root-beer", name: "Root Beer", priceDeltaCents: 0 },
  ],
};

const swigDip: OptionGroup = {
  id: "dip",
  name: "Dip",
  type: "single",
  required: true,
  defaultOptionId: "cheese",
  options: [
    { id: "cheese", name: "Cheese sauce", priceDeltaCents: 0 },
    { id: "honey-mustard", name: "Honey mustard", priceDeltaCents: 0 },
    { id: "cream-cheese", name: "Sweet cream cheese", priceDeltaCents: 0 },
  ],
};

const swig: Restaurant = {
  id: "swig",
  name: "Swig",
  tagline: "Dirty sodas, cookies & treats",
  emoji: "🥤",
  accent: "#0bb5c9",
  menu: [
    { id: "dirty-dr-pepper", name: "Dirty Dr Pepper", description: "Dr Pepper with coconut and fresh lime.", category: "Signature Sodas", emoji: "🥤", basePriceCents: 279, optionGroups: [swigSize, swigAddIns] },
    { id: "dr-pepper-cream", name: "Dr Pepper & Cream", description: "Dr Pepper with vanilla and cream.", category: "Signature Sodas", emoji: "🥤", basePriceCents: 279, optionGroups: [swigSize, swigAddIns] },
    { id: "coconut-lime-coke", name: "Coconut Lime Coke", description: "Coke with coconut and fresh lime.", category: "Signature Sodas", emoji: "🥥", basePriceCents: 279, optionGroups: [swigSize, swigAddIns] },
    { id: "peaches-cream", name: "Peaches & Cream", description: "Sprite with peach, vanilla and cream.", category: "Signature Sodas", emoji: "🍑", basePriceCents: 279, optionGroups: [swigSize, swigAddIns] },
    { id: "raspberry-dream", name: "Raspberry Dream", description: "Sprite with raspberry and cream.", category: "Signature Sodas", emoji: "🍓", basePriceCents: 279, optionGroups: [swigSize, swigAddIns] },
    { id: "mango-dew", name: "Mango Lime Dew", description: "Mountain Dew with mango and fresh lime.", category: "Signature Sodas", emoji: "🥭", basePriceCents: 279, optionGroups: [swigSize, swigAddIns] },
    { id: "build-your-own", name: "Build Your Own", description: "Pick a soda, a size and up to three add-ins.", category: "Signature Sodas", emoji: "🧪", basePriceCents: 229, optionGroups: [swigBase, swigSize, swigAddIns] },
    { id: "lemonade", name: "Fresh Lemonade", description: "Made fresh daily.", category: "Other Drinks", emoji: "🍋", basePriceCents: 299, optionGroups: [swigSize, swigAddIns] },
    { id: "sugar-cookie", name: "Frosted Sugar Cookie", description: "Soft sugar cookie with pink frosting, served chilled.", category: "Treats", emoji: "🍪", basePriceCents: 249, optionGroups: [] },
    { id: "cookie-4-pack", name: "Sugar Cookie 4-Pack", description: "Four frosted sugar cookies.", category: "Treats", emoji: "📦", basePriceCents: 899, optionGroups: [] },
    { id: "pretzel-bites", name: "Pretzel Bites", description: "Warm, salted, with a dip.", category: "Treats", emoji: "🥨", basePriceCents: 399, optionGroups: [swigDip] },
  ],
};

export const RESTAURANTS: Record<RestaurantId, Restaurant> = {
  "chick-fil-a": chickFilA,
  swig,
};

export const RESTAURANT_LIST: Restaurant[] = [chickFilA, swig];

export function isRestaurantId(id: string): id is RestaurantId {
  return Object.hasOwn(RESTAURANTS, id);
}

export function findMenuItem(restaurantId: RestaurantId, menuItemId: string): MenuItem | undefined {
  return RESTAURANTS[restaurantId].menu.find((m) => m.id === menuItemId);
}
