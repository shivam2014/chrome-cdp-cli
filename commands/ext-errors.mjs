/**
 * Read or clear extension errors from chrome://extensions.
 *
 * Shadow DOM path:
 *   extensions-manager → extensions-error-page → #errorsList → .error-item
 *     ├── .error-message
 *     ├── cr-collapse
 *     │   ├── .context-url
 *     │   ├── .stack-trace-container → li
 *     │   └── extensions-code-section (shadow) → pre/code
 *     └── cr-icon-button (delete)
 *
 * Clear all: extensions-error-page → #heading → cr-button ("Clear all")
 */
import { connect } from '../lib/connect.mjs';

/**
 * Find extension ID by name from chrome://extensions.
 */
async function findExtId(page, name) {
  const nameLower = name.toLowerCase();
  return page.evaluate((nameLower) => {
    const manager = document.querySelector('extensions-manager');
    if (!manager) return null;
    const list = manager.shadowRoot?.querySelector('extensions-item-list');
    if (!list) return null;
    const cards = list.shadowRoot?.querySelectorAll('extensions-item');
    if (!cards) return null;

    for (const card of cards) {
      const sr = card.shadowRoot;
      const cardName = sr.querySelector('#name')?.textContent?.trim() || '';
      if (cardName.toLowerCase().includes(nameLower)) {
        const idText = sr.querySelector('#extension-id')?.textContent?.trim() || '';
        return idText.replace('ID: ', '');
      }
    }
    return null;
  }, nameLower);
}

/**
 * Read errors from the error detail page.
 */
async function readErrors(page) {
  return page.evaluate(() => {
    const manager = document.querySelector('extensions-manager');
    if (!manager) return { error: 'extensions-manager not found' };

    const errorPage = manager.shadowRoot?.querySelector('extensions-error-page');
    if (!errorPage) return { error: 'no error page (extension has no errors?)' };

    const sr = errorPage.shadowRoot;
    if (!sr) return { error: 'no error page shadow root' };

    const items = sr.querySelectorAll('.error-item');
    if (!items.length) return { count: 0, errors: [] };

    const errors = [];
    for (const item of items) {
      const message = item.querySelector('.error-message')?.textContent?.trim() || '';

      // Context URL
      const contextUrl = item.querySelector('.context-url')?.textContent?.trim() || '';

      // Stack trace
      const stackLi = item.querySelector('.stack-trace-container li');
      const stackFile = stackLi?.textContent?.trim() || '';

      // Code snippet from extensions-code-section
      const codeSection = item.querySelector('extensions-code-section');
      let code = '';
      if (codeSection?.shadowRoot) {
        const pre = codeSection.shadowRoot.querySelector('pre, code');
        code = pre?.textContent?.trim() || '';
        // Clean up: take only the relevant lines (around the error)
        const lines = code.split('\n').filter(l => l.trim());
        // Find the throw line and take ±3 lines
        const throwIdx = lines.findIndex(l => l.includes('throw') || l.includes('Error'));
        if (throwIdx >= 0) {
          const start = Math.max(0, throwIdx - 2);
          const end = Math.min(lines.length, throwIdx + 4);
          code = lines.slice(start, end).join('\n');
        }
      }

      errors.push({ message, contextUrl, stackFile, code });
    }

    return { count: errors.length, errors };
  });
}

/**
 * Clear all errors.
 */
async function clearErrors(page) {
  return page.evaluate(() => {
    const manager = document.querySelector('extensions-manager');
    const errorPage = manager?.shadowRoot?.querySelector('extensions-error-page');
    if (!errorPage) return { ok: false, reason: 'no error page' };

    const sr = errorPage.shadowRoot;
    // Find "Clear all" button in the heading area
    const heading = sr.querySelector('#heading');
    const btn = heading?.querySelector('cr-button');
    if (!btn) return { ok: false, reason: 'clear button not found' };

    btn.click();
    return { ok: true };
  });
}

/**
 * @param {string} cdpUrl
 * @param {string} extName - Extension name
 * @param {object} opts
 * @param {boolean} opts.clear - Clear errors after reading
 */
export async function extErrors(cdpUrl, extName, opts = {}) {
  const { browser, ctx } = await connect(cdpUrl);

  try {
    // 1. Open extensions page and ensure dev mode is on
    const listPage = await ctx.newPage();
    await listPage.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
    await listPage.waitForTimeout(2000);

    const devModeOn = await listPage.evaluate(() => {
      const manager = document.querySelector('extensions-manager');
      const toolbar = manager?.shadowRoot?.querySelector('extensions-toolbar');
      const toggle = toolbar?.shadowRoot?.querySelector('#devMode');
      if (!toggle) return false;
      if (!toggle.checked) { toggle.click(); }
      return true;
    });

    if (!devModeOn) {
      await listPage.close();
      throw new Error('Could not enable developer mode — toggle not found');
    }

    // Wait for UI to update after enabling dev mode
    await listPage.waitForTimeout(1000);

    // 2. Find extension ID
    const extId = await findExtId(listPage, extName);
    if (!extId) {
      await listPage.close();
      throw new Error(`Extension "${extName}" not found`);
    }

    // 3. Navigate to error detail page
    await listPage.goto(`chrome://extensions/?errors=${extId}`, { waitUntil: 'domcontentloaded' });
    await listPage.waitForTimeout(3000);

    // 4. Read errors
    const result = await readErrors(listPage);

    if (result.error) {
      await listPage.close();
      // No error page = no errors (not an error condition)
      if (result.error.includes('no error page')) {
        console.log('No extension errors.');
        return;
      }
      throw new Error(result.error);
    }

    if (result.count === 0) {
      console.log('No extension errors.');
      await listPage.close();
      return;
    }

    // 5. Print errors
    console.log(`${result.count} extension error(s):\n`);
    for (let i = 0; i < result.errors.length; i++) {
      const e = result.errors[i];
      console.log(`--- Error ${i + 1} ---`);
      console.log(e.message);
      if (e.contextUrl) console.log(`Context: ${e.contextUrl}`);
      if (e.stackFile) console.log(`Stack: ${e.stackFile}`);
      if (e.code) console.log(`Code:\n${e.code}`);
      console.log('');
    }

    // 6. Optionally clear
    if (opts.clear) {
      const cleared = await clearErrors(listPage);
      if (cleared.ok) {
        console.log(`Cleared ${result.count} error(s).`);
      } else {
        console.error(`Clear failed: ${cleared.reason}`);
      }
    }

    await listPage.close();
  } finally {
    browser.close().catch(() => {});
  }
}
