/**
 * Health check — can we reach Chrome? What pages are open? Circuit state?
 */
import { connect } from '../lib/connect.mjs';
import { loadCircuit } from '../lib/circuit.mjs';

export async function status(cdpUrl) {
  const circuit = loadCircuit();

  try {
    const { browser, pages } = await connect(cdpUrl);
    try {
      const open = pages.filter(p => p.url() !== 'about:blank');
      console.log('Chrome:    reachable');
      console.log(`Circuit:   ${circuit.state} (failures: ${circuit.failCount})`);
      console.log(`Pages:     ${open.length}`);
      for (const p of open) {
        console.log(`  ${p.url()}`);
      }
    } finally {
      browser.close().catch(() => {});
    }
  } catch (err) {
    console.log('Chrome:    UNREACHABLE');
    console.log(`Circuit:   ${circuit.state}`);
    console.log(`Error:     ${err.message}`);
    if (circuit.lastError) console.log(`Last fail: ${circuit.lastError}`);
  }
}
