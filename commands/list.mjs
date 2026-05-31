/**
 * List all open Chrome targets (pages, extension background scripts, workers).
 */
import { connect } from '../lib/connect.mjs';

export async function listTargets(cdpUrl) {
  const { browser, pages } = await connect(cdpUrl);
  try {
    console.log(`Open pages (${pages.length}):`);
    for (const p of pages) {
      const url = p.url();
      if (url === 'about:blank') continue;
      console.log(`  ${url}`);
    }
  } finally {
    browser.close().catch(() => {});
  }
}
