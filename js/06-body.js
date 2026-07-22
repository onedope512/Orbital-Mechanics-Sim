/* =============================================================
   Body class — type classification + per-body Three.js objects
   -------------------------------------------------------------
   Defines NEUTRON_MASS_MIN / BH_MASS_MIN / STAR_IGNITION / STELLAR_COLLAPSE thresholds, classifyType()/classifyMerge(), and the Body class itself: mesh, glow, accretion disk, lensing ring, Saturn ring system, trail, vector arrows, DOM label, plus rebuildMesh() and updateVisual().
   ============================================================= */// =============================================================
// BODY CLASS
// Each celestial body owns its Three.js meshes (sphere, glow,
// selection ring), trail line, vector arrows, and DOM label.
// =============================================================

// Body type classification — drives radius scaling, glow, accretion disk,
// and post-collision outcomes (e.g. neutron + anything → black hole).
//
// Preset masses (see 10-presets.js) are tuned to real log-compressed mass
// ratios, which means a real "Giant Star" (≈20 M☉) can outweigh a real
// "Neutron Star" (≈1.4 M☉) — true to life (neutron stars are remnants
// that lost most of their progenitor's mass in the supernova). Because
// numeric mass alone can't reliably separate "Giant Star" from "Neutron
// Star" any more, every preset's type is fixed by name first; the mass
// thresholds below only classify *unnamed* bodies — custom placements,
// debris, and merge products that don't carry a preset name.
const NEUTRON_MASS_MIN = 700000;
const BH_MASS_MIN      = 880000;
const STAR_IGNITION    = 150000;   // planet mass that ignites fusion → star
const STELLAR_COLLAPSE = 1200000;  // combined star mass that collapses → BH (TOV analog)
// Size : natural-radius ratio that triggers gravitational collapse. The
// continuous mass-radius curve in _computeRadius() is only a smooth
// approximation through a few real anchor points, so even legitimately
// real-world preset radii can deviate from it (Giant Star's real radius
// is ~5x what the curve alone would predict for its mass) — 8 gives
// comfortable headroom above every preset's real ratio while still
// catching deliberate Size-slider abuse (e.g. minimum mass + maximum
// size is a ~4000x ratio).
const COLLAPSE_RATIO   = 8;

const PRESET_TYPE_OVERRIDE = {
  'Asteroid': 'planet', 'Moon': 'planet', 'Mars': 'planet', 'Earth': 'planet',
  'Neptune': 'planet', 'Saturn': 'planet', 'Jupiter': 'planet',
  'Red Dwarf': 'star', 'Sun': 'star', 'Giant Star': 'star',
  'Neutron Star': 'neutron', 'Black Hole': 'blackhole',
};

function classifyType(mass, name) {
  if (PRESET_TYPE_OVERRIDE[name]) return PRESET_TYPE_OVERRIDE[name];
  if (mass >= BH_MASS_MIN)   return 'blackhole';
  if (mass >= NEUTRON_MASS_MIN) return 'neutron';
  if (mass >= STAR_IGNITION) return 'star';
  return 'planet';
}

// Grav-well DEPTH multiplier by type (controls relative intensity / how
// far DOWN the funnel dips). See gwUni.bDepth in 04-shaders.js.
// Mild mass-based variation within type, fixed values for compact objects
// since real neutron stars/black holes are uniformly extreme regardless
// of the modest mass range this engine represents.
function bodyWellDepthMult(type, mass) {
  if (type === 'blackhole') return 15;
  if (type === 'neutron')   return 6;
  if (type === 'star')      return 1.5 + Math.log10(Math.max(mass, 1000) / 200000) * 0.4;
  return 0.6 + Math.log10(Math.max(mass, 10) / 100) * 0.15; // planet
}

// Grav-well REACH (world units) — the distance scale the shader normalizes
// against, which sets the well's FOOTPRINT. For ordinary planets/stars this
// is just the body's own radius, so the footprint stays proportional to the
// body (the fix for "well too big for small planets, too small for big").
// But compact objects (neutron star, black hole) have a tiny visual radius
// yet enormous gravity — tying their footprint to that tiny radius made
// their wells SMALLER than Earth's, which was the "BH/neutron don't affect
// the well" bug. So their reach is floored to a large fixed value,
// decoupling the well's extent from their pinpoint visual size.
function bodyWellReach(type, radius) {
  if (type === 'blackhole') return Math.max(radius, 550);
  if (type === 'neutron')   return Math.max(radius, 320);
  return Math.max(radius, 1);
}

