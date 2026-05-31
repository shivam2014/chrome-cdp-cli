/**
 * Shared Playwright CDP connector.
 * Connects to running Chrome and returns browser + contexts + pages.
 * IMPORTANT: caller must close browser when done, or use findPage() which auto-closes.
 */
import { chromium } from 'playwright';

/**
 * Connect to Chrome via CDP.
 * @param {string} cdpUrl - e.g. 'http://127.0.0.1:9222'
 * @returns {{ browser, ctx, pages }}
 */
export async function connect(cdpUrl) {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error('No browser context found');
  const pages = ctx.pages();
  return { browser, ctx, pages };
}

/**
 * Find first page whose URL matches a pattern.
 * Caller gets { browser, ctx, page } — must call browser.close() when done.
 * @param {string} cdpUrl
 * @param {string} pattern - substring to match against page URL
 * @returns {{ browser, ctx, page }}
 */
export async function findPage(cdpUrl, pattern) {
  const { browser, ctx, pages } = await connect(cdpUrl);
  const page = pages.find(p => p.url().includes(pattern));
  if (!page) {
    const urls = pages.map(p => p.url()).filter(u => u !== 'about:blank');
    browser.close().catch(() => {});
    throw new Error(
      `No page matching "${pattern}". Open pages:\n` +
      (urls.length ? urls.map(u => `  ${u}`).join('\n') : '  (none)')
    );
  }
  return { browser, ctx, page };
}
