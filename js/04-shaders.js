/* =============================================================
   Background visuals — stars, nebula, gravity-well grid
   -------------------------------------------------------------
   Random starfield, FBM nebula sphere shader, GPU vertex-displaced grav-well grid (and its flat background twin), plus the persistent origin marker and centre-of-mass marker meshes.
   ============================================================= */// =============================================================
// STARS
// Randomly scattered points at a large radius for the background sky.
// =============================================================
// Background (stars, nebula, flat outer grid) scaled ~80x from its
// original size so it stays proportionally huge next to real-world body
// radii (a Giant Star preset is now 12,021 units — the old 60,000-unit
// nebula sphere was barely bigger than the star itself).
const BG_SCALE = 80;
// The INTERACTIVE displacement grid gets a smaller scale (8x, not 80x).
// It recentres on orbitTarget every frame (see render.js), so it only
// ever needs to comfortably contain whatever you're currently looking
// at — not the whole map. Scaling it the full 80x would balloon each
// grid cell to ~3,200 units, far too coarse to show an 11-unit Earth's
// well at all.
const WELL_GRID_SCALE = 8;
(function () {
  const pos = [];
  for (let i = 0; i < 12000; i++) {
    const r = (40000 + Math.random() * 30000) * BG_SCALE;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos.push(
      r * Math.sin(p) * Math.cos(t),
      r * Math.sin(p) * Math.sin(t),
      r * Math.cos(p)
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.5, sizeAttenuation: false })));
})();

// =============================================================
// NEBULA BACKGROUND
// A large inverted sphere rendered from the inside with a GLSL
// FBM (fractal Brownian motion) noise shader. Domain warping gives
// the swirly, layered look of real emission nebulae.
// A slow time uniform drifts the clouds so the background feels alive.
// =============================================================
const nebulaUni = { uTime: { value: 0 } };

