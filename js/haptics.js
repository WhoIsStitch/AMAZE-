// Haptics.
//  - Android / most browsers: navigator.vibrate.
//  - iOS Safari has no vibrate API, but toggling a hidden <input type="checkbox" switch> makes the
//    system play its switch haptic (iOS 17.4+; needs Settings > Sounds & Haptics > System Haptics on).
//    iOS only allows it shortly after a touch, so the game also fires a tick the moment a swipe or
//    button press is recognised, and keeps follow-up pulses close together.

let enabled = true;
let label = null;
let lastFire = 0;

function ensure() {
  if (label || typeof document === 'undefined') return;
  try {
    label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
  } catch (e) { label = null; }
}

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** n pulses, `gap` ms apart. `ms` is the pulse length on devices that support vibrate(). */
function pulse(n, gap, ms) {
  if (!enabled) return;
  const now = performance.now();
  if (now - lastFire < 28) return; // iOS merges pulses that are too close together
  lastFire = now;
  if (canVibrate) {
    const pat = [];
    for (let i = 0; i < n; i++) { pat.push(ms); if (i < n - 1) pat.push(gap - ms > 8 ? gap - ms : 8); }
    try { navigator.vibrate(pat); } catch (e) { /* ignore */ }
    return;
  }
  ensure();
  const click = () => { try { label && label.click(); } catch (e) { /* ignore */ } };
  click();
  for (let i = 1; i < n; i++) setTimeout(click, i * gap);
}

export const haptics = {
  set(on) { enabled = on; },
  /** light tick: buttons, swipes, tiles rolling past */
  tap() { pulse(1, 0, 8); },
  tick() { pulse(1, 0, 6); },
  /** wall hit: stronger the harder you hit */
  bump(power = 1) { if (power > 5) pulse(2, 55, 22); else if (power > 2) pulse(1, 0, 16); else pulse(1, 0, 10); },
  heavy() { pulse(2, 65, 26); },
  success() { pulse(3, 85, 20); },
  error() { pulse(2, 120, 34); },
  /** board ripple: a quick rumble */
  rumble() { pulse(4, 60, 14); },
};
