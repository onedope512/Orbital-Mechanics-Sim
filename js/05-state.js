/* =============================================================
   Simulation state + mass tier labels
   -------------------------------------------------------------
   Mass-tier table, classification helpers, and the mutable global state the rest of the sim mutates: bodies array, paused/reversed/simSpeed flags, selection sets, keyboard map, plus setStatus() and centerOnOrigin().
   ============================================================= */// =============================================================
// MASS TIER LABELS
// Maps a slider value (sqrt scale) to a human-readable tier name.
// Used only for hover tooltips â€” the body's actual name is separate.
// =============================================================

const MASS_TIERS = [
  { max:  8, label: 'Asteroid',      emoji: '\u{1FA68}' },
  { max: 18, label: 'Dwarf Planet',  emoji: '\u{1F311}' },
  { max: 28, label: 'Moon',          emoji: '\u{1F315}' },
  { max: 42, label: 'Rocky Planet',  emoji: '\u{1F30D}' },
  { max: 58, label: 'Large Planet',  emoji: '\u{1FA90}' },
  { max: 70, label: 'Gas Giant',     emoji: '\u{1F300}' },
  { max: 80, label: 'Red Dwarf',     emoji: '❤'         },
  { max: 88, label: 'Sun-like Star', emoji: '☀'         },
  { max: 94, label: 'Giant Star',    emoji: '\u{1F31F}' },
  { max: 100,label: 'Black Hole',    emoji: '⚫'         },
];

function massLabel(sv) {
  for (const t of MASS_TIERS) if (sv <= t.max) return t.emoji + ' ' + t.label;
  return MASS_TIERS.at(-1).label;
}

function tierFromMass(m) {
  const sv = Math.sqrt(m / 100);
  return MASS_TIERS.find(t => sv <= t.max) || MASS_TIERS.at(-1);
}

// =============================================================
// SIMULATION STATE
// =============================================================

let bodies     = [];
let paused     = false;
let reversed   = false;
let simTime    = 0;
let simSpeed   = 1.0;
let trailLen   = 500;
let showVectors = false;
let showLabels  = false;
let showTrails  = true;
let starGlowMult = 1.0; // 0–1.5, user-adjustable size/brightness of the glow around stars/black holes
let easyVisuals  = false; // log-compress RENDERED body sizes so tiny planets stay visible next to giant stars (visual only)
let easyVisualsBlend = 0; // 0→1 eased toward easyVisuals each frame (see animate()) for a smooth size transition
let selectedBody   = null;
const selectedBodies = new Set(); // multi-select: Shift+click adds/removes
let groupComLock   = false; // camera follows CoM of selectedBodies
let groupThrust    = false; // WASD applies to all selectedBodies

const keys = {}; // keyboard state map: key â†’ boolean

// Re-trigger the CSS pop animation on the status bar each time text changes
function setStatus(msg) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.style.animation = 'none';
  el.offsetHeight; // force reflow
  el.style.animation = 'statusPop 0.35s ease';
}

function centerOnOrigin() {
  orbitTarget.set(0, 0, 0);
  followBody = null;
  document.getElementById('btnFollowOff').style.display = 'none';
  lockCoM = false;
  document.getElementById('btnCoMLock').classList.remove('on');
  orbitUpdate();
  updateList();
}
