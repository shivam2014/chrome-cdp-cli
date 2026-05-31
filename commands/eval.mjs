/**
 * Evaluate JavaScript in the first page matching a URL pattern.
 * Result is printed as JSON.
 */
import { findPage } from '../lib/connect.mjs';

export async function evalInPage(cdpUrl, pattern, expression) {
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    const result = await page.evaluate(expression);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    browser.close().catch(() => {});
  }
}
