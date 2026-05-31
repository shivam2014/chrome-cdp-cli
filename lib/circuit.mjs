/**
 * Circuit breaker for CDP connections.
 * Prevents silent hangs when Chrome is down.
 * State persists in /tmp/cdc-circuit.json between CLI invocations.
 */
import fs from 'fs';

const CIRCUIT_FILE = '/tmp/cdc-circuit.json';
const COOLDOWN_MS = 15_000;
const FAIL_THRESHOLD = 2;

const STATE = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

export function loadCircuit() {
  try {
    if (fs.existsSync(CIRCUIT_FILE)) {
      return JSON.parse(fs.readFileSync(CIRCUIT_FILE, 'utf-8'));
    }
  } catch (_) {}
  return { state: STATE.CLOSED, failCount: 0, lastFailure: 0, lastError: '' };
}

function save(s) {
  try { fs.writeFileSync(CIRCUIT_FILE, JSON.stringify(s, null, 2)); } catch (_) {}
}

/**
 * Check if circuit allows a request.
 * Returns { ok, cb }. If !ok, caller should fail fast.
 */
export function checkCircuit() {
  const cb = loadCircuit();
  if (cb.state === STATE.OPEN) {
    if (Date.now() - cb.lastFailure >= COOLDOWN_MS) {
      cb.state = STATE.HALF_OPEN;
      save(cb);
      return { ok: true, cb };
    }
    return { ok: false, cb };
  }
  return { ok: true, cb };
}

export function recordFailure(cb, msg) {
  cb.failCount++;
  cb.lastFailure = Date.now();
  cb.lastError = (msg || '').substring(0, 200);
  if (cb.failCount >= FAIL_THRESHOLD) cb.state = STATE.OPEN;
  save(cb);
  return cb;
}

export function recordSuccess(cb) {
  cb.state = STATE.CLOSED;
  cb.failCount = 0;
  cb.lastFailure = 0;
  cb.lastError = '';
  save(cb);
  return cb;
}
