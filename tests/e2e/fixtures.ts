import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";

type ConsoleEntry = { type: string; text: string; url: string };

/**
 * Every test fails if the browser logs a console error or warning,
 * or if the page throws an uncaught exception.
 * expectedNotFound lists paths a test deliberately opens as a 404: the browser's own
 * "Failed to load resource" line for that page itself is expected, and nothing else is let through.
 */
export const test = base.extend<{ consoleGuard: ConsoleEntry[]; expectedNotFound: string[] }>({
  expectedNotFound: [[], { option: true }],
  consoleGuard: [
    async ({ page, expectedNotFound }, use) => {
      const entries: ConsoleEntry[] = [];
      const isExpected404 = (text: string, url: string) =>
        text === "Failed to load resource: the server responded with a status of 404 (Not Found)" &&
        expectedNotFound.some((path) => new URL(url).pathname === path);
      page.on("console", (msg) => {
        if ((msg.type() === "error" || msg.type() === "warning") && !isExpected404(msg.text(), msg.location().url)) {
          entries.push({ type: msg.type(), text: msg.text(), url: msg.location().url });
        }
      });
      page.on("pageerror", (error) => {
        entries.push({ type: "pageerror", text: error.message, url: page.url() });
      });
      await use(entries);
      expect(entries, `Browser console must stay clean:\n${JSON.stringify(entries, null, 2)}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Runs axe and fails on any serious or critical accessibility issue. */
export async function expectNoSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
}
