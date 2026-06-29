/* =============================================================
   Body presets, density tags, body list UI
   -------------------------------------------------------------
   The 12 preset tiles (Asteroid → Black Hole) with custom SVG icons, density labelling, mass-slider helpers, the right-panel body list renderer with in-line mass/size adjusters, and the drag-to-select gesture.
   ============================================================= */// =============================================================
// BODY PRESETS & UI HELPERS
// =============================================================

// Masses below are real Solar System mass ratios, log-compressed to fit
// this engine's representable range (100–5,000,000). True linear ratios
// span ~11 orders of magnitude (a small asteroid to a 50-solar-mass black
// hole) — impossible to encode in a ~4.7-decade slider — so every preset's
// log10(mass in kg) is linearly remapped into our log10(mass) range. This
// preserves correct ORDER and realistic relative jumps between bodies in
// the same class (rocky planets, gas giants, stars, compact objects) even
// though cross-class ratios (e.g. planet vs. star) are necessarily
// compressed.
//
// Radii (the `r` field) are different: a sphere's radius isn't quantized
// by a slider, so there's no technical reason to compress it. Every
// preset's `r` is its ACTUAL real-world radius (km) times a single fixed
// scale factor (scale = 11 / 6371, i.e. Earth = 11 units), with only a
// 1.0-unit floor so sub-pixel objects (a real neutron star is ~11 km —
// genuinely smaller than almost everything else here) stay visible/
// clickable. The Sun really is ~109× Earth's radius and a giant star
// dwarfs the Sun in turn — that dramatic size gulf IS the real solar
// system, not a bug. (Merge results that don't correspond to a named
// preset still use the continuous mass-radius curves in
// Body._computeRadius(), which live on a much more compact visual scale —
// those two systems are intentionally different, since a merge product
// has no "real" body to look up.)
const BODY_PRESETS = [
  { n: 'Asteroid', mass: 100, r: 2, col: '#888888', d: 'Rocky', // Ceres, 473 km (floored to the 2-unit min visible radius)

    e: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <polygon points="12,3 17,5 21,10 19,17 14,21 9,20 4,16 5,9 9,4" fill="#706e63"/>
      <circle cx="9" cy="10" r="1.8" fill="#4e4c43"/>
      <circle cx="15" cy="15" r="1.2" fill="#4e4c43"/>
      <circle cx="15" cy="8"  r="0.9" fill="#4e4c43"/>
    </svg>` },

  { n: 'Moon', mass: 1000, r: 3, col: '#ccccaa', d: 'Rocky', // 1737 km
    e: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" fill="#b5b4a5"/>
      <circle cx="8"  cy="10" r="2.4" fill="#9a998a"/>
      <circle cx="15" cy="15" r="1.8" fill="#9a998a"/>
      <circle cx="14" cy="8"  r="1.2" fill="#9a998a"/>
      <circle cx="8"  cy="16" r="1.0" fill="#9a998a"/>
    </svg>` },

  { n: 'Mars', mass: 2400, r: 5.85, col: '#cc4422', d: 'Rocky', // 3390 km
    e: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" fill="#c04030"/>
      <ellipse cx="10" cy="13" rx="4" ry="1.5" fill="#8a2010" opacity="0.5" transform="rotate(-15 10 13)"/>
      <circle cx="12" cy="4.5" r="3" fill="#f0ddd0" opacity="0.65"/>
    </svg>` },

  { n: 'Earth', mass: 6000, r: 11, col: '#4477ff', d: 'Rocky', // 6371 km — scale anchor
    e: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" fill="#1a4ec5"/>
      <path d="M7 9 Q10 6 14 9 Q13 13 8 13 Z" fill="#2c8c3e"/>
      <path d="M14 14 Q18 12 18 16 Q16 19 13 18 Z" fill="#2c8c3e"/>
      <path d="M6 15 Q7 17 10 16 Q9 14 6 15 Z" fill="#2c8c3e"/>
      <ellipse cx="12" cy="4" rx="3" ry="1.4" fill="#e8f4ff" opacity="0.5"/>
    </svg>` },

  { n: 'Neptune', mass: 18700, r: 42.5, col: '#3355dd', d: 'Ice Giant', // 24622 km
    e: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" fill="#1a2d9a"/>
      <ellipse cx="12" cy="10" rx="9" ry="2"   fill="#2a3dba" opacity="0.55"/>
      <ellipse cx="12" cy="14" rx="9" ry="1.5" fill="#2a3dba" opacity="0.4"/>
      <ellipse cx="12" cy="17" rx="9" ry="1"   fill="#2a3dba" opacity="0.3"/>
    </svg>` },

  { n: 'Saturn', mass: 37400, r: 100.6, col: '#ddbb77', d: 'Gas Giant', // 58232 km
    e: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M 0.5,12 A 11.5,3.2 0 0 1 23.5,12" fill="none" stroke="#b8923a" stroke-width="3" opacity="0.45"/>
      <circle cx="12" cy="12" r="7.5" fill="#ddc17a"/>
      <ellipse cx="12" cy="10.5" rx="7.5" ry="1.5" fill="#c9a55a" opacity="0.5"/>
      <ellipse cx="12" cy="13.5" rx="7.5" ry="1"   fill="#c9a55a" opacity="0.35"/>
      <path d="M 23.5,12 A 11.5,3.2 0 0 1 0.5,12" fill="none" stroke="#b8923a" stroke-width="3" opacity="0.88"/>
    </svg>` },

  { n: 'Jupiter', mass: 61400, r: 120.7, col: '#cc8855', d: 'Gas Giant', // 69911 km
    e: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="cp-jup"><circle cx="12" cy="12" r="9"/></clipPath></defs>
      <circle cx="12" cy="12" r="9" fill="#cc8855"/>
      <rect x="3" y="7.5" width="18" height="2.5" fill="#aa4422" opacity="0.6" clip-path="url(#cp-jup)"/>
      <rect x="3" y="12"  width="18" height="2"   fill="#bb5533" opacity="0.55" clip-path="url(#cp-jup)"/>
      <rect x="3" y="15"  width="18" height="1.5" fill="#aa4422" opacity="0.4" clip-path="url(#cp-jup)"/>
      <ellipse cx="7.5" cy="14.5" rx="4" ry="2.5" fill="#ee9944" opacity="0.55" clip-path="url(#cp-jup)"/>
    </svg>` },

  { n: 'Red Dwarf', mass: 634000, r: 360.6, col: '#ff4422', d: 'Stellar', // 0.3 R☉ ≈ 208,800 km
    e: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" fill="#7a0a00"/>
      <circle cx="12" cy="12" r="7" fill="#b81400"/>
      <circle cx="12" cy="12" r="5" fill="#dd2800"/>
      <circle cx="12" cy="12" r="3" fill="#ff5533"/>
    </svg>` },

  { n: 'Sun', mass: 1033000, r: 1202, col: '#ffee44', d: 'Stellar', // 696,000 km
    e: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" y1="1"    x2="12" y2="4"    stroke="#ffdd22" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="12" y1="20"   x2="12" y2="23"   stroke="#ffdd22" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="1"  y1="12"   x2="4"  y2="12"   stroke="#ffdd22" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="20" y1="12"   x2="23" y2="12"   stroke="#ffdd22" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="3.8" y1="3.8" x2="5.9" y2="5.9" stroke="#ffdd22" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="18.1" y1="18.1" x2="20.2" y2="20.2" stroke="#ffdd22" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="20.2" y1="3.8" x2="18.1" y2="5.9" stroke="#ffdd22" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="3.8" y1="20.2" x2="5.9" y2="18.1" stroke="#ffdd22" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="12" cy="12" r="7.5" fill="#ffee44"/>
      <circle cx="12" cy="12" r="5.5" fill="#fff176" opacity="0.6"/>
    </svg>` },

  { n: 'Giant Star', mass: 3478000, r: 12021, col: '#ffaa22', d: 'Stellar', // 10 R☉ ≈ 6,960,000 km
    e: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" y1="0.5"  x2="12" y2="4.5"  stroke="#ffaa22" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="12" y1="19.5" x2="12" y2="23.5" stroke="#ffaa22" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="0.5" y1="12"  x2="4.5" y2="12"  stroke="#ffaa22" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="19.5" y1="12" x2="23.5" y2="12" stroke="#ffaa22" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="3"  y1="3"  x2="5.5" y2="5.5"   stroke="#ffaa22" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="21" y1="21" x2="18.5" y2="18.5" stroke="#ffaa22" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="21" y1="3"  x2="18.5" y2="5.5"  stroke="#ffaa22" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="3"  y1="21" x2="5.5" y2="18.5"  stroke="#ffaa22" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="12" cy="12" r="8.5" fill="#ffbb33"/>
      <circle cx="12" cy="12" r="6"   fill="#ffcc55"/>
      <circle cx="12" cy="12" r="3.5" fill="#ffee99" opacity="0.7"/>
    </svg>` },

  { n: 'Neutron Star', mass: 1179000, r: 2, col: '#aaddff', d: 'Ultra-Dense', // ~11 km — floored to the 2-unit min visible radius

    e: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9"   fill="#000d1a"/>
      <circle cx="12" cy="12" r="6"   fill="#001a33" opacity="0.8"/>
      <circle cx="12" cy="12" r="3.5" fill="#1a4466"/>
      <circle cx="12" cy="12" r="2"   fill="#66bbdd"/>
      <circle cx="12" cy="12" r="1"   fill="#cceeFF"/>
      <circle cx="12" cy="12" r="0.4" fill="#ffffff"/>
    </svg>` },

  { n: 'Black Hole', mass: 5000000, r: 2, col: '#330044', d: 'Singularity', // 50M☉ Schwarzschild r ≈ 147 km — floored to 2-unit min

    e: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M 1,12 A 11,3.5 0 0 1 23,12" fill="none" stroke="#6600aa" stroke-width="3.5" opacity="0.5"/>
      <path d="M 1,12 A 11,3.5 0 0 1 23,12" fill="none" stroke="#cc44ff" stroke-width="1"   opacity="0.4"/>
      <circle cx="12" cy="12" r="6.5" fill="#0a0010"/>
      <circle cx="12" cy="12" r="5"   fill="#000000"/>
      <path d="M 23,12 A 11,3.5 0 0 1 1,12" fill="none" stroke="#6600aa" stroke-width="3.5" opacity="0.9"/>
      <path d="M 23,12 A 11,3.5 0 0 1 1,12" fill="none" stroke="#cc44ff" stroke-width="1"   opacity="0.7"/>
    </svg>` },
];

