/**
 * Screenshot the first page matching a URL pattern.
 */
import { findPage } from '../lib/connect.mjs';

export async function takeScreenshot(cdpUrl, pattern, outputPath) {
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    await page.screenshot({ path: outputPath, fullPage: true });
    console.log(`Saved: ${outputPath}`);
  } finally {
    browser.close().catch(() => {});
  }
}