const nebulaMat = new THREE.ShaderMaterial({
  uniforms: nebulaUni,
  side: THREE.BackSide,
  transparent: false,
  depthWrite: false,
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vDir;
    uniform float uTime;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i),               hash(i+vec3(1,0,0)), f.x),
            mix(hash(i+vec3(0,1,0)),   hash(i+vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i+vec3(0,0,1)),   hash(i+vec3(1,0,1)), f.x),
            mix(hash(i+vec3(0,1,1)),   hash(i+vec3(1,1,1)), f.x), f.y),
        f.z
      );
    }

    float fbm(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 7; i++) {
        v += a * noise(p);
        p = p * 2.1 + vec3(1.7, 9.2, 5.3);
        a *= 0.48;
      }
      return v;
    }

    void main() {
      float t = uTime * 0.00012;
      vec3 d = vDir;

      // Domain warping: warp the sample position by lower-frequency noise
      // so clouds curve and fold into each other.
      float n1 = fbm(d * 2.5 + vec3(t, t * 0.6, 0.0));
      float n2 = fbm(d * 2.5 + vec3(n1 * 1.4, 0.0, t * 0.4) + vec3(3.2, 1.7, 5.1));
      float cloud = fbm(d * 3.5 + vec3(n1 * 0.9, n2 * 1.1, t * 0.3) + vec3(8.3, 2.8, 0.6));

      // Second warp pass for finer detail in bright regions
      float detail = fbm(d * 6.0 + vec3(n2, cloud, n1) + vec3(t * 0.2, 5.5, 3.1));

      float density = pow(max(0.0, cloud - 0.28), 1.4) * 2.2;
      density += pow(max(0.0, detail - 0.38), 1.8) * 0.7;
      density = clamp(density, 0.0, 1.0);

      // Colour zones: purple pillars, blue wisps, pink emission, cyan ionisation, orange dust
      vec3 purple = vec3(0.30, 0.04, 0.55);
      vec3 blue   = vec3(0.02, 0.18, 0.72);
      vec3 pink   = vec3(0.75, 0.07, 0.40);
      vec3 cyan   = vec3(0.00, 0.55, 0.75);
      vec3 orange = vec3(0.65, 0.25, 0.03);

      vec3 col = mix(purple, blue,   clamp(n1 * 1.8, 0.0, 1.0));
      col      = mix(col,    pink,   clamp(n2 * 1.4 - 0.2, 0.0, 1.0));
      col      = mix(col,    cyan,   clamp(detail * 1.2 - 0.3, 0.0, 1.0));
      col      = mix(col,    orange, clamp(cloud * 0.9 - 0.5, 0.0, 1.0));

      // Bright highlights in densest regions
      col += vec3(0.3, 0.2, 0.5) * pow(max(0.0, density - 0.4), 2.0);

      // Sparse background tint so the whole sky has a faint colour even where density=0
      vec3 bgTint = mix(vec3(0.01, 0.0, 0.03), vec3(0.0, 0.01, 0.04), n1);
      col = mix(bgTint, col, density);

      gl_FragColor = vec4(col, 0.92);
    }
  `,
});

const nebulaSphere = new THREE.Mesh(new THREE.SphereGeometry(60000 * BG_SCALE, 64, 48), nebulaMat);
nebulaSphere.renderOrder = -1;
scene.add(nebulaSphere);

// =============================================================
// GRAVITATIONAL WELL GRID (GPU vertex-displaced mesh)
//
// The grid IS the grav well. The vertex shader sums G*m/rÂ² from
// every body and displaces Y downward. Only vertices where the
// total field exceeds gwThresh are displaced â€” the rest are free.
//
// Two meshes (both Ã—BG_SCALE so the map stays huge next to real-world
// body radii):
//   _gridMesh  â€” 16000Ã—16000 Ã— BG_SCALE, 220Ã—220 segments, follows
//                orbitTarget, carries the full grav-well displacement.
//   _gridBg    â€” 200000Ã—200000 Ã— BG_SCALE, 1 segment, flat background
//                grid that extends to the horizon.
// =============================================================

const GW_MAX_B    = 24;   // max bodies the shader supports (uniform array size)
let   showPotential = true;
let   gwThresh      = 71; // displacement threshold; lower = larger wells

// All uniforms for both grid materials â€” the background grid shares
// the same objects (by reference) so one slider update affects both.
const gwUni = {
  camPos:    { value: new THREE.Vector3() },
  fadeStart: { value: 3000  * BG_SCALE },   // camera distance at which grid starts to fade
  fadeEnd:   { value: 25000 * BG_SCALE },   // camera distance at which grid fully fades out
  gwEnabled: { value: 1.0   },
  gwThresh:  { value: 71    },
  // Maximum downward displacement in world units. Bumped ~17x (was 120) so
  // the well visibly dips next to real-world body radii — a 1,202-unit Sun
  // or 12,021-unit Giant Star would barely dent a 120-unit-deep well — and
  // reads as a genuinely extreme funnel rather than a gentle depression.
  gwScale:   { value: 2000.0 },
  gwSoft:    { value: 4.0   },   // visual softening radius (prevents infinite spike at origin)
  bPos:      { value: Array.from({ length: GW_MAX_B }, () => new THREE.Vector3()) },
  // Per-body real radius and a type-driven depth multiplier (see
  // bodyWellDepthMult() in 06-body.js) — replaces the old raw-mass-only
  // field formula, which sized the well purely off mass^1.5. Since mass
  // and radius now follow very different real-world curves per type
  // (rocky M^0.27 vs gas-giant M^0.13 vs star M^0.8 vs linear-mass black
  // hole), a mass-only formula made small planets' wells balloon WAY past
  // their own radius while a Giant Star's barely dented its own surface.
  // Normalizing distance by each body's OWN radius first, then applying a
  // separate depth multiplier, keeps every well's FOOTPRINT proportional
  // to that body (~4–7 body-radii for ordinary planets/stars) while still
  // letting compact objects (neutron star, black hole) reach dramatically
  // further relative to their own tiny size.
  bReach:    { value: new Array(GW_MAX_B).fill(0) },
  bDepth:    { value: new Array(GW_MAX_B).fill(0) },
  bIsBH:     { value: new Array(GW_MAX_B).fill(0) },
  gridAlpha: { value: 0.7   },   // grid line opacity multiplier (0â€“3+)
  gridMajor: { value: 100.0 },   // major grid line spacing in world units
  gridMinor: { value: 20.0  },   // minor grid line spacing in world units
};

// Vertex shader: computes gravitational field at each grid vertex
// and displaces it downward by a log-scaled amount.
const gravWellVertexShader = `
  uniform float gwEnabled, gwThresh, gwScale, gwSoft;
  uniform vec3  bPos[${GW_MAX_B}];
  uniform float bReach[${GW_MAX_B}];
  uniform float bDepth[${GW_MAX_B}];
  uniform float bIsBH[${GW_MAX_B}];
  varying vec3  vWorldPos;
  varying float vDepth;
  varying float vHoleFactor;

  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    float field      = 0.0;
    float holeFactor = 1.0;

    if (gwEnabled > 0.5) {
      for (int i = 0; i < ${GW_MAX_B}; i++) {
        if (bDepth[i] <= 0.0) continue;
        vec2  d  = vWorldPos.xz - bPos[i].xz;
        float br = max(bReach[i], 1.0);
        // Distance in units of THIS body's well REACH (its own radius for
        // ordinary bodies, a large floor for compact objects — see
        // bodyWellReach() in 06-body.js). Keeps the footprint proportional
        // to the body for planets/stars while still giving neutron stars
        // and black holes a large, deep well despite their tiny radius.
        float distNorm2 = (dot(d, d) + gwSoft * gwSoft) / (br * br);
        field += 1775.0 * bDepth[i] / max(distNorm2, 0.01);

        // Black holes only: punch a literal hole at the throat of the
        // funnel (within ~1.2–2.5 reach-units of the centre).
        if (bIsBH[i] > 0.5) {
          float distNorm = sqrt(distNorm2);
          holeFactor = min(holeFactor, smoothstep(1.2, 2.5, distNorm));
        }
      }
    }

    // Log-scale displacement: creates a sharp spike near singularities
    // without an upper saturation ceiling.
    float excess = max(0.0, field - gwThresh);
    float disp   = gwScale * log(1.0 + excess / gwThresh) / 2.303;
    vDepth       = clamp(disp / (gwScale * 4.0), 0.0, 1.0);
    vHoleFactor  = holeFactor;

    gl_Position = projectionMatrix * modelViewMatrix
                * vec4(position.x, position.y - disp, position.z, 1.0);
  }
