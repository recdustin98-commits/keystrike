// Phone keyboard input through a hidden text field, plus keeping the game above the keyboard.
export function setupInput({ input, spacer, onChar, onClear, isActive }) {
  let lastV = '', baseH = innerHeight, pad = -1;
  const coarse = matchMedia('(pointer:coarse)').matches;
  const clear = () => { input.value = ''; lastV = ''; };

  input.addEventListener('input', () => {
    const v = input.value.toLowerCase();
    let p = 0; while (p < lastV.length && p < v.length && lastV[p] === v[p]) p++;
    const add = v.length > lastV.length ? v.slice(p) : '';
    lastV = v;
    for (const ch of add) if (ch >= 'a' && ch <= 'z') onChar(ch);
    if (v.length > 24) clear();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Backspace') { e.preventDefault(); onClear(); }
    if (e.key === 'Enter') e.preventDefault();
  });
  input.addEventListener('compositionend', () => setTimeout(clear, 0));

  // Desktop keyboards
  addEventListener('keydown', e => {
    if (!isActive() || e.target === input || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (/^[a-z]$/.test(k)) onChar(k);
    else if (k === 'backspace') { e.preventDefault(); onClear(); }
  });

  // Keep the play area above the on-screen keyboard:
  // 1) browser already shrank the page (most Android): nothing to do;
  // 2) visual viewport shrank (Safari): reserve exactly that;
  // 3) nothing reported (iPhone in an in-app browser): reserve an estimate.
  const setPad = h => { h = Math.max(0, Math.round(h)); if (h !== pad) { pad = h; spacer.style.height = h + 'px'; } };
  const measure = () => {
    if (!isActive() || document.activeElement !== input) { setPad(0); return; }
    if (baseH - innerHeight > 100) { setPad(0); return; }
    const vv = window.visualViewport, d = vv ? innerHeight - vv.height : 0;
    if (d > 100) { setPad(d); return; }
    setPad(coarse ? innerHeight * (innerWidth > innerHeight ? 0.52 : 0.42) : 0);
  };
  input.addEventListener('focus', () => { setTimeout(measure, 30); setTimeout(measure, 450); });
  input.addEventListener('blur', () => { setPad(0); setTimeout(() => { if (document.activeElement !== input) baseH = innerHeight; }, 500); });
  addEventListener('resize', () => { if (document.activeElement !== input) baseH = innerHeight; measure(); });
  if (window.visualViewport) { visualViewport.addEventListener('resize', measure); visualViewport.addEventListener('scroll', () => window.scrollTo(0, 0)); }

  return {
    focus() { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } },
    blur() { input.blur(); setPad(0); },
    clear,
    focused: () => document.activeElement === input,
    coarse,
  };
}
