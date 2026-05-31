#!/usr/bin/env node
/**
 * cdc — Chrome DevTools CLI
 *
 * Project-agnostic tool for monitoring Chrome extensions and pages during development.
 * Connects to Chrome via CDP (port 9222 by default).
 */

import { listTargets } from '../commands/list.mjs';
import { reloadExt } from '../commands/reload-ext.mjs';
import { refreshPage } from '../commands/refresh-page.mjs';
import { evalInPage } from '../commands/eval.mjs';
import { takeScreenshot } from '../commands/screenshot.mjs';
import { status } from '../commands/status.mjs';
import { navPage } from '../commands/nav.mjs';
import { devMode } from '../commands/dev-mode.mjs';
import { extErrors } from '../commands/ext-errors.mjs';
import { layout } from '../commands/layout.mjs';
import { fill, clear, click, check, verify, type, options, hover, fillMany } from '../lib/interact.mjs';
import { readFileSync } from 'fs';

const [,, cmd, ...rawArgs] = process.argv;

// Parse --wait flag from args
function parseWait(args) {
  const waitIdx = args.indexOf('--wait');
  if (waitIdx === -1) return { args, waitMs: 0 };
  const waitMs = parseInt(args[waitIdx + 1]) || 5000;
  const filtered = args.filter((_, i) => i !== waitIdx && i !== waitIdx + 1);
  return { args: filtered, waitMs };
}

const PORT = process.env.CDC_PORT || '9222';
const CDP_URL = `http://127.0.0.1:${PORT}`;

const help = `
cdc — Chrome DevTools CLI (connects to :${PORT})

Commands:
  list                              List all open targets
  status                            Health check + circuit state
  reload-ext <name>                 Reload extension by name
  refresh-page <url-pattern>        Refresh first page matching pattern
  reload-ext+page <ext> <pattern>   Reload ext then refresh page
  eval <url-pattern> <js-expr>      Evaluate JS in matching page
  screenshot <url-pattern> [path]   Screenshot matching page
  nav <url-pattern> <url>           Navigate matching page
  dev-mode [on|off|status]          Toggle/query Chrome developer mode
  ext-errors <name> [--clear]       Read (and optionally clear) extension errors
  layout <url-pattern> [mode]    Page layout: actionable (default) or tree

Interaction (index or selector):
  fill <pattern> <target> <val>  Auto-detect + fill field
  fill-many <pattern> <json>     Fill multiple fields (one connection)
  clear <pattern> <target>       Clear a field
  click <pattern> <target>       Click element (real mouse events)
  check <pattern> <target> [on]  Toggle checkbox
  verify <pattern> <target> [v]  Check field value
  type <pattern> <target> <txt>  Keyboard simulation
  options <pattern> <target>     List dropdown/combobox options
  hover <pattern> <target>       Hover over an element

Flags:
  --wait <ms>   Wait for element to appear (fill, click)

Options:
  CDC_PORT    CDP port (default: 9222)
`.trim();