function densityLabel(mass, r) {
  const d = mass / (r * r * r);
  if (d > 5000) return 'Singularity';
  if (d > 500)  return 'Ultra-Dense';
  if (d > 50)   return 'Compact';
  if (d > 5)    return 'Stellar';
  if (d > 2)    return 'Rocky';
  if (d > 0.5)  return 'Ice/Gas';
  return 'Gas Cloud';
}

function syncDensityTag() {
  const mass = getMass();
  const r    = getBodySize();
  document.getElementById('densityTag').textContent = 'Density: ' + densityLabel(mass, r);
}

// Exponential mass scale: slider 1â†’100 maps to mass 100â†’1,000,000
function getMass() {
  const v = +document.getElementById('sMass').value;
  return Math.round(Math.pow(10, 2 + (v - 1) / 99 * 4.7));
}

// Exponential size scale: slider 1â†’100 maps to radius 1â†’15,000.
// Linear wouldn't work any more â€” real-world preset radii span from a
// floored 1-unit neutron star up to a 12,021-unit giant star (see
// 10-presets.js' BODY_PRESETS comment for the real-radius basis), so the
// slider needs the same log treatment as the mass slider above.
const SIZE_LOG_MAX = Math.log10(15000); // â‰ˆ4.176
function getBodySize() {
  const v = +document.getElementById('sSize').value;
  return +(Math.pow(10, (v - 1) / 99 * SIZE_LOG_MAX)).toFixed(2);
}