// Determine the result type when two bodies merge.
function classifyMerge(tA, tB, totalMass) {
  if (tA === 'blackhole' || tB === 'blackhole') return 'blackhole';
  if (tA === 'neutron'   || tB === 'neutron')   return 'blackhole';
  if (tA === 'star' && tB === 'star' && totalMass >= STELLAR_COLLAPSE) return 'blackhole';
  if (tA === 'star' || tB === 'star') return 'star';
  if (totalMass >= STAR_IGNITION) return 'star'; // planet fusion ignition
  return 'planet';
}

// =============================================================
// PROCEDURAL PLANET TEXTURES
// Canvas-drawn equirectangular textures for the named presets that have
// a recognisable real-world surface feature (Jupiter's bands + Great Red
// Spot, Mars' rusty rock speckle, Earth's continents, the Sun's
// granulation + sunspots, etc). Generated once per name and cached —
// every body sharing a preset name reuses the same THREE.CanvasTexture.
// Unlisted names (custom bodies, merge results, Neutron Star, Black
// Hole) fall back to flat colour, same as before.
// =============================================================
const _planetTextureCache = {};

function _speckle(ctx, w, h, count, colorFn, sizeRange) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const r = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
    ctx.fillStyle = colorFn();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

function getPlanetTexture(name) {
  if (name in _planetTextureCache) return _planetTextureCache[name];

  const w = 512, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  switch (name) {
    case 'Earth': {
      ctx.fillStyle = '#1a4ec5'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2c8c3e';
      [[80,90,55,30],[180,60,40,25],[260,140,70,35],[380,80,50,28],[430,175,35,20],[120,185,45,22]]
        .forEach(([x,y,rx,ry]) => { ctx.beginPath(); ctx.ellipse(x,y,rx,ry,Math.random()*Math.PI,0,Math.PI*2); ctx.fill(); });
      ctx.globalAlpha = 0.25;
      _speckle(ctx, w, h, 60, () => '#ffffff', [8, 20]);
      ctx.globalAlpha = 1;
      break;
    }
    case 'Mars': {
      ctx.fillStyle = '#c04030'; ctx.fillRect(0, 0, w, h);
      _speckle(ctx, w, h, 400, () => `rgba(${100+Math.random()*40|0},${30+Math.random()*20|0},${10+Math.random()*15|0},0.5)`, [2, 6]);
      ctx.fillStyle = 'rgba(240,225,210,0.7)';
      ctx.beginPath(); ctx.ellipse(w/2, 8,   90, 14, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(w/2, h-8, 70, 12, 0, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'Jupiter': {
      const bands = ['#cc8855','#aa4422','#ddaa77','#bb5533','#cc8855','#eebb88','#aa4422'];
      const bandH = h / bands.length;
      bands.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, i*bandH, w, bandH+1); });
      _speckle(ctx, w, h, 150, () => 'rgba(255,255,255,0.08)', [10, 30]);
      ctx.fillStyle = '#cc4422';
      ctx.beginPath(); ctx.ellipse(w*0.3, h*0.62, 38, 20, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(80,20,10,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(w*0.3, h*0.62, 38, 20, 0, 0, Math.PI*2); ctx.stroke();
      break;
    }
    case 'Saturn': {
      const bands = ['#ddc17a','#c9a55a','#e0c98a','#ccaa66','#ddc17a'];
      const bandH = h / bands.length;
      bands.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, i*bandH, w, bandH+1); });
      break;
    }
    case 'Sun': {
      ctx.fillStyle = '#ffdd33'; ctx.fillRect(0, 0, w, h);
      _speckle(ctx, w, h, 800, () => `rgba(255,${180+Math.random()*60|0},${20+Math.random()*40|0},0.15)`, [3, 9]);
      for (let i = 0; i < 6; i++) {
        const x = Math.random()*w, y = Math.random()*h, r = 6 + Math.random()*10;
        ctx.fillStyle = 'rgba(120,50,10,0.6)'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(60,20,5,0.5)';   ctx.beginPath(); ctx.arc(x,y,r*0.5,0,Math.PI*2); ctx.fill();
      }
      break;
    }
    case 'Moon': {
      ctx.fillStyle = '#b5b4a5'; ctx.fillRect(0, 0, w, h);
      _speckle(ctx, w, h, 250, () => 'rgba(120,118,105,0.5)', [3, 10]);
      break;
    }
    case 'Neptune': {
      ctx.fillStyle = '#1a2d9a'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < h; i += 18) {
        ctx.fillStyle = (i / 18) % 2 ? 'rgba(30,50,160,0.3)' : 'rgba(60,80,200,0.3)';
        ctx.fillRect(0, i, w, 9);
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(w*0.65, h*0.4, 10, 6, 0, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'Red Dwarf': {
      ctx.fillStyle = '#cc2200'; ctx.fillRect(0, 0, w, h);
      _speckle(ctx, w, h, 600, () => `rgba(255,${60+Math.random()*60|0},${20+Math.random()*30|0},0.18)`, [3, 8]);
      break;
    }
    case 'Giant Star': {
      ctx.fillStyle = '#ffbb33'; ctx.fillRect(0, 0, w, h);
      _speckle(ctx, w, h, 700, () => `rgba(255,${200+Math.random()*55|0},${100+Math.random()*80|0},0.15)`, [4, 12]);
      break;
    }
    case 'Asteroid': {
      ctx.fillStyle = '#706e63'; ctx.fillRect(0, 0, w, h);
      _speckle(ctx, w, h, 300, () => 'rgba(60,58,50,0.5)', [3, 9]);
      break;
    }
    default:
      _planetTextureCache[name] = null;
      return null;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  _planetTextureCache[name] = tex;
  return tex;
}

class Body {
  constructor(pos, vel, mass, color, name, radius) {
    this.pos   = pos.clone();
    this.vel   = vel.clone();
    this.mass  = mass;
    this.color = color;
    this.acc   = new THREE.Vector3();
    this.id    = Math.random().toString(36).slice(2, 8);
    this.name  = name || tierFromMass(mass).label;
    this.trail = [];
    this._tick = 0;
    this._type = classifyType(mass, this.name);

    // Visual radius: explicit override (presets) > type-aware compute
    this._r = radius != null ? Math.max(2, radius) : this._computeRadius();

    this._spawnT    = 0;   // 0→1 spawn scale-in animation
    this._pulseT    = -1;  // merge glow pulse (-1 = inactive)
    this._noCollide = false; // ghost mode: skip all collision checks
    this._collapsing  = false; // gravitational-collapse animation active?
    this._collapseT   = 0;     // 0→1 progress through the collapse
    this._totalDV     = 0;     // cumulative |Δv| applied via WASD thrust

    // Axial spin — tilted slightly off vertical so it reads visually,
    // magnitude set by type (see _spinRateFor). Angular momentum (L = Iω)
    // is conserved across merges in checkCollisions().
    this.spinAxis = new THREE.Vector3(
      (Math.random() - 0.5) * 0.3, 1, (Math.random() - 0.5) * 0.3
    ).normalize();
    this.spinRate = this._spinRateFor(this._type, this._r) * (Math.random() < 0.5 ? -1 : 1);

    this._buildMesh();
    this._buildTrail();
    this._buildVectors();
    this._buildLabel();
    this._buildAccretionDisk();
    this.mesh.scale.setScalar(0.01); // start tiny, spawn animation grows it
  }

  // Compute glow parameters based on mass tier.
  // Stars use AdditiveBlending so the glow adds light rather than blending.
  // Black holes get a dark shroud + a bright gravitational lensing ring.
  // starGlowMult (user-adjustable via the Star Glow slider) scales both
  // the radius and opacity of STELLAR/black-hole glows only — ordinary
  // planet glow is unaffected.
  _glowParams() {
    const isBlackHole = this._type === 'blackhole';
    const isStellar   = this._type === 'star' || this._type === 'neutron';
    const massT       = Math.min(1, (Math.log10(Math.max(this.mass, 100)) - 2) / 4);
    const glowMult    = (isStellar || isBlackHole) ? starGlowMult : 1;
    return {
      radMult:  (isBlackHole ? 5       : isStellar ? 3 + massT * 5       : 2.5) * glowMult,
      opacity:  (isBlackHole ? 0.45    : isStellar ? 0.08 + massT * 0.22 : 0.03 + massT * 0.05) * glowMult,
      blending: isStellar   ? THREE.AdditiveBlending : THREE.NormalBlending,
      isBlackHole,
    };
  }

  // Type-aware radius using real mass-radius relations, anchored to the
  // SAME real-world scale as the named presets (Earth=11, Jupiter=120.7,
  // Sun=1202 — see BODY_PRESETS in 10-presets.js) so a merge result sits
  // at a believable size next to a placed preset of similar mass, instead
  // of popping out at some unrelated compact scale:
  //
  //   Black hole — Schwarzschild radius is EXACTLY linear in mass
  //   (Rs = 2GM/c²). No log, no plateau — just R ∝ M. Anchored so our
  //   heaviest named black hole preset (50 M☉) lands near its real ~147 km
  //   Schwarzschild radius (≈0.25 units before the visibility floor).
  //
  //   Neutron star — real neutron-star mass-radius curves are nearly FLAT,
  //   and slightly INVERTED (a more massive neutron star is slightly
  //   *smaller* because gravity compresses the degenerate matter further).
  //   Real neutron stars are ~11 km regardless of mass — at this engine's
  //   scale that's sub-floor for any mass, so the curve barely moves.
  //
  //   Star (main sequence) — R ∝ M^0.8 below 1 M☉, R ∝ M^0.57 above it
  //   (low-mass stars are nearly homologous; radiation pressure flattens
  //   the relation for higher-mass stars).
  //
  //   Planet — rocky bodies compress under self-gravity (R ∝ M^0.27ish);
  //   gas giants are supported by electron degeneracy pressure once they
  //   exceed roughly a Jupiter mass, so radius actually peaks around
  //   1–4 Jupiter masses and *decreases* for anything heavier (same
  //   physics as brown dwarfs).
  _computeRadius() {
    // Black hole — Schwarzschild radius really is exactly linear in mass.
    // Calibrated so the 50 M☉ preset (mass 5,000,000) lands at its real
    // ≈0.25-unit Schwarzschild radius before the visibility floor.
    if (this._type === 'blackhole') {
      return Math.max(1, 0.25 * (this.mass / 5000000));
    }
    // Neutron star — nearly flat/slightly inverted, and always tiny at
    // this scale (a real ~11 km neutron star is sub-floor regardless of
    // mass), so this mostly just sits at the visibility floor.
    if (this._type === 'neutron') {
      return Math.max(1, 1.3 - Math.log10(Math.max(this.mass, NEUTRON_MASS_MIN) / NEUTRON_MASS_MIN) * 0.15);
    }
    // Star — main-sequence mass-radius relation: R ∝ M^0.8 below 1 M☉
    // (roughly homologous), R ∝ M^0.57 above it (radiation pressure flattens
    // the relation for higher-mass stars).
    if (this._type === 'star') {
      const M_SUN_EQUIV = 1033000, R_SUN_EQUIV = 1202;
      const ratio = this.mass / M_SUN_EQUIV;
      return Math.max(8, R_SUN_EQUIV * Math.pow(ratio, ratio <= 1 ? 0.8 : 0.57));
    }
    // Planet — rocky bodies follow R ∝ M^0.27 (compression under
    // self-gravity flattens the naive M^0.33 cube root). Ice/gas giants are
    // far less dense, so radius jumps noticeably at the rocky→giant
    // boundary even though mass only rose a little; above ~1 Jupiter-
    // equivalent, degeneracy pressure makes heavier gas giants/brown
    // dwarfs actually shrink slightly (R ∝ M^-0.04).
    const M_EARTH_EQUIV = 6000,  R_EARTH_EQUIV = 11;
    const M_JUP_EQUIV   = 61400, R_JUP_EQUIV   = 120.7;
    if (this.mass < M_EARTH_EQUIV * 1.8) {
      return Math.max(1, R_EARTH_EQUIV * Math.pow(this.mass / M_EARTH_EQUIV, 0.27));
    }
    const ratio = this.mass / M_JUP_EQUIV;
    return ratio < 1
      ? R_JUP_EQUIV * Math.pow(ratio, 0.13)   // ice/gas giant, rising toward the peak
      : R_JUP_EQUIV * Math.pow(ratio, -0.04); // degeneracy-pressure turnover
  }

  // Gravitational collapse: if a body's radius is set (via the Size
  // slider/buttons) to far more than its mass could physically support —
  // i.e. its density is way below what self-gravity needs to hold a body
  // of that mass together at that size — it collapses down to its natural
  // radius. Real basis: this is exactly what happens to an overly diffuse
  // gas cloud or a star that's lost its internal pressure support; nothing
  // in nature stays puffy forever if it's gravitationally unbound to do so.
  _checkCollapse() {
    if (this._collapsing) {
      this._collapseT = Math.min(1, this._collapseT + 0.05);
      const ease = 1 - Math.pow(1 - this._collapseT, 3); // cubic ease-out
      this._r = this._collapseFrom + (this._collapseTo - this._collapseFrom) * ease;
      this._applyRadiusGeometry();
      if (this._collapseT >= 1) {
        this._r = this._collapseTo;
        this._applyRadiusGeometry();
        this._collapsing = false;
      }
      return;
    }
    const natural = this._computeRadius();
    if (this._r > natural * COLLAPSE_RATIO) {
      this._collapsing    = true;
      this._collapseT      = 0;
      this._collapseFrom   = this._r;
      this._collapseTo     = natural;
      createCollapseFlash(this.pos, this._r, this.color);
      playCollisionSound(this.mass);
    }
  }

  // Real-ish spin period heuristics (purely visual, but the ORDERING is
  // physically motivated): compact objects spin fastest (pulsars complete
  // a rotation in milliseconds), then gas giants (Jupiter ≈10h), then
  // rocky planets (Earth ≈24h), then stars (slow, large moment of inertia).
  _spinRateFor(type, radius) {
    const base = {
      blackhole: 0.10, neutron: 0.16, planet: 0.018, star: 0.004,
    }[type] ?? 0.01;
    // Smaller bodies of the same type spin a bit faster (visually reads
    // as "denser things spin faster" — true for accretion-spun-up objects).
    return base * (10 / Math.max(radius, 4));
  }

  // "Easier Visuals" mode: a multiplier applied to mesh.scale so the
  // RENDERED radius follows a log of the true radius — small planets grow,
  // giant stars shrink, compressing a ~6000x size range down to ~4x so
  // everything is visible at once. Purely cosmetic: physics, collisions,
  // and the grav well all keep using the true this._r.
  //
  // easyVisualsBlend (0→1, eased toward the easyVisuals toggle every frame
  // in animate()) interpolates smoothly between true scale and full
  // log-compression instead of snapping instantly.
  _displayScale() {
    if (easyVisualsBlend <= 0) return 1;
    // displayR = 22 * (log10(r) + 1), floored at 6. Scale = displayR / r.
    const displayR  = Math.max(6, 22 * (Math.log10(Math.max(this._r, 1)) + 1));
    const fullScale = displayR / this._r;
    return 1 + (fullScale - 1) * easyVisualsBlend;
  }

  // Applies spawn-in ease × the (possibly mid-transition) display scale to
  // mesh.scale. Split out from updateVisual() so the transition can keep
  // easing smoothly every render frame even while the sim is paused.
  _applyDisplayScale() {
    const spawnEase = 1 - Math.pow(1 - this._spawnT, 3);
    this.mesh.scale.setScalar(spawnEase * this._displayScale());
  }

  _buildMesh() {
    // Named presets with a recognisable surface get a procedural texture
    // (Jupiter's bands, Earth's continents, etc); everything else stays flat.
    const tex = getPlanetTexture(this.name);
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(this._r, 32, 20),
      tex ? new THREE.MeshBasicMaterial({ map: tex })
          : new THREE.MeshBasicMaterial({ color: new THREE.Color(this.color) })
    );
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);

    // Glow sphere â€” radius and opacity scale with mass
    const gp = this._glowParams();
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(this._r * gp.radMult, 16, 10),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.color), transparent: true,
        opacity: gp.opacity, blending: gp.blending, depthWrite: false,
      })
    );
    this.mesh.add(this.glow);

    // Black hole: bright photon-sphere lensing ring at the event horizon edge
    this.lensingRing = null;
    if (gp.isBlackHole) {
      this.lensingRing = new THREE.Mesh(
        new THREE.RingGeometry(this._r * 1.6, this._r * 2.5, 64),
        new THREE.MeshBasicMaterial({
          color: 0x9966ff, transparent: true, opacity: 0.55,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      this.lensingRing.rotation.x = Math.PI / 2;
      this.mesh.add(this.lensingRing);
    }

    // Wireframe ring shown when the body is selected
    this.selRing = new THREE.Mesh(
      new THREE.SphereGeometry(this._r * 2.2, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true, transparent: true, opacity: 0 })
    );
    this.mesh.add(this.selRing);

    // Saturn planetary ring system (B ring + Cassini gap + A ring)
    this.saturnRings = null;
    if (this.name === 'Saturn') {
      const axialTilt = THREE.MathUtils.degToRad(27);
      const makeRing = (innerMult, outerMult, color, opacity) => {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(this._r * innerMult, this._r * outerMult, 96),
          new THREE.MeshBasicMaterial({
            color, transparent: true, opacity,
            side: THREE.DoubleSide, depthWrite: false,
          })
        );
        // Lie flat in XZ plane then tilt by Saturn's axial tilt
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = axialTilt;
        this.mesh.add(ring);
        return ring;
      };
      this.saturnRings = [
        makeRing(1.18, 1.55, 0xddc17a, 0.85), // B ring — bright inner
        makeRing(1.65, 2.05, 0xb89a3a, 0.55), // A ring — dimmer outer (gap = Cassini division)
      ];
    }
  }

  // Spinning particle disk for neutron stars and black holes (mass >= 700 000).
  // Particles cluster toward the inner edge; color runs hot-white â†’ orange â†’ red.
  _buildAccretionDisk() {
    if (this._type !== 'blackhole' && this._type !== 'neutron') return;
    const isBH   = this._type === 'blackhole';
    const innerR = this._r * (isBH ? 3.5 : 2.5);
    const outerR = this._r * (isBH ? 14  : 8);
    const count  = isBH ? 2500 : 1200;

    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Power distribution clusters more particles near the inner edge
      const r     = innerR + Math.pow(Math.random(), 1.5) * (outerR - innerR);
      const angle = Math.random() * Math.PI * 2;
      const thick = this._r * 0.35 * (r / outerR); // disk gets thinner toward the edge

      positions[i * 3]     = Math.cos(angle) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * thick;
      positions[i * 3 + 2] = Math.sin(angle) * r;

      const t = (r - innerR) / (outerR - innerR); // 0 = inner (hot), 1 = outer (cool)
      if (isBH) {
        colors[i * 3]     = 1.0;
        colors[i * 3 + 1] = Math.max(0, 0.85 - t * 0.75);
        colors[i * 3 + 2] = Math.max(0, 0.6  - t * 1.2);
      } else {
        // Neutron star: cooler blue-white
        colors[i * 3]     = 0.7 + (1 - t) * 0.3;
        colors[i * 3 + 1] = 0.75 + (1 - t) * 0.2;
        colors[i * 3 + 2] = 1.0;
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

    this.diskMesh = new THREE.Points(g, new THREE.PointsMaterial({
      size: isBH ? 2.2 : 1.5, vertexColors: true,
      transparent: true, opacity: isBH ? 0.75 : 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.diskMesh.position.copy(this.pos);
    // Slight random tilt so every body looks unique
    this.diskMesh.rotation.x = (Math.random() - 0.5) * 0.3;
    this.diskMesh.rotation.z = (Math.random() - 0.5) * 0.3;
    scene.add(this.diskMesh);
    this._diskRotSpeed = isBH ? 0.006 : 0.013;
  }

  _buildTrail() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));
    g.setDrawRange(0, 0);
    this.trailLine = new THREE.Line(
      g,
      new THREE.LineBasicMaterial({ color: new THREE.Color(this.color), transparent: true, opacity: .55 })
    );
    scene.add(this.trailLine);
  }

  _buildVectors() {
    this.velArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), this.pos, 20, 0x00ff66, 8, 5);
    this.accArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), this.pos, 20, 0xff4400, 8, 5);
    this.velArrow.visible = false;
    this.accArrow.visible = false;
    scene.add(this.velArrow);
    scene.add(this.accArrow);
  }

  _buildLabel() {
    this.labelEl = document.createElement('div');
    this.labelEl.className   = 'blabel';
    this.labelEl.textContent = this.name;
    this.labelEl.style.color = this.color;
    this.labelEl.style.display = 'none';
    document.getElementById('labels').appendChild(this.labelEl);
  }

  // Rebuilds mesh/selRing/glow geometry from the CURRENT this._r, without
  // recomputing it from mass. Shared by rebuildMesh() (merge — recomputes
  // _r first) and the gravitational-collapse animation (interpolates _r
  // toward its natural value frame-by-frame, see _checkCollapse()).
  _applyRadiusGeometry() {
    this.mesh.geometry.dispose();
    this.mesh.geometry    = new THREE.SphereGeometry(this._r, 20, 14);
    this.selRing.geometry.dispose();
    this.selRing.geometry = new THREE.SphereGeometry(this._r * 2.2, 12, 8);
    const gp = this._glowParams();
    this.glow.geometry.dispose();
    this.glow.geometry          = new THREE.SphereGeometry(this._r * gp.radMult, 16, 10);
    this.glow.material.opacity  = gp.opacity;
    this.glow.material.blending = gp.blending;
  }

  // Rebuild geometry after a collision merge (mass and radius change).
  // Re-evaluates glow parameters so a body that merges into a star gets
  // the correct additive stellar glow.
  rebuildMesh() {
    this._r = this._computeRadius();
    this._applyRadiusGeometry();
    // Push updated body color into the mesh material (type transitions recolor)
    this.mesh.material.color.set(this.color);
    this.glow.material.color.set(this.color);
    if (this.trailLine) this.trailLine.material.color.set(this.color);
    const gp = this._glowParams();

    // Remove Saturn rings on merge (name changes, rings no longer apply)
    if (this.saturnRings) {
      this.saturnRings.forEach(r => { this.mesh.remove(r); r.geometry.dispose(); r.material.dispose(); });
      this.saturnRings = null;
    }

    // Add lensing ring if this merge created a black hole
    if (gp.isBlackHole && !this.lensingRing) {
      this.lensingRing = new THREE.Mesh(
        new THREE.RingGeometry(this._r * 1.6, this._r * 2.5, 64),
        new THREE.MeshBasicMaterial({
          color: 0x9966ff, transparent: true, opacity: 0.55,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      this.lensingRing.rotation.x = Math.PI / 2;
      this.mesh.add(this.lensingRing);
    }

    // Rebuild accretion disk with updated radius (also creates one if mass crossed threshold)
    if (this.diskMesh) {
      scene.remove(this.diskMesh);
      this.diskMesh.geometry.dispose();
      this.diskMesh.material.dispose();
      this.diskMesh = null;
    }
    this._buildAccretionDisk();
  }

  updateVisual() {
    this.mesh.position.copy(this.pos);

    // â”€â”€ Axial Spin (angular momentum is conserved on merge) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.mesh.rotateOnAxis(this.spinAxis, this.spinRate);

    // â”€â”€ Gravitational Time Dilation (weak-field analog) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 1 = normal, →0.15 deep in a well. Cheap O(N) per body; only bodies
    // close to a neutron star/black hole see a meaningful departure from 1.
    this._dilation = (bodies.length > 1) ? timeDilationAt(this.pos, this) : 1;

    // â”€â”€ Gravitational Collapse (too little mass to hold up its own size) â”€â”€
    this._checkCollapse();

    // â”€â”€ Spawn scale-in Ã— display scale â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // _spawnT is advanced and applied to mesh.scale unconditionally every
    // render frame in animate() (see _applyDisplayScale()), not just here —
    // that keeps both the spawn-in and the Easier Visuals transition
    // animating smoothly even while paused. This call just keeps it in
    // sync on frames where the physics tick also runs.
    this._applyDisplayScale();

    // â”€â”€ Merge glow pulse (scale glow up then back) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (this._pulseT >= 0) {
      this._pulseT = Math.min(1, this._pulseT + 0.035);
      // bell curve: rises to peak at t=0.4, back to 1 at t=1
      const p = Math.sin(this._pulseT * Math.PI);
      this.glow.scale.setScalar(1 + p * 1.8);
      this.glow.material.opacity = this._glowParams().opacity * (1 + p * 2.5);
      if (this._pulseT >= 1) {
        this.glow.scale.setScalar(1);
        this.glow.material.opacity = this._glowParams().opacity;
        this._pulseT = -1;
      }
    }

    // â”€â”€ Accretion Disk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (this.diskMesh) {
      this.diskMesh.position.copy(this.pos);
      this.diskMesh.rotation.y += this._diskRotSpeed;
    }

    // â”€â”€ Trail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (showTrails) {
      this._tick++;
      // Sample every other frame normally; deep time dilation thins the
      // trail further — fewer recorded points reads as "time slowing down"
      // for an object skimming close to a compact object.
      const sampleEvery = Math.max(2, Math.round(2 / this._dilation));
      if (this._tick % sampleEvery === 0) {
        this.trail.push(this.pos.clone());
        if (this.trail.length > trailLen) this.trail.shift();
      }
      const arr = this.trailLine.geometry.attributes.position.array;
      const n   = Math.min(this.trail.length, MAX_TRAIL);
      for (let i = 0; i < n; i++) {
        arr[i * 3]     = this.trail[i].x;
        arr[i * 3 + 1] = this.trail[i].y;
        arr[i * 3 + 2] = this.trail[i].z;
      }
      this.trailLine.geometry.attributes.position.needsUpdate = true;
      this.trailLine.geometry.setDrawRange(0, n);
    } else {
      this.trailLine.geometry.setDrawRange(0, 0);
    }

    // â”€â”€ Velocity / Acceleration Arrows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.velArrow.visible = showVectors;
    this.accArrow.visible = showVectors;
    if (showVectors) {
      const vl = this.vel.length();
      if (vl > 0.01) {
        this.velArrow.position.copy(this.pos);
        this.velArrow.setDirection(this.vel.clone().normalize());
        this.velArrow.setLength(Math.max(15, Math.min(vl * .4, 120)), 10, 6);
      }
      const al = this.acc.length();
      if (al > 0.0001) {
        this.accArrow.position.copy(this.pos);
        this.accArrow.setDirection(this.acc.clone().normalize());
        this.accArrow.setLength(Math.max(15, Math.min(al * 80, 100)), 10, 6);
      }
    }

    // â”€â”€ Selection Ring (animated pulse) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const isSelected = selectedBody === this || selectedBodies.has(this);
    this.selRing.material.color.set(selectedBodies.size > 1 && selectedBodies.has(this) ? 0x00ffff : 0xffaa00);
    this.selRing.material.opacity = isSelected
      ? (.4 + .4 * Math.sin(Date.now() * .005))
      : 0;

    // â”€â”€ Floating Label â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.labelEl.textContent   = this.name;
    this.labelEl.style.display = showLabels ? 'block' : 'none';
    // Gravitational redshift cue: tint the label toward deep red as the
    // body sits deeper in a well (this._dilation → 0.15).
    if (this._dilation < 0.97) {
      const redshift = 1 - this._dilation;
      this.labelEl.style.color = new THREE.Color(this.color).lerp(new THREE.Color(0xff2200), redshift * 0.8).getStyle();
    } else {
      this.labelEl.style.color = this.color;
    }
    if (showLabels) {
      // Offset by the DISPLAYED radius (true radius × display scale), so the
      // label sits just above the rendered sphere in either visual mode.
      const dispR = this._r * this._displayScale();
      const v = this.pos.clone().project(camera);
      this.labelEl.style.left = ((v.x * .5 + .5) * innerWidth) + 'px';
      this.labelEl.style.top  = ((-v.y * .5 + .5) * innerHeight - dispR * 2 - 6) + 'px';
    }
  }

  // Remove all Three.js objects and the DOM label from the scene
  remove() {
    scene.remove(this.mesh);
    scene.remove(this.trailLine);
    scene.remove(this.velArrow);
    scene.remove(this.accArrow);
    this.mesh.geometry.dispose();
    this.trailLine.geometry.dispose();
    this.labelEl.remove();
    if (this.diskMesh) {
      scene.remove(this.diskMesh);
      this.diskMesh.geometry.dispose();
      this.diskMesh.material.dispose();
    }
  }
}
