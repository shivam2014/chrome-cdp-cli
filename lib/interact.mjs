/**
 * Interaction engine — fill, clear, click, check, verify, type, options, hover, fill-many.
 *
 * Loads page-scripts.js into the page context, then calls the functions.
 * Element resolution + action + verification happen in a single evaluate.
 *
 * Structured result: { ok, actual, strategy, error, message, duration }
 */
import { findPage } from './connect.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_SCRIPTS = readFileSync(join(__dirname, 'page-scripts.js'), 'utf-8');

function waitResolveScript(target, waitMs) {
  if (!waitMs) return `resolveElement(${JSON.stringify(target)})`;
  return `
    (() => {
      const deadline = Date.now() + ${waitMs};
      let el = null;
      while (Date.now() < deadline) {
        el = resolveElement(${JSON.stringify(target)});
        if (el) break;
        const start = Date.now();
        while (Date.now() - start < 200) {}
      }
      return el;
    })()
  `;
}

// ── Single field operations ─────────────────────────────────────────

export async function fill(cdpUrl, pattern, target, value, waitMs = 0) {
  const t0 = Date.now();
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    const resolveExpr = waitResolveScript(target, waitMs);
    const result = await page.evaluate(`
      ${PAGE_SCRIPTS}
      (() => {
        const el = ${resolveExpr};
        if (!el) return { ok: false, actual: null, error: 'element_not_found', message: 'Element ${target} not found${waitMs ? ' (waited ' + waitMs + 'ms)' : ''}' };
        if (el.type === 'file') return { ok: false, actual: null, error: 'unsupported', message: 'File inputs cannot be filled' };
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = !el.checked;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, actual: el.checked, strategy: 'checkbox-toggle', message: 'Checked: ' + el.checked };
        }
        if (el.tagName === 'SELECT') return fillSelect(el, ${JSON.stringify(value)});
        return fillText(el, ${JSON.stringify(value)});
      })()
    `);
    result.duration = Date.now() - t0;
    console.log(JSON.stringify(result, null, 2));
  } finally {
    browser.close().catch(() => {});
  }
}

export async function clear(cdpUrl, pattern, target) {
  const t0 = Date.now();
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    const result = await page.evaluate(`
      ${PAGE_SCRIPTS}
      (() => {
        const el = resolveElement(${JSON.stringify(target)});
        if (!el) return { ok: false, actual: null, error: 'element_not_found', message: 'Element not found' };
        try {
          el.focus(); el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
          return { ok: true, actual: el.value, strategy: 'clear', message: 'Cleared' };
        } catch(e) { return { ok: false, actual: null, error: 'clear_failed', message: e.message }; }
      })()
    `);
    result.duration = Date.now() - t0;
    console.log(JSON.stringify(result, null, 2));
  } finally {
    browser.close().catch(() => {});
  }
}

export async function click(cdpUrl, pattern, target, waitMs = 0) {
  const t0 = Date.now();
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    const resolveExpr = waitResolveScript(target, waitMs);
    const result = await page.evaluate(`
      ${PAGE_SCRIPTS}
      (() => {
        const el = ${resolveExpr};
        if (!el) return { ok: false, actual: null, error: 'element_not_found', message: 'Element ${target} not found${waitMs ? ' (waited ' + waitMs + 'ms)' : ''}' };
        return clickEl(el);
      })()
    `);
    result.duration = Date.now() - t0;
    console.log(JSON.stringify(result, null, 2));
  } finally {
    browser.close().catch(() => {});
  }
}

export async function check(cdpUrl, pattern, target, state) {
  const t0 = Date.now();
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    const stateExpr = state === undefined ? '!el.checked' : JSON.stringify(Boolean(state));
    const result = await page.evaluate(`
      ${PAGE_SCRIPTS}
      (() => {
        const el = resolveElement(${JSON.stringify(target)});
        if (!el) return { ok: false, actual: null, error: 'element_not_found', message: 'Element not found' };
        el.checked = ${stateExpr};
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, actual: el.checked, strategy: 'checkbox-toggle', message: 'Checked: ' + el.checked };
      })()
    `);
    result.duration = Date.now() - t0;
    console.log(JSON.stringify(result, null, 2));
  } finally {
    browser.close().catch(() => {});
  }
}