// Inverse of getBodySize() â€” back-calculates the slider position for a
// given radius (used when a preset tile sets the slider to its real r).
function sizeToSliderValue(r) {
  return Math.max(1, Math.min(100, Math.round(1 + (Math.log10(Math.max(r, 1)) / SIZE_LOG_MAX) * 99)));
}

function fmtMass(m) {
  if (m >= 1e6) return (m / 1e6).toFixed(2) + 'M';
  if (m >= 1e3) return (m / 1e3).toFixed(1) + 'k';
  return m.toFixed(0);
}

function updateLockBtn() {
  const btn = document.getElementById('btnLockOn');
  if (followBody && followBody === selectedBody) {
    btn.disabled = false; btn.style.opacity = '1';
    setIcon(btn, 'lock-open', 'Unlock'); btn.classList.add('on');
  } else if (selectedBody) {
    btn.disabled = false; btn.style.opacity = '1';
    setIcon(btn, 'crosshair', 'Lock On'); btn.classList.remove('on');
  } else {
    btn.disabled = true; btn.style.opacity = '0.35';
    setIcon(btn, 'crosshair', 'Lock On'); btn.classList.remove('on');
  }
}

let _selectedPreset = null;
let _bodyN          = 0; // counter for auto-naming non-preset bodies
let _debrisN        = 0; // counter for debris fragment names

