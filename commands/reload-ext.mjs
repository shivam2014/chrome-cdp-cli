/**
 * Reload a Chrome extension by name via chrome://extensions shadow DOM.
 * Optionally refresh a matching page afterward (required for content script re-injection).
 */
import { connect } from '../lib/connect.mjs';
import { checkCircuit, recordFailure, recordSuccess } from '../lib/circuit.mjs';

/**
 * @param {string} cdpUrl
 * @param {string} extName - Extension name to match (case-insensitive substring)
 * @param {object} opts
 * @param {boolean} opts.refreshPage - Also refresh a page matching pagePattern
 * @param {string} opts.pagePattern - URL substring to find page to refresh
 */
export async function reloadExt(cdpUrl, extName, opts = {}) {
  // Circuit check
  const { ok, cb } = checkCircuit();
  if (!ok) {
    const remaining = Math.max(0, Math.ceil((15_000 - (Date.now() - cb.lastFailure)) / 1000));
    throw new Error(`Circuit OPEN. Wait ${remaining}s or restart Chrome.`);
  }

  const { browser, ctx } = await connect(cdpUrl);

  try {
    // 1. Open chrome://extensions in a temp tab
    const extPage = await ctx.newPage();
    await extPage.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
    await extPage.waitForTimeout(2000);

    // 2. Drill shadow DOM to find and click reload button
    const nameLower = extName.toLowerCase();
    const result = await extPage.evaluate((nameLower) => {
      const manager = document.querySelector('extensions-manager');
      if (!manager) return { error: 'extensions-manager not found' };

      const itemList = manager.shadowRoot?.querySelector('extensions-item-list');
      if (!itemList) return { error: 'extensions-item-list not found' };

      const cards = itemList.shadowRoot?.querySelectorAll('extensions-item');
      if (!cards?.length) return { error: 'no extension cards' };

      for (const card of cards) {
        const name = card.shadowRoot?.querySelector('#name')?.textContent?.trim() || '';
        if (name.toLowerCase().includes(nameLower)) {
          const btn = card.shadowRoot?.querySelector('#dev-reload-button');
          if (!btn) return { error: 'reload button not found', name };
          btn.click();
          return { ok: true, name };
        }
      }
      return {
        error: `Extension "${extName}" not found`,
        available: Array.from(cards).map(c => c.shadowRoot?.querySelector('#name')?.textContent?.trim())
      };
    }, nameLower);

    await extPage.waitForTimeout(1500);
    await extPage.close();

    if (result.error) {
      recordFailure(cb, result.error);
      const hint = result.available ? `\n  Available: ${result.available.join(', ')}` : '';
      throw new Error(`${result.error}${hint}`);
    }

    console.log(`Extension reloaded: "${result.name}"`);
    recordSuccess(cb);

    // 3. Optionally refresh a matching page
    if (opts.refreshPage && opts.pagePattern) {
      const page = ctx.pages().find(p => p.url().includes(opts.pagePattern));
      if (page) {
        console.log(`Refreshing page: ${page.url().substring(0, 80)}...`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(6000); // wait for content script injection
        console.log('Page refreshed.');
      } else {
        console.log(`No page matching "${opts.pagePattern}" — skipping refresh.`);
      }
    }

    console.log('Done.');
  } finally {
    browser.close().catch(() => {});
  }
}