`;

// Fragment shader: draws grid lines using screen-space derivatives (fwidth)
// for sub-pixel-accurate anti-aliased lines at any zoom level.
// Color blends from green (flat) through blue to white (deep well).
const gravWellFragmentShader = `
  uniform vec3  camPos;
  uniform float fadeStart, fadeEnd, gridAlpha, gridMajor, gridMinor;
  varying vec3  vWorldPos;
  varying float vDepth;
  varying float vHoleFactor;

  void main() {
    vec2 p = vWorldPos.xz;

    // Major grid lines
    vec2  g    = abs(fract(p / gridMajor + 0.5) - 0.5) / fwidth(p / gridMajor);
    float line = 1.0 - min(min(g.x, g.y), 1.0);

    // Minor grid lines (dimmer)
    vec2  g2    = abs(fract(p / gridMinor + 0.5) - 0.5) / fwidth(p / gridMinor);
    float line2 = (1.0 - min(min(g2.x, g2.y), 1.0)) * 0.25;

    // Distance fade so the grid doesn't clutter the far field
    float dist = length(vWorldPos.xz - camPos.xz);
    float fade = 1.0 - smoothstep(fadeStart, fadeEnd, dist);

    // Colour: flat = dark green, well = blueâ†’white
    vec3 flatCol = vec3(0.0, 0.4, 0.25);
    vec3 wellCol = mix(vec3(0.0, 0.15, 0.9), vec3(1.0, 1.0, 1.0), vDepth);
    vec3 col     = mix(flatCol, wellCol, clamp(vDepth * 2.0, 0.0, 1.0));

    float alpha = (line * 0.38 + line2 * 0.14) * fade * gridAlpha;

    // Literal hole: ONLY black holes punch a void through the grid
    // (vHoleFactor computed per-body in the vertex shader, gated on
    // bIsBH) — ordinary stars, even very deep ones, render a normal
    // closed funnel.
    alpha *= vHoleFactor;

    gl_FragColor = vec4(col, alpha);
  }