async function main() {
  const { args, waitMs } = parseWait(rawArgs);
  try {
    switch (cmd) {
      case 'list':
        await listTargets(CDP_URL);
        break;

      case 'status':
        await status(CDP_URL);
        break;

      case 'reload-ext':
        if (!args[0]) { console.error('Usage: cdc reload-ext <extension-name>'); process.exit(1); }
        await reloadExt(CDP_URL, args[0], { refreshPage: false });
        break;

      case 'refresh-page':
        if (!args[0]) { console.error('Usage: cdc refresh-page <url-pattern>'); process.exit(1); }
        await refreshPage(CDP_URL, args[0]);
        break;

      case 'reload-ext+page':
        if (args.length < 2) { console.error('Usage: cdc reload-ext+page <ext-name> <url-pattern>'); process.exit(1); }
        await reloadExt(CDP_URL, args[0], { refreshPage: true, pagePattern: args[1] });
        break;

      case 'eval':
        if (args.length < 2) { console.error('Usage: cdc eval <url-pattern> <js-expr>'); process.exit(1); }
        await evalInPage(CDP_URL, args[0], args.slice(1).join(' '));
        break;

      case 'screenshot':
        if (!args[0]) { console.error('Usage: cdc screenshot <url-pattern> [output.png]'); process.exit(1); }
        await takeScreenshot(CDP_URL, args[0], args[1] || 'screenshot.png');
        break;

      case 'nav':
        if (args.length < 2) { console.error('Usage: cdc nav <url-pattern> <url>'); process.exit(1); }
        await navPage(CDP_URL, args[0], args[1]);
        break;

      case 'dev-mode': {
        const action = args[0] || 'status';
        if (!['on', 'off', 'status'].includes(action)) {
          console.error('Usage: cdc dev-mode [on|off|status]');
          process.exit(1);
        }
        await devMode(CDP_URL, action);
        break;
      }

      case 'ext-errors':
        if (!args[0]) { console.error('Usage: cdc ext-errors <extension-name> [--clear]'); process.exit(1); }
        await extErrors(CDP_URL, args[0], { clear: args.includes('--clear') });
        break;

      case 'layout':
        if (!args[0]) { console.error('Usage: cdc layout <url-pattern> [tree|actionable]'); process.exit(1); }
        await layout(CDP_URL, args[0], args[1] || 'actionable', parseInt(args[2]) || 4);
        break;

      case 'fill':
        if (args.length < 3) { console.error('Usage: cdc fill <url-pattern> <index|selector> <value> [--wait ms]'); process.exit(1); }
        await fill(CDP_URL, args[0], args[1], args.slice(2).join(' '), waitMs);
        break;

      case 'fill-many': {
        if (args.length < 2) { console.error('Usage: cdc fill-many <url-pattern> <json-or-file> [--wait ms]'); process.exit(1); }
        let fields;
        const jsonArg = args.slice(1).join(' ');
        if (jsonArg.endsWith('.json')) {
          fields = JSON.parse(readFileSync(jsonArg, 'utf-8'));
        } else {
          fields = JSON.parse(jsonArg);
        }
        await fillMany(CDP_URL, args[0], fields, waitMs);
        break;
      }

      case 'clear':
        if (args.length < 2) { console.error('Usage: cdc clear <url-pattern> <index|selector>'); process.exit(1); }
        await clear(CDP_URL, args[0], args[1]);
        break;

      case 'click':
        if (args.length < 2) { console.error('Usage: cdc click <url-pattern> <index|selector> [--wait ms]'); process.exit(1); }
        await click(CDP_URL, args[0], args[1], waitMs);
        break;

      case 'check':
        if (args.length < 2) { console.error('Usage: cdc check <url-pattern> <index|selector> [on|off]'); process.exit(1); }
        await check(CDP_URL, args[0], args[1], args[2] === undefined ? undefined : args[2] === 'on');
        break;

      case 'verify':
        if (args.length < 2) { console.error('Usage: cdc verify <url-pattern> <index|selector> [expected-value]'); process.exit(1); }
        await verify(CDP_URL, args[0], args[1], args[2]);
        break;

      case 'type':
        if (args.length < 3) { console.error('Usage: cdc type <url-pattern> <index|selector> <text>'); process.exit(1); }
        await type(CDP_URL, args[0], args[1], args.slice(2).join(' '));
        break;

      case 'options':
        if (args.length < 2) { console.error('Usage: cdc options <url-pattern> <index|selector>'); process.exit(1); }
        await options(CDP_URL, args[0], args[1]);
        break;

      case 'hover':
        if (args.length < 2) { console.error('Usage: cdc hover <url-pattern> <index|selector>'); process.exit(1); }
        await hover(CDP_URL, args[0], args[1]);
        break;

      case 'help':
      case '--help':
      case '-h':
      case undefined:
        console.log(help);
        break;

      default:
        console.error(`Unknown command: ${cmd}`);
        console.log(help);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
