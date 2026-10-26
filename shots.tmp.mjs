import { chromium } from "playwright";

const B = "http://localhost:3130",
  OUT = "/tmp/arkham-shots";
const b = await chromium.launch();
const DESK = { viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
async function page(opts) {
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage();
  await p.goto(B);
  return p;
}
async function ask(p, q) {
  for (let i = 0; i < 3; i++) {
    await p.getByRole("textbox").fill(q);
    await p.keyboard.press("Enter");
    try {
      await p.getByText("This is the local stand-in").waitFor({ timeout: 150000 });
      if (!(await p.getByText("Couldn't").count())) return;
    } catch {}
    await p.goto(B);
  }
}
const open = async (p, text) => {
  await p.getByText(text).first().click();
  await p.waitForTimeout(700);
};
for (const [n, o] of [
  ["desktop", DESK],
  ["phone", PHONE],
]) {
  const p = await page(o);
  await ask(p, "I have 5 XP for https://arkhamdb.com/decklist/view/33170. What should I buy?");
  await open(p, "Spending 5 XP");
  await p.screenshot({ path: `${OUT}/10-upgrades-${n}.png` });
  await p.context().close();
}
for (const [n, o] of [
  ["desktop", DESK],
  ["phone", PHONE],
]) {
  const p = await page(o);
  await ask(p, "How should we prepare for The Path to Carcosa?");
  await open(p, "What The Path to Carcosa asks");
  await p.screenshot({ path: `${OUT}/11-campaign-prep-${n}.png` });
  await p.context().close();
}
{
  const p = await page(DESK);
  await ask(p, "What does Brand of Cthugha do?");
  await open(p, "2 versions");
  await p.screenshot({ path: `${OUT}/12-multiclass-dot-desktop.png` });
  await p.context().close();
}
await b.close();
