// Haptics. iOS Safari has no navigator.vibrate, but toggling a hidden <input switch> from a user
// gesture produces a real tap (iOS 17.4+). Both are best-effort and silently do nothing otherwise.

let enabled = true;
let label = null;
let input = null;

function ensure() {
  if (label || typeof document === 'undefined') return;
  try {
    label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none';
    input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.id = 'glyde-haptic';
    label.htmlFor = input.id;
    label.appendChild(input);
    document.body.appendChild(label);
  } catch (e) { label = null; }
}

function fire() {
  if (!enabled) return;
  if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) { /* ignore */ } return; }
  ensure();
  try { label && label.click(); } catch (e) { /* ignore */ }
}

export const haptics = {
  set(on) { enabled = on; },
  tap() { fire(); },
  bump(power = 1) {
    if (!enabled) return;
    if (navigator.vibrate) { try { navigator.vibrate(power > 4 ? 22 : 12); } catch (e) { /* ignore */ } return; }
    fire();
  },
  success() {
    if (!enabled) return;
    if (navigator.vibrate) { try { navigator.vibrate([14, 40, 14, 40, 30]); } catch (e) { /* ignore */ } return; }
    fire(); setTimeout(fire, 90); setTimeout(fire, 180);
  },
};
