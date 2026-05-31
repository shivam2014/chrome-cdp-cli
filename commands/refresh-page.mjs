/**
 * Refresh the first page whose URL matches a pattern.
 */
import { findPage } from '../lib/connect.mjs';

export async function refreshPage(cdpUrl, pattern) {
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    console.log(`Refreshing: ${page.url().substring(0, 80)}`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    console.log('Done.');
  } finally {
    browser.close().catch(() => {});
  }
}
