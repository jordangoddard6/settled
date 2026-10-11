// End-to-end: two separate browsers (separate storage = separate people) share one live cart.
import { expect, test, type Page } from "@playwright/test";

async function startOrder(page: Page, name: string, restaurant: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: new RegExp(restaurant) }).click();
  await expect(page).toHaveURL(/\/c\/[A-Z2-9]{6}$/);
  return page.url().split("/c/")[1]!;
}

async function joinByCode(page: Page, code: string, name: string) {
  await page.goto("/");
  await page.getByLabel("Have a code? Enter it here").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${code}$`));
  await page.getByRole("textbox", { name: "Your name" }).fill(name);
  await page.getByRole("button", { name: "Join" }).click();
}

const cart = (page: Page) => page.locator("aside");
const person = (page: Page, heading: RegExp) => cart(page).locator("section").filter({ hasText: heading });

test("two people see each other's items live in one shared cart", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  const code = await startOrder(host, "Jordan", "Chick-fil-A");
  await joinByCode(guest, code, "Alex");

  // The host sees the guest join, live.
  await expect(host.getByRole("list", { name: "People in this order" })).toContainText("Alex");

  // Guest adds → host sees it under Alex's items.
  await guest.getByRole("button", { name: "Add Lemonade" }).click();
  await expect(person(host, /Alex's items/)).toContainText("Lemonade");

  // Host adds → guest sees it under Jordan's items.
  await host.getByRole("button", { name: "Add Nuggets" }).click();
  await expect(person(guest, /Jordan's items/)).toContainText("Nuggets");

  // Both screens agree on the total.
  const total = (page: Page) =>
    cart(page)
      .locator("dl div")
      .filter({ has: page.locator("dt", { hasText: /^Total$/ }) })
      .locator("dd");
  await expect(total(host)).toHaveText(await total(guest).innerText());
  await expect(total(host)).not.toHaveText("$0.00");

  // The host removes the guest's item; it disappears for the guest too.
  await person(host, /Alex's items/)
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(cart(guest)).not.toContainText("Lemonade");

  await hostContext.close();
  await guestContext.close();
});

test("only the host can check out", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  const code = await startOrder(host, "Jordan", "Swig");
  await joinByCode(guest, code, "Sam");

  await guest.getByRole("button", { name: "Add Frosted Sugar Cookie" }).click();
  await expect(host.getByRole("button", { name: /Check out/ })).toBeEnabled();
  await expect(guest.getByRole("button", { name: /Check out/ })).toHaveCount(0);
  await expect(cart(guest)).toContainText("Jordan will pay for the whole order");

  await hostContext.close();
  await guestContext.close();
});
