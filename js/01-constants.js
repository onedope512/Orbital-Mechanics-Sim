/* =============================================================
   Constants & helpers
   -------------------------------------------------------------
   Physics constants (G, MAX_TRAIL, VEL_SCALE) and the shared setIcon() helper that swaps a button's contents for a Lucide icon plus optional label.
   ============================================================= */﻿/* =============================================================
   ORBITAL SIMULATOR 3D Main Script
   Physics: symplectic leapfrog (Velocity-Verlet)
   Renderer: Three.js r134
   ============================================================= */

// Constants
const G         = 900;       // gravitational constant (scaled for this sim)
const MAX_TRAIL = 3000;      // maximum trail point capacity per body
const VEL_SCALE = 1.0;       // multiplier converting drag-length to launch velocity

// Helper: set a button's content to a Lucide icon + optional label
function setIcon(el, iconName, label) {
  el.innerHTML = `<i data-lucide="${iconName}"></i>${label ? ' ' + label : ''}`;
  lucide.createIcons({ nodes: [el] });
}