// Build the 3Ã—4 preset tile grid in the sidebar
(function () {
  const grid = document.getElementById('presetGrid');
  BODY_PRESETS.forEach((p, i) => {
    const t = document.createElement('div');
    t.className   = 'ptile';
    t.dataset.i   = i;
    t.innerHTML   = `<span class="pe">${p.e}</span><span class="pn">${p.n}</span>`;
    t.addEventListener('click', () => {
      document.querySelectorAll('.ptile').forEach(x => x.classList.remove('sel'));
      t.classList.add('sel');
      _selectedPreset = p;
      // Back-calculate the slider value from the preset's mass
      const v = Math.max(1, Math.min(100, Math.round(1 + (Math.log10(p.mass / 100) / 4.7) * 99)));
      document.getElementById('sMass').value   = v;
      document.getElementById('vMass').textContent = fmtMass(p.mass);
      document.getElementById('sSize').value   = sizeToSliderValue(p.r);
      document.getElementById('vSize').textContent = p.r;
      document.getElementById('sColor').value  = p.col;
      syncDensityTag();
    });
    grid.appendChild(t);
  });
})();

// Rebuild the body list panel (right-side panel)
function updateList() {
  document.getElementById('nBodies').textContent = bodies.length;
  const multiBar = document.getElementById('multiselect-bar');
  if (selectedBodies.size > 1) {
    multiBar.style.display = 'block';
    document.getElementById('ms-count').textContent = selectedBodies.size + ' bodies selected';
    document.getElementById('ms-com').classList.toggle('on', groupComLock);
    document.getElementById('ms-thrust').classList.toggle('on', groupThrust);
  } else {
    multiBar.style.display = 'none';
    groupComLock = false;
    groupThrust  = false;
  }

  const _bodyListEl = document.getElementById('body-list');
  _bodyListEl.innerHTML = bodies.map(b => {
    const inMulti  = selectedBodies.has(b);
    const isSel    = b === selectedBody || inMulti;
    const isPrimary = b === selectedBody;
    const isFollow  = b === followBody;
    const ghostCls  = b._noCollide ? ' on' : '';
    const extraVis  = isPrimary ? '' : 'display:none;';
    return `
    <div class="bitem${isSel ? ' sel' : ''}${inMulti && selectedBodies.size > 1 ? ' multi' : ''}${b._noCollide ? ' ghost' : ''}" data-bid="${b.id}" onclick="selectBodyById('${b.id}',event)">
      <div class="bi-row1">
        <div class="bdot" style="background:${b.color}"></div>
        <span class="bname" data-bid="${b.id}" ondblclick="renameBody('${b.id}');event.stopPropagation()">${b.name}</span>
        <span class="bi-mass">${fmtMass(b.mass)}</span>
      </div>
      <div class="bi-row2">
        <button class="bb thr${isPrimary ? ' on' : ''}" onclick="thrustBody('${b.id}')" title="Thrust / Select"><i data-lucide="zap"></i></button>
        <button class="bb fol${isFollow ? ' on' : ''}" onclick="followBodyById('${b.id}')" title="Follow"><i data-lucide="${isFollow ? 'map-pin' : 'eye'}"></i></button>
        <button class="bb ghost-btn${ghostCls}" onclick="toggleNoCollide('${b.id}')" title="Toggle Ghost (no collide)"><i data-lucide="ghost"></i></button>
        <button class="bb del" onclick="removeBody('${b.id}')" title="Delete"><i data-lucide="x"></i></button>
      </div>
      <div class="bi-extra" style="${extraVis}">
        <div class="bi-adj">
          <span class="bi-adj-lbl">Mass</span>
          <button class="bb adj" onclick="adjustMass('${b.id}',-1)"><i data-lucide="minus"></i></button>
          <span class="bi-val">${fmtMass(b.mass)}</span>
          <button class="bb adj" onclick="adjustMass('${b.id}',1)"><i data-lucide="plus"></i></button>
        </div>
        <div class="bi-adj">
          <span class="bi-adj-lbl">Size</span>
          <button class="bb adj" onclick="adjustSize('${b.id}',-1)"><i data-lucide="minus"></i></button>
          <span class="bi-val">${b._r.toFixed(0)}</span>
          <button class="bb adj" onclick="adjustSize('${b.id}',1)"><i data-lucide="plus"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
  lucide.createIcons({ nodes: [_bodyListEl] });
}

// Lightweight selection update — only touches CSS classes, no innerHTML rebuild
function updateSelectionUI() {
  const multi = selectedBodies.size > 1;
  document.querySelectorAll('#body-list .bitem').forEach(el => {
    const b = bodies.find(x => x.id === el.dataset.bid);
    if (!b) return;
    const inMulti   = selectedBodies.has(b);
    const isPrimary = b === selectedBody;
    const isSel     = isPrimary || inMulti;
    el.classList.toggle('sel',   isSel && !inMulti);
    el.classList.toggle('multi', inMulti && multi);
    el.classList.toggle('ghost', !!b._noCollide);
    const thrBtn = el.querySelector('.bb.thr');
    if (thrBtn) thrBtn.classList.toggle('on', isPrimary);
    const folBtn = el.querySelector('.bb.fol');
    if (folBtn) folBtn.classList.toggle('on', b === followBody);
    const extra = el.querySelector('.bi-extra');
    if (extra) extra.style.display = isPrimary ? '' : 'none';
  });
  const multiBar = document.getElementById('multiselect-bar');
  if (multi) {
    multiBar.style.display = 'block';
    document.getElementById('ms-count').textContent = selectedBodies.size + ' bodies selected';
    document.getElementById('ms-com').classList.toggle('on', groupComLock);
    document.getElementById('ms-thrust').classList.toggle('on', groupThrust);
  } else {
    multiBar.style.display = 'none';
    groupComLock = false;
    groupThrust  = false;
  }
  const tp = document.getElementById('thrust-panel');
  if (selectedBody) {
    tp.style.display = 'block';
    document.getElementById('tp-name').textContent =
      multi ? `Group (${selectedBodies.size})` : selectedBody.name;
  } else {
    tp.style.display = 'none';
  }
}

// ── Drag-to-select in body list ───────────────────────────────────────────────
(function () {
  const list = document.getElementById('body-list');
  let dragging = false, dragStartY = 0, dragStartIdx = -1;

  // Highlight overlay bar
  const bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;left:0;right:0;background:rgba(0,220,220,0.12);border:1px solid rgba(0,220,220,0.3);pointer-events:none;display:none;border-radius:2px;';
  list.style.position = 'relative';
  list.appendChild(bar);

  function itemsInRange(y1, y2) {
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
    return [...list.querySelectorAll('.bitem')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.bottom >= lo && r.top <= hi;
    });
  }

  list.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const item = e.target.closest('.bitem');
    if (!item) return;
    dragStartY   = e.clientY;
    dragStartIdx = bodies.findIndex(b => b.id === item.dataset.bid);
    dragging     = false; // becomes true only after movement
    bar.style.display = 'none';
  });

  window.addEventListener('mousemove', e => {
    if (dragStartIdx < 0) return;
    if (Math.abs(e.clientY - dragStartY) > 6) dragging = true;
    if (!dragging) return;
    e.preventDefault();

    // Update visual bar
    const listRect = list.getBoundingClientRect();
    const lo = Math.min(dragStartY, e.clientY) - listRect.top + list.scrollTop;
    const hi = Math.max(dragStartY, e.clientY) - listRect.top + list.scrollTop;
    bar.style.top    = lo + 'px';
    bar.style.height = (hi - lo) + 'px';
    bar.style.display = 'block';

    // Select items in range
    const inRange = itemsInRange(Math.min(dragStartY, e.clientY), Math.max(dragStartY, e.clientY));
    if (inRange.length > 0) {
      selectedBodies.clear();
      inRange.forEach(el => {
        const b = bodies.find(b => b.id === el.dataset.bid);
        if (b) selectedBodies.add(b);
      });
      selectedBody = [...selectedBodies].at(-1) || null;
      updateSelectionUI();
    }
  });

  window.addEventListener('mouseup', () => {
    dragStartIdx = -1;
    dragging     = false;
    bar.style.display = 'none';
  });
})();

// These are called by inline onclick attributes in the body list HTML
window.removeBody = id => {
  const i = bodies.findIndex(b => b.id === id);
  if (i < 0) return;
  if (selectedBody === bodies[i]) selectBody(null);
  if (selectedBodies.has(bodies[i])) selectedBodies.delete(bodies[i]);
  if (followBody === bodies[i]) {
    followBody = null;
    document.getElementById('btnFollowOff').style.display = 'none';
  }
  bodies[i].remove();
  bodies.splice(i, 1);
  if (recording && bodies.length !== recBodyCount) stopRecording();
  updateList();
};

window.renameBody = id => {
  const b = bodies.find(b => b.id === id);
  if (!b) return;
  // Find the .bname span for this body and replace it with an input
  const span = document.querySelector(`.bitem [data-bid="${id}"]`);
  if (!span) return;
  const inp = document.createElement('input');
  inp.className = 'bname-edit';
  inp.value = b.name;
  inp.style.cssText = 'background:#001a2a;border:1px solid #0ff6;color:#fff;font-family:inherit;font-size:11px;width:100%;padding:0 2px;outline:none;';
  span.replaceWith(inp);
  inp.focus(); inp.select();
  const commit = () => {
    const v = inp.value.trim();
    if (v) b.name = v;
    updateList();
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { inp.value = b.name; inp.blur(); }
    e.stopPropagation();
  });
  inp.addEventListener('click', e => e.stopPropagation());
};

// Panel selection: Ctrl+click = toggle, Shift+click = range, plain click = single
window.selectBodyById = (id, ev) => {
  // Ignore clicks that came from a button inside the row — those have their own handlers
  if (ev && ev.target.closest('button')) return;
  const b = bodies.find(b => b.id === id);
  if (!b) return;
  if (ev && (ev.ctrlKey || ev.metaKey)) {
    // Ctrl+click: ensure existing singular selection is carried into the set first
    if (selectedBody && !selectedBodies.has(selectedBody)) selectedBodies.add(selectedBody);
    if (selectedBodies.has(b)) {
      selectedBodies.delete(b);
      if (selectedBody === b) selectedBody = selectedBodies.size > 0 ? [...selectedBodies].at(-1) : null;
    } else {
      selectedBodies.add(b);
      selectedBody = b;
    }
    updateSelectionUI(); updateLockBtn();
  } else if (ev && ev.shiftKey && selectedBody) {
    // Shift+click: select range in list order between selectedBody and b
    const ai = bodies.indexOf(selectedBody), bi2 = bodies.indexOf(b);
    const lo = Math.min(ai, bi2), hi = Math.max(ai, bi2);
    for (let i = lo; i <= hi; i++) selectedBodies.add(bodies[i]);
    selectedBody = b;
    updateSelectionUI(); updateLockBtn();
  } else {
    selectedBodies.clear();
    selectBody(b === selectedBody ? null : b);
  }
};

window.followBodyById = id => {
  const b = bodies.find(b => b.id === id);
  followBody = b === followBody ? null : b;
  document.getElementById('btnFollowOff').style.display = followBody ? 'block' : 'none';
  updateSelectionUI();
  updateLockBtn();
};

// Select a body and make it the active thrust target
window.thrustBody = id => {
  const b = bodies.find(b => b.id === id);
  if (!b) return;
  selectedBodies.clear();
  selectBody(b === selectedBody ? null : b);
};

// Adjust mass by ±15% per click and rebuild the mesh (in-place DOM update, no deselect)
window.adjustMass = (id, dir) => {
  const b = bodies.find(b => b.id === id);
  if (!b) return;
  b.mass = Math.max(100, Math.min(5000000, Math.round(b.mass * (dir > 0 ? 1.15 : 1/1.15))));
  b.rebuildMesh();
  initAccelerations();
  const el = document.querySelector(`#body-list .bitem[data-bid="${id}"]`);
  if (el) {
    const massStr = fmtMass(b.mass);
    const mSpan = el.querySelector('.bi-mass');
    if (mSpan) mSpan.textContent = massStr;
    const vals = el.querySelectorAll('.bi-val');
    if (vals[0]) vals[0].textContent = massStr;
  }
  setStatus(b.name + ' mass → ' + fmtMass(b.mass));
};

// Adjust visual radius by ±12% per click (in-place DOM update, no deselect).
// Proportional rather than a fixed step, same reasoning as adjustMass —
// presets now range from a floored 1-unit neutron star to a 12,021-unit
// giant star, so a fixed +2 step would be meaningless at one end and
// imperceptible at the other.
window.adjustSize = (id, dir) => {
  const b = bodies.find(b => b.id === id);
  if (!b) return;
  b._r = Math.max(1, Math.min(15000, b._r * (dir > 0 ? 1.12 : 1 / 1.12)));
  b.mesh.geometry.dispose();
  b.mesh.geometry = new THREE.SphereGeometry(b._r, 20, 14);
  b.selRing.geometry.dispose();
  b.selRing.geometry = new THREE.SphereGeometry(b._r * 2.2, 12, 8);
  const gp = b._glowParams();
  b.glow.geometry.dispose();
  b.glow.geometry = new THREE.SphereGeometry(b._r * gp.radMult, 16, 10);
  // Update size display in-place so selection is preserved
  const el = document.querySelector(`#body-list .bitem[data-bid="${id}"]`);
  if (el) {
    const vals = el.querySelectorAll('.bi-val');
    if (vals[1]) vals[1].textContent = b._r.toFixed(0);
  }
};

// Select all bodies into the multi-select set
window.selectAll = () => {
  selectedBodies.clear();
  bodies.forEach(b => selectedBodies.add(b));
  if (bodies.length > 0) selectedBody = bodies[bodies.length - 1];
  updateSelectionUI();
  updateLockBtn();
};

// Toggle ghost mode — body passes through everything, not affected by collisions
window.toggleNoCollide = id => {
  const b = bodies.find(b => b.id === id);
  if (!b) return;
  b._noCollide = !b._noCollide;
  updateList();
  setStatus(b.name + ': collisions ' + (b._noCollide ? 'OFF (ghost)' : 'ON'));
};

