// Page-side interaction functions. Loaded via page.addScriptTag or evaluated directly.
// These run in the browser context, not Node.

function resolveElement(target) {
  const isIndex = /^\d+$/.test(String(target));
  if (isIndex) {
    const idx = parseInt(target) - 1;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const items = [];
    for (const el of document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 15 || rect.height < 8) continue;
      if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) continue;
      const tag = el.tagName;
      const role = el.getAttribute('role') || '';
      const isInteractive = ['A','BUTTON','INPUT','SELECT','TEXTAREA'].includes(tag) ||
        ['button','link','combobox','textbox','checkbox','radio','tab','menuitem','searchbox','menuitemradio'].includes(role);
      if (!isInteractive) continue;
      items.push({ el, y: rect.y, x: rect.x });
    }
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    return idx >= 0 && idx < items.length ? items[idx].el : null;
  }
  return document.querySelector(target);
}

function fillText(el, value) {
  const result = { ok: false, actual: null, strategy: null, error: null, message: '' };
  if (!el) { result.error = 'element_not_found'; result.message = 'Element not found'; return result; }
  if (el.disabled || el.readOnly) { result.error = 'element_disabled'; result.actual = el.value || null; result.message = 'Disabled or read-only'; return result; }

  // Strategy 1: paste
  try {
    el.focus(); el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.value = value;
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste', data: value, bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    if (el.value === value) { result.ok = true; result.actual = el.value; result.strategy = 'paste'; result.message = 'OK'; return result; }
  } catch(e) {}

  // Strategy 2: char-by-char
  try {
    el.focus(); el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    for (let i = 0; i < value.length; i++) {
      el.value = value.substring(0, i + 1);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    if (el.value === value) { result.ok = true; result.actual = el.value; result.strategy = 'char-by-char'; result.message = 'OK'; return result; }
  } catch(e) {}

  result.actual = el.value || null;
  result.error = 'value_rejected';
  result.message = 'Both strategies failed. Framework cleared the value.';
  return result;
}

function fillSelect(el, value) {
  const result = { ok: false, actual: null, strategy: null, error: null, message: '' };
  if (!el) { result.error = 'element_not_found'; result.message = 'Element not found'; return result; }
  const options = Array.from(el.options).filter(o => o.value !== '');
  const lv = value.toLowerCase().trim();

  // Phase 1: exact
  let match = options.find(o => o.text.toLowerCase().trim() === lv || o.value.toLowerCase().trim() === lv);
  // Phase 2: startsWith
  if (!match) match = options.find(o => o.text.toLowerCase().trim().startsWith(lv) || lv.startsWith(o.text.toLowerCase().trim()));
  // Phase 3: includes
  if (!match) match = options.find(o => o.text.toLowerCase().includes(lv) || o.value.toLowerCase().includes(lv));

  if (match) {
    el.value = match.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    result.ok = true; result.actual = el.options[el.selectedIndex]?.text || el.value;
    result.strategy = 'select-match'; result.message = 'Matched: ' + match.text; return result;
  }
  result.error = 'no_match'; result.actual = '';
  result.message = 'No match. Options: ' + options.slice(0, 5).map(o => o.text).join(', ');
  return result;
}

function clickEl(el) {
  const result = { ok: false, actual: null, strategy: null, error: null, message: '' };
  if (!el) { result.error = 'element_not_found'; result.message = 'Element not found'; return result; }
  if (el.disabled) { result.error = 'element_disabled'; result.message = 'Disabled'; return result; }
  try {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    result.ok = true; result.strategy = 'real-mouse'; result.message = 'Clicked'; return result;
  } catch(e) { result.error = 'click_failed'; result.message = e.message; return result; }
}

function hoverEl(el) {
  const result = { ok: false, actual: null, strategy: null, error: null, message: '' };
  if (!el) { result.error = 'element_not_found'; result.message = 'Element not found'; return result; }
  try {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, button: 0, buttons: 0 };
    el.dispatchEvent(new PointerEvent('pointerover', opts));
    el.dispatchEvent(new MouseEvent('mouseover', opts));
    el.dispatchEvent(new PointerEvent('pointerenter', opts));
    el.dispatchEvent(new MouseEvent('mouseenter', opts));
    el.dispatchEvent(new PointerEvent('pointermove', opts));
    el.dispatchEvent(new MouseEvent('mousemove', opts));
    result.ok = true; result.strategy = 'hover'; result.message = 'Hovered'; return result;
  } catch(e) { result.error = 'hover_failed'; result.message = e.message; return result; }
}

function getOptions(el) {
  const result = { ok: false, count: 0, current: '', options: [], error: null, message: '' };
  if (!el) { result.error = 'element_not_found'; result.message = 'Element not found'; return result; }

  // Native <select>
  if (el.tagName === 'SELECT') {
    const opts = Array.from(el.options).filter(o => o.value !== '');
    result.ok = true;
    result.count = opts.length;
    result.current = el.options[el.selectedIndex]?.text || '';
    result.options = opts.map(o => ({ value: o.value, text: o.text.trim() }));
    result.message = opts.length + ' options';
    return result;
  }

  // Combobox — look for associated listbox
  const id = el.id;
  const listbox = document.getElementById(id + '-listbox') ||
                  el.closest('[role=combobox]')?.querySelector('[role=listbox]') ||
                  document.querySelector(`[aria-controls="${id}"]`);

  if (listbox) {
    const items = listbox.querySelectorAll('[role=option], [role=gridcell], .cx-select__list-item, li');
    result.ok = true;
    result.count = items.length;
    result.current = el.value || '';
    result.options = Array.from(items).map(o => ({
      value: o.getAttribute('data-value') || o.textContent.trim(),
      text: o.textContent.trim()
    }));
    result.message = items.length + ' options in listbox';
    return result;
  }

  // Fallback: check for any visible dropdown
  const role = el.getAttribute('role') || '';
  if (role === 'combobox') {
    result.ok = true;
    result.count = 0;
    result.current = el.value || '';
    result.options = [];
    result.message = 'Combobox detected but no listbox found. Try opening it first.';
    return result;
  }

  result.error = 'not_a_dropdown';
  result.message = 'Element is not a select or combobox';
  return result;
}