`;

const _gridMat = new THREE.ShaderMaterial({
  transparent:     true,
  depthWrite:      false,
  side:            THREE.DoubleSide,
  uniforms:        gwUni,
  vertexShader:    gravWellVertexShader,
  fragmentShader:  gravWellFragmentShader,
  extensions:      { derivatives: true },
});

// 420Ã—420 segments (was 220Ã—220) â€” far denser so the well reads as a
// smooth curved funnel instead of faceted triangles, especially right
// around a tiny, extremely deep black-hole/neutron-star spike.
const _gridMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(16000 * WELL_GRID_SCALE, 16000 * WELL_GRID_SCALE, 420, 420).rotateX(-Math.PI / 2),
  _gridMat
);
scene.add(_gridMesh);

// Background grid â€” flat, infinite-feeling plane beyond the displacement mesh.
// Shares gridAlpha/gridMajor/gridMinor uniforms by reference so sliders affect both.
const _gridBgMat = new THREE.ShaderMaterial({
  transparent:    true,
  depthWrite:     false,
  side:           THREE.DoubleSide,
  uniforms: {
    camPos:      gwUni.camPos,
    fadeStart:   { value: 3000  * BG_SCALE },
    fadeEnd:     { value: 25000 * BG_SCALE },
    gridAlpha:   gwUni.gridAlpha,
    gridMajor:   gwUni.gridMajor,
    gridMinor:   gwUni.gridMinor,
    // Footprint of the displacement grid (_gridMesh), updated every frame
    // in 12-render.js. The flat background grid renders identical lines
    // at identical world positions, so without this, the two grids'
    // alpha blended together inside that square — a visibly brighter
    // patch centred wherever the camera was looking (the "bright green
    // square" bug). Fading the background to 0 there, ramping back to
    // full just past the edge, removes the double-render with no seam.
    innerCenter: { value: new THREE.Vector2() },
    innerHalf:   { value: (16000 * WELL_GRID_SCALE) / 2 },
  },
  vertexShader: `
    varying vec3 vWorldPos;
    void main() {
      vWorldPos   = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3  camPos;
    uniform float fadeStart, fadeEnd, gridAlpha, gridMajor, gridMinor;
    uniform vec2  innerCenter;
    uniform float innerHalf;
    varying vec3  vWorldPos;
    void main() {
      vec2  p     = vWorldPos.xz;
      vec2  g     = abs(fract(p / gridMajor + 0.5) - 0.5) / fwidth(p / gridMajor);
      float line  = 1.0 - min(min(g.x, g.y), 1.0);
      vec2  g2    = abs(fract(p / gridMinor + 0.5) - 0.5) / fwidth(p / gridMinor);
      float line2 = (1.0 - min(min(g2.x, g2.y), 1.0)) * 0.25;
      float d     = length(vWorldPos.xz - camPos.xz);
      float fade  = 1.0 - smoothstep(fadeStart, fadeEnd, d);

      // Square (Chebyshev) distance from the displacement grid's centre —
      // 0 inside it, 1 once past its edge.
      vec2  rel       = abs(p - innerCenter);
      float innerDist = max(rel.x, rel.y);
      float innerFade = smoothstep(innerHalf * 0.92, innerHalf, innerDist);

      gl_FragColor = vec4(0.0, 0.4, 0.25, (line * 0.38 + line2 * 0.14) * fade * gridAlpha * innerFade);
    }
  `,
  extensions: { derivatives: true },
});

const _gridBg = new THREE.Mesh(
  new THREE.PlaneGeometry(200000 * BG_SCALE, 200000 * BG_SCALE, 1, 1).rotateX(-Math.PI / 2),
  _gridBgMat
);
_gridBg.position.y = -0.2; // slightly below the displacement mesh to avoid z-fighting
scene.add(_gridBg);

// â”€â”€ Origin Marker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// White dot + crosshair at (0, 0, 0) so the origin is always visible.
(function () {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(4, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  scene.add(dot);

  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-25, 0,   0), new THREE.Vector3(25, 0,  0),
    new THREE.Vector3(  0, 0, -25), new THREE.Vector3( 0, 0, 25),
  ]);
  scene.add(new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({ color: 0xffffff, opacity: .5, transparent: true })
  ));
})();

// â”€â”€ Center-of-Mass Marker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const comMesh = new THREE.Mesh(
  new THREE.SphereGeometry(3, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true })
);
comMesh.visible = false;
scene.add(comMesh);

const comLines = (() => {
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-15,  0,   0), new THREE.Vector3(15, 0,  0),
    new THREE.Vector3(  0, -15,  0), new THREE.Vector3( 0, 15, 0),
    new THREE.Vector3(  0,  0, -15), new THREE.Vector3( 0, 0, 15),
  ]);
  const l = new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({ color: 0xffffff, opacity: .5, transparent: true })
  );
  l.visible = false;
  scene.add(l);
  return l;
})();
