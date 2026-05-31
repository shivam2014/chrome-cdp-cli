# cdc — Chrome DevTools CLI

Project-agnostic CLI for monitoring Chrome extensions and pages during development. Connects to Chrome via CDP (Chrome DevTools Protocol) on port 9222.

## Install

```bash
cd ~/tools/chrome-cdp
npm install
npm link          # makes `cdc` available globally
```

Chrome must be running with `--remote-debugging-port=9222`.

## Commands

```
cdc list                              List all open tabs/pages
cdc status                            Health check + circuit state
cdc reload-ext <name>                 Reload extension by name
cdc refresh-page <url-pattern>        Refresh first page matching pattern
cdc reload-ext+page <ext> <pattern>   Reload ext then refresh page
cdc eval <url-pattern> <js-expr>      Evaluate JS in matching page
cdc screenshot <url-pattern> [path]   Screenshot matching page
cdc nav <url-pattern> <url>           Navigate matching page
cdc dev-mode [on|off|status]          Toggle/query Chrome extension developer mode
cdc ext-errors <name> [--clear]       Read/clear extension errors
cdc layout <url-pattern> [mode]       Page layout: actionable (default) or tree

Interaction (index or CSS selector):
cdc fill <pattern> <target> <value>   Auto-detect + fill field
cdc fill-many <pattern> <json>        Fill multiple fields (one connection)
cdc clear <pattern> <target>          Clear a field
cdc click <pattern> <target>          Click element (real mouse events)
cdc check <pattern> <target> [on]     Toggle checkbox
cdc verify <pattern> <target> [val]   Check field value
cdc type <pattern> <target> <text>    Keyboard simulation
cdc options <pattern> <target>        List dropdown/combobox options
cdc hover <pattern> <target>          Hover over an element

Flags:
  --wait <ms>   Wait for element to appear (fill, click)

All results include `duration` (ms) for performance tracking.
```

## Examples

```bash
# Check Chrome is alive
cdc status

# List open tabs
cdc list

# Reload extension + refresh target page
cdc reload-ext+page "Job Copilot" oraclecloud

# Evaluate JS in a page matching URL
cdc eval oraclecloud "document.title"

# Screenshot a page
cdc screenshot oraclecloud /tmp/shot.png

# Extract page layout as structured text (no vision model needed)
cdc layout oraclecloud

# Fill a field (by index from layout)
cdc fill oraclecloud 5 "Bhalla"

# Fill by CSS selector
cdc fill oraclecloud "#lastName" "Bhalla"

# Fill multiple fields at once (one connection, 4x faster)
cdc fill-many oraclecloud '{"5":"Bhalla","7":"Shivam","15":"Kumar"}'

# Fill from JSON file
cdc fill-many oraclecloud fields.json

# Click an element
cdc click oraclecloud 8

# Clear a field
cdc clear oraclecloud 5

# Check field value
cdc verify oraclecloud 5 "Bhalla"

# Check extension errors
cdc ext-errors "Job Copilot"

# Enable developer mode
cdc dev-mode on
```

## Environment

| Variable | Default | Description |
|---|---|---|
| `CDC_PORT` | `9222` | Chrome CDP port |

## Architecture

```
lib/connect.mjs     Playwright connectOverCDP + findPage
lib/circuit.mjs     Circuit breaker (CLOSED/OPEN/HALF_OPEN)
bin/cdc.mjs         CLI entry, routes to commands
commands/*.mjs      One file per command
```

Circuit breaker persists state in `/tmp/cdc-circuit.json`. Two consecutive CDP failures → OPEN (fail fast for 15s) → HALF_OPEN (one test request) → CLOSED (normal).

## Layout Modes

Two modes for different use cases:

**`cdc layout <pattern>`** or **`cdc layout <pattern> actionable`** (default) — Numbered interactive elements as markdown table. AI agents reference elements by number ("click element 8"). Fast, compact, directly actionable.

**`cdc layout <pattern> tree`** — Full AX tree with roles, names, hierarchy. For debugging/development. Optional depth: `cdc layout <pattern> tree 6`.

Inspired by [CEF-based browser project](https://old.reddit.com/r/AI_Agents/comments/1r8mr39/) that found text models navigate 3x faster than vision models when fed structured element tables.

## How it works

**reload-ext**: Opens `chrome://extensions` in a temp tab, drills three levels of shadow DOM (`extensions-manager` → `extensions-item-list` → `extensions-item`), finds extension by name, clicks `#dev-reload-button`. Works for any Chrome extension.

**layout**: Uses CDP `Accessibility.getFullAXTree` to extract the page's accessibility tree as structured text. Shows element roles, names, values, and positions. No vision model needed — faster and more accurate than screenshots for understanding page structure.

**ext-errors**: Reads the error badge and error text from `chrome://extensions` shadow DOM. Errors appear when content scripts throw uncaught exceptions.

## Design principles

- No project-specific code. All commands take parameters.
- Every command closes the CDP connection on exit (no hanging).
- Circuit breaker prevents silent hangs when Chrome is down.
- URL pattern matching: substring match against `page.url()`.