export async function verify(cdpUrl, pattern, target, expected) {
  const t0 = Date.now();
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    const expExpr = expected === undefined ? 'undefined' : JSON.stringify(expected);
    const result = await page.evaluate(`
      ${PAGE_SCRIPTS}
      (() => {
        const el = resolveElement(${JSON.stringify(target)});
        if (!el) return { ok: false, actual: null, error: 'element_not_found', message: 'Element not found' };
        const actual = el.value || el.textContent?.trim() || '';
        const exp = ${expExpr};
        if (exp === undefined) return { ok: true, actual, message: 'Value: ' + actual };
        const match = actual === exp || actual.toLowerCase() === exp.toLowerCase();
        return { ok: match, actual, message: match ? 'Matches' : 'Expected: ' + exp + ', Actual: ' + actual };
      })()
    `);
    result.duration = Date.now() - t0;
    console.log(JSON.stringify(result, null, 2));
  } finally {
    browser.close().catch(() => {});
  }
}

export async function type(cdpUrl, pattern, target, text) {
  const t0 = Date.now();
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    const result = await page.evaluate(`
      ${PAGE_SCRIPTS}
      (() => {
        const el = resolveElement(${JSON.stringify(target)});
        if (!el) return { ok: false, actual: null, error: 'element_not_found', message: 'Element not found' };
        try {
          el.focus();
          const text = ${JSON.stringify(text)};
          for (let i = 0; i < text.length; i++) {
            const c = text[i];
            el.dispatchEvent(new KeyboardEvent('keydown', { key: c, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keypress', { key: c, bubbles: true }));
            el.value = el.value + c;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: c, bubbles: true }));
          }
          return { ok: true, actual: el.value, strategy: 'keyboard', message: 'Typed ' + text.length + ' chars' };
        } catch(e) { return { ok: false, actual: null, error: 'type_failed', message: e.message }; }
      })()
    `);
    result.duration = Date.now() - t0;
    console.log(JSON.stringify(result, null, 2));
  } finally {
    browser.close().catch(() => {});
  }
}

export async function options(cdpUrl, pattern, target) {
  const t0 = Date.now();
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    const result = await page.evaluate(`
      ${PAGE_SCRIPTS}
      getOptions(resolveElement(${JSON.stringify(target)}))
    `);
    result.duration = Date.now() - t0;
    console.log(JSON.stringify(result, null, 2));
  } finally {
    browser.close().catch(() => {});
  }
}

export async function hover(cdpUrl, pattern, target) {
  const t0 = Date.now();
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    const result = await page.evaluate(`
      ${PAGE_SCRIPTS}
      hoverEl(resolveElement(${JSON.stringify(target)}))
    `);
    result.duration = Date.now() - t0;
    console.log(JSON.stringify(result, null, 2));
  } finally {
    browser.close().catch(() => {});
  }
}

// ── Bulk operations ─────────────────────────────────────────────────

/**
 * Fill multiple fields in one connection.
 * @param {string} cdpUrl
 * @param {string} pattern - URL pattern
 * @param {Object} fields - { target: value, ... } where target is index or selector
 * @param {number} waitMs - wait per element
 */
export async function fillMany(cdpUrl, pattern, fields, waitMs = 0) {
  const t0 = Date.now();
  const { browser, page } = await findPage(cdpUrl, pattern);
  try {
    const results = [];
    for (const [target, value] of Object.entries(fields)) {
      const et0 = Date.now();
      const resolveExpr = waitResolveScript(target, waitMs);
      const result = await page.evaluate(`
        ${PAGE_SCRIPTS}
        (() => {
          const el = ${resolveExpr};
          if (!el) return { ok: false, actual: null, error: 'element_not_found', message: 'Element ${target} not found' };
          if (el.type === 'file') return { ok: false, actual: null, error: 'unsupported', message: 'File inputs cannot be filled' };
          if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = !el.checked;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true, actual: el.checked, strategy: 'checkbox-toggle', message: 'Checked: ' + el.checked };
          }
          if (el.tagName === 'SELECT') return fillSelect(el, ${JSON.stringify(value)});
          return fillText(el, ${JSON.stringify(value)});
        })()
      `);
      result.duration = Date.now() - et0;
      result.target = target;
      results.push(result);
    }

    const summary = {
      ok: results.every(r => r.ok),
      filled: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      total: results.length,
      duration: Date.now() - t0,
      results
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    browser.close().catch(() => {});
  }
}
