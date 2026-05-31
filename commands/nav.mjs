/**
 * Navigate the first matching page to a URL.
 */
import { findPage } from '../lib/connect.mjs';

export async function navPage(cdpUrl, pattern, url) {
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log(`Done: ${page.url()}`);
  } finally {
    browser.close().catch(() => {});
  }
}
