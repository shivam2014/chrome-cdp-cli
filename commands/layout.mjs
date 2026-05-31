/**
 * Extract page layout — text-based alternative to screenshots.
 *
 * Two modes:
 *   actionable — Numbered interactive elements as markdown table (default)
 *   tree       — AX tree with roles, names, hierarchy (debugging)
 *
 * CDP: Accessibility.getFullAXTree + getBoundingClientRect
 * No vision model needed.
 */
import { findPage } from '../lib/connect.mjs';

const SKIP_ROLES = new Set(['none', 'generic', 'InlineTextBox']);

/**
 * Extract actionable elements via page.evaluate (fast, single call).
 */
async function getActionableElements(page) {
  return page.evaluate(() => {
    const results = { interactive: [], headings: [], content: [] };
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    for (const el of document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 15 || rect.height < 8) continue;
      if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) continue;

      const tag = el.tagName;
      const role = el.getAttribute('role') || '';
      const ariaLabel = el.getAttribute('aria-label') || '';
      const text = (el.innerText || '').trim().replace(/\n/g, ' ');

      const isInteractive = ['A','BUTTON','INPUT','SELECT','TEXTAREA'].includes(tag) ||
        ['button','link','combobox','textbox','checkbox','radio','tab','menuitem','searchbox','menuitemradio'].includes(role);
      const isHeading = /^H[1-6]$/.test(tag);

      // Include empty inputs/selects (they're still actionable)
      const isEmptyInteractable = isInteractive && ['INPUT','SELECT','TEXTAREA'].includes(tag);
      if (!text && !ariaLabel && !isEmptyInteractable) continue;

      const childTextLen = Array.from(el.children).reduce((s, c) => s + (c.innerText||'').length, 0);
      const isLeaf = childTextLen < text.length * 0.8;

      // For empty inputs, use placeholder or name as label
      const labelText = ariaLabel || text || el.placeholder || el.name || '';

      const item = {
        tag, role: role || tag.toLowerCase(),
        text: labelText.substring(0, 60),
        name: el.name || '',
        id: el.id || '',
        type: el.type || '',
        value: (el.value || '').substring(0, 40),
        x: Math.round(rect.x), y: Math.round(rect.y),
        w: Math.round(rect.width), h: Math.round(rect.height)
      };

      if (isInteractive) results.interactive.push(item);
      else if (isHeading) results.headings.push(item);
      else if (isLeaf && text.length < 80) results.content.push(item);
    }

    // Sort each by Y then X
    for (const arr of Object.values(results)) {
      arr.sort((a, b) => a.y - b.y || a.x - b.x);
    }

    return results;
  });
}

/**
 * Render actionable elements as markdown table.
 */
function renderActionable(data, pageTitle, pageUrl) {
  console.log(`# ${pageTitle}`);
  console.log(`URL: ${pageUrl}\n`);

  // Interactive elements
  console.log('## Actionable Elements\n');
  console.log('| # | Type | Label | Value | Selector | Position |');
  console.log('|---|------|-------|-------|----------|----------|');
  let idx = 1;
  for (const el of data.interactive) {
    const label = el.text.substring(0, 30);
    const value = el.value ? el.value.substring(0, 20) : '';
    const selector = el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : '';
    console.log(`| ${idx} | ${el.role} | ${label} | ${value} | ${selector} | ${el.x},${el.y} |`);
    idx++;
  }

  // Headings
  if (data.headings.length) {
    console.log('\n## Headings\n');
    for (const el of data.headings) {
      console.log(`- [${el.tag}] ${el.text.substring(0, 60)}`);
    }
  }

  // Content summary (grouped by rows)
  if (data.content.length) {
    console.log(`\n## Content (${data.content.length} blocks)\n`);
    const rows = [];
    let row = [];
    let lastY = -100;
    for (const el of data.content) {
      if (el.y - lastY > 25 && row.length > 0) { rows.push(row); row = []; }
      row.push(el);
      lastY = el.y;
    }
    if (row.length > 0) rows.push(row);

    for (const r of rows.slice(0, 20)) {
      r.sort((a, b) => a.x - b.x);
      console.log(r.map(e => e.text.substring(0, 30)).join(' | '));
    }
  }
}

/**
 * Render AX tree (original mode).
 */
function renderTree(nodes, maxDepth) {
  const byId = {};
  for (const n of nodes) byId[n.nodeId] = n;

  function isInteresting(n) {
    if (n.ignored) return false;
    return !SKIP_ROLES.has(n.role?.value);
  }

  function nodeText(n) {
    const role = n.role?.value || '?';
    const name = n.name?.value || '';
    const value = n.properties?.find(p => p.name === 'value')?.value?.value || '';
    const level = n.properties?.find(p => p.name === 'level')?.value?.value;
    const focused = n.properties?.find(p => p.name === 'focused')?.value?.value;

    let label = `[${role}]`;
    if (level) label = `[h${level}]`;
    if (name) label += ` "${name.substring(0, 80)}"`;
    if (value) label += ` value="${value.substring(0, 60)}"`;
    if (focused) label += ' *focused*';
    return label;
  }

  const seen = new Set();
  function render(nodeId, depth, lines) {
    if (depth > maxDepth) return;
    if (seen.has(nodeId)) return;
    seen.add(nodeId);

    const n = byId[nodeId];
    if (!n) return;

    if (isInteresting(n)) {
      const indent = '  '.repeat(depth);
      lines.push(`${indent}${nodeText(n)}`);
    }

    for (const cid of (n.childIds || [])) {
      render(cid, isInteresting(n) ? depth + 1 : depth, lines);
    }
  }

  const root = nodes.find(n => n.role?.value === 'RootWebArea');
  if (!root) { console.log('No root node found'); return; }

  const pageTitle = root.name?.value || '';
  const pageUrl = root.properties?.find(p => p.name === 'url')?.value?.value || '';
  console.log(`Page: ${pageTitle}`);
  console.log(`URL:  ${pageUrl}`);
  console.log(`AX nodes: ${nodes.length} (depth ≤ ${maxDepth})\n`);

  const lines = [];
  render(root.nodeId, 0, lines);

  let prev = '';
  for (const line of lines) {
    if (line !== prev) { console.log(line); prev = line; }
  }

  const roles = {};
  for (const n of nodes) {
    if (n.ignored) continue;
    roles[n.role?.value || 'unknown'] = (roles[n.role?.value || 'unknown'] || 0) + 1;
  }
  const top = Object.entries(roles)
    .filter(([r]) => !SKIP_ROLES.has(r))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([r, c]) => `${r}:${c}`)
    .join(', ');
  console.log(`\nSummary: ${top}`);
}

/**
 * @param {string} cdpUrl
 * @param {string} pattern - URL pattern
 * @param {string} mode - 'actionable' | 'tree'
 * @param {number} maxDepth - Max tree depth for tree mode
 */
export async function layout(cdpUrl, pattern, mode = 'actionable', maxDepth = 4) {
  const { browser, ctx, page } = await findPage(cdpUrl, pattern);

  try {
    const pageTitle = await page.title();
    const pageUrl = page.url();

    if (mode === 'tree') {
      const cdp = await ctx.newCDPSession(page);
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');
      await cdp.detach();
      renderTree(nodes, maxDepth);
    } else {
      const data = await getActionableElements(page);
      renderActionable(data, pageTitle, pageUrl);
    }
  } finally {
    browser.close().catch(() => {});
  }
}
