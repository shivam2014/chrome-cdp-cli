/**
 * Toggle or query Chrome extension developer mode.
 * Shadow DOM path: extensions-manager → extensions-toolbar → #devMode (CR-TOGGLE)
 */
import { connect } from '../lib/connect.mjs';

/**
 * @param {string} cdpUrl
 * @param {'on'|'off'|'status'} action
 */
export async function devMode(cdpUrl, action) {
  const { browser, ctx } = await connect(cdpUrl);

  try {
    // Open chrome://extensions
    const page = await ctx.newPage();
    await page.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const result = await page.evaluate((action) => {
      const manager = document.querySelector('extensions-manager');
      if (!manager) return { error: 'extensions-manager not found' };

      const toolbar = manager.shadowRoot?.querySelector('extensions-toolbar');
      if (!toolbar) return { error: 'extensions-toolbar not found' };

      const toggle = toolbar.shadowRoot?.querySelector('#devMode');
      if (!toggle) return { error: '#devMode toggle not found' };

      const current = toggle.checked;

      if (action === 'status') {
        return { devMode: current };
      }

      const wantOn = action === 'on';
      if (current === wantOn) {
        return { devMode: current, changed: false, message: `Already ${current ? 'on' : 'off'}` };
      }

      // Click the toggle
      toggle.click();
      return { devMode: wantOn, changed: true, message: `Developer mode ${wantOn ? 'enabled' : 'disabled'}` };
    }, action);

    await page.waitForTimeout(1000);
    await page.close();

    if (result.error) throw new Error(result.error);

    if (action === 'status') {
      console.log(`Developer mode: ${result.devMode ? 'ON' : 'OFF'}`);
    } else {
      console.log(result.message);
    }
  } finally {
    browser.close().catch(() => {});
  }
}
