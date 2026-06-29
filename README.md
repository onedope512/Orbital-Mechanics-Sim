# Orbital Mechanics Simulator

A real-time N-body gravitational simulator running entirely in the browser — no build step, no dependencies beyond Three.js r134. Place stars, planets, black holes, and watch them interact under Newtonian gravity with a physically accurate integrator.

---

## How to Run

1. Clone or download the folder.
2. Open `orbital_simulator.html` in any modern browser.
3. That's it. No server, no npm, no compilation.

Three files make up the entire project:

| File | Purpose |
|---|---|
| `orbital_simulator.html` | Page structure, UI panels, tutorial modal |
| `orbital_simulator.css` | All styles and CSS animations |
| `orbital_simulator.js` | Physics engine, rendering, interaction (~2400 lines) |

Three.js r134 is loaded from a CDN directly in the HTML.

---

## Feature Overview

- **N-body gravity** — every body pulls every other body every frame
- **Symplectic leapfrog integrator** — energy-conserving; orbits stay stable indefinitely
- **Tidal disruption** — bodies shredded near black holes when inside the Roche limit
- **Gravitational well grid** — GPU vertex-shader mesh that physically deforms under mass
- **Procedural nebula** — full-sky GLSL shader using fractal Brownian motion
- **Accretion disks** — particle systems on neutron stars and black holes
- **Orbital prediction arc** — live ghost-body trajectory preview when placing a new body
- **Multi-select** — Shift+click to select many bodies; bulk delete
- **Preset scenarios** — Solar System, Binary Stars, Figure-8, Tidal Disruption Event, and more
- **Camera** — spherical orbit controls with zoom-to-cursor
- **World labels** — ORIGIN and CoM always projected on screen

---

## Physics Engine

### Newton's Law of Universal Gravitation

Every pair of bodies exerts a mutual gravitational force:

```
F = G * m1 * m2 / r^2
```

Rewritten as acceleration for body i due to body j:

```
a_i += G * mj * (rj - ri) / |rj - ri|^3
```

The simulator uses a scaled gravitational constant `G = 900` (instead of the real 6.674e-11) because the simulation units are not metres/kilograms — the scale is chosen so interesting orbits happen at distances of a few hundred units over a few seconds of real time.

In code (`accelInto`, line ~881):

```javascript
_rTmp.subVectors(positions[j], positions[i]);
const d = _rTmp.length();
out.addScaledVector(_rTmp, G * masses[j] / (d * d * d));
```

### The N-Body Problem

With N bodies, each body must sum the forces from all N-1 others. This is an O(N²) computation. For each physics sub-step the simulator:

1. Collects all positions and masses into arrays.
2. For every body i, iterates over every body j ≠ i and accumulates the acceleration.
3. Integrates the result.

There is no known general closed-form solution for N ≥ 3 — numerical integration is the only practical approach.

### Symplectic Leapfrog (Velocity-Verlet)

A naive Euler integrator (`x += v*dt`, `v += a*dt`) has a fatal flaw for orbital mechanics: it introduces energy *drift*. Orbits slowly spiral outward or inward and eventually escape or collapse — not because of any physical reason, but because the algorithm is dissipative.

The leapfrog integrator is **symplectic**, meaning it exactly conserves a *shadow Hamiltonian* (a slightly modified total energy). Real energy oscillates slightly but has no long-term drift, so orbits remain stable indefinitely.

The sequence per timestep:

```
1. half-kick:   v += a(x) * dt/2          (half velocity step with OLD acceleration)
2. drift:       x += v * dt               (full position step with NEW velocity)
3. recompute:   a = accel(x)              (evaluate forces at NEW position)
4. half-kick:   v += a(x) * dt/2          (half velocity step with NEW acceleration)
```

Why does this work? Steps 1+4 together form a full velocity step that straddles the position update. The force is evaluated at the midpoint between two velocity states, which is equivalent to the force being applied symmetrically in time — the hallmark of a symplectic (time-reversible) method.

In code (`stepLeapfrog`, line ~895):

```javascript
const hdt = dt * 0.5;
for (let i = 0; i < n; i++) bodies[i].vel.addScaledVector(bodies[i].acc, hdt);
for (let i = 0; i < n; i++) bodies[i].pos.addScaledVector(bodies[i].vel, dt);
// recompute at new positions
for (let i = 0; i < n; i++) accelInto(i, pos, ms, bodies[i].acc);
for (let i = 0; i < n; i++) bodies[i].vel.addScaledVector(bodies[i].acc, hdt);
```

The physics loop runs multiple sub-steps per animation frame (controlled by `simSpeed`) so the simulation can be sped up without sacrificing accuracy. Collision detection runs *inside* the sub-step loop, not once per frame — this prevents tunneling (two fast-moving bodies passing through each other between frames).

### Momentum and Energy Conservation on Collision

When two bodies collide they merge. The merged body's velocity is computed from conservation of linear momentum:

```
v_merged = (m1*v1 + m2*v2) / (m1 + m2)
```

Its position is the mass-weighted centroid:

```
r_merged = (m1*r1 + m2*r2) / (m1 + m2)
```

After a merge the total momentum of the system is unchanged. Kinetic energy is deliberately *not* conserved — this is an inelastic collision. The energy difference is released as the merge-glow visual effect.

### Centre of Mass

The system's centre of mass is:

```
CoM = sum(mi * ri) / sum(mi)
```

It is recomputed every frame and projected onto the screen as the `CoM` world label. In the absence of external forces, the CoM moves at constant velocity (it doesn't accelerate). The camera can be locked to follow it.

---

## Orbital Mechanics

### Circular Orbit Speed

For a body in a circular orbit of radius r around a central mass M, gravity provides the centripetal force:

```
G*M*m / r^2 = m*v^2 / r
=> v_circular = sqrt(G * M / r)
```

Preset scenarios use this formula to place planets in stable circular orbits.

### Vis-Viva Equation

For an elliptical orbit with semi-major axis a, the speed at any point where the body is distance r from the focus is:

```
v^2 = G * M * (2/r - 1/a)
```

This is derived from conservation of energy (kinetic + gravitational potential = constant along the orbit). The Tidal Disruption Event preset uses vis-viva to place a star at apoapsis (its farthest point) with exactly the right speed for the desired elliptical orbit:

```
a = (periR + apoR) / 2          (semi-major axis from peri- and apoapsis radii)
v_apo = sqrt(G * M * (2/apoR - 1/a))
```

The star then falls naturally toward the black hole and, on its first periapsis pass, crosses the Roche limit and is torn apart.

---

## Tidal Disruption and the Roche Limit

The **Roche limit** is the distance at which a body held together only by its own self-gravity will be shredded by tidal forces from a nearby massive object. The formula for a fluid (deformable) body is:

```
d_Roche = r_victim * (2 * M_dominant / m_victim)^(1/3)
```

Where:
- `r_victim` is the physical radius of the object being disrupted
- `M_dominant` is the mass of the disruptor (black hole / neutron star)
- `m_victim` is the mass of the object being disrupted

The physical intuition: the tidal force stretches the victim body along the line connecting them. When the differential gravity (the tidal force) across the victim's diameter exceeds its own self-gravity, it disintegrates.

In the simulator, the Roche check runs on every sub-step for any massive body (mass ≥ 700,000) against any non-debris target at least 800× lighter. When triggered, `tidalDisrupt()` spawns 18–30 debris fragments scattered along the orbital tangent direction with slight random velocity spreads. Each fragment gets the `_isDebris = true` flag so it cannot itself trigger another disruption (preventing a chain-reaction cascade).

---

## Gravitational Well Grid

The deforming grid is the most visually striking feature and runs entirely on the GPU.

### Vertex Shader

A large plane geometry (220×220 segments = ~48,400 vertices) is passed to a custom `ShaderMaterial`. The vertex shader receives the positions and masses of all bodies as uniform arrays. For each vertex it computes the gravitational field magnitude:

```glsl
float field = 0.0;
for (int i = 0; i < MAX_BODIES; i++) {
    vec2 d = bPos[i].xz - position.xz;
    float r2 = dot(d, d) + 1.0;
    field += 900.0 * bMass[i] / r2;
}
```

This is the gravitational potential per unit mass (Φ = Σ G*m/r) evaluated at the grid vertex's XZ position. The Y displacement is then:

```glsl
float excess = max(0.0, field - gwThresh);
float disp   = gwScale * log(1.0 + excess / gwThresh) / 2.303;
newPos.y     = -disp;
```

The logarithm is critical: without it, the well directly under a black hole would be thousands of units deep and the grid would be unusable. The log scale compresses the dynamic range so a small star makes a gentle dip and a black hole makes a dramatic but finite funnel.

### Fragment Shader

The fragment shader draws the grid lines using screen-space derivatives (`fwidth()`), which provide anti-aliasing automatically at any zoom level:

```glsl
vec2 grid = abs(fract(worldXZ / gridSpacing) - 0.5);
float line = min(grid.x, grid.y);
float fw   = fwidth(line);                         // pixel width of the line
float alpha = 1.0 - smoothstep(0.0, fw * 1.5, line - lineWidth);
```

`fwidth()` returns the sum of the absolute horizontal and vertical derivatives of its argument across neighbouring fragments. Dividing by this value normalises the anti-aliasing threshold to "one pixel wide regardless of zoom" — the grid looks equally sharp when zoomed in 1000× or zoomed out to see the whole universe.

A second, larger flat plane (200,000 × 200,000 units) sits beneath the deforming grid as the background. Both share the same uniform object by reference, so a single slider update propagates to both meshes instantly.

---

## Procedural Nebula Background

The sky background is a large sphere (radius 60,000 units, `BackSide` rendering so the camera sees the inside surface) with a custom GLSL `ShaderMaterial`.

### Fractal Brownian Motion (FBM)

The cloud texture is generated by layering multiple octaves of smooth noise:

```glsl
float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 7; i++) {
        v += a * noise(p);
        p *= 2.01;     // scale frequency up each octave
        a *= 0.5;      // scale amplitude down each octave
    }
    return v;
}
```

Each octave doubles the frequency and halves the amplitude. The result has detail at many scales simultaneously — small wisps nested inside larger clouds — which is what makes it look organic rather than smooth.

The underlying `noise()` function uses a `hash()` (a pseudo-random float from a 3D integer cell) plus trilinear interpolation between the 8 corners of a unit cube.

### Domain Warping

Plain FBM produces smooth clouds. Domain warping introduces the swirling, folded structure characteristic of nebulae:

```glsl
vec3 q = vec3(fbm(p),          fbm(p + vec3(1.7, 9.2, 3.1)),
              fbm(p + vec3(8.3, 2.8, 5.1)));
vec3 r = vec3(fbm(p + 4.0*q + vec3(1.7, 9.2, 3.1)),
              fbm(p + 4.0*q + vec3(8.3, 2.8, 5.1)),
              fbm(p + 4.0*q + vec3(0.1, 5.6, 2.2)));
float f = fbm(p + 4.0*r);
```

The trick: evaluate FBM at point `p` to get an offset vector `q`, then evaluate FBM again at `p + q` to get `r`, then evaluate FBM at `p + r`. Each stage feeds the previous stage's output back as a spatial distortion — this is domain warping. The result is that the noise "folds" on itself, creating the tendrils and filaments you see in real nebulae.

Five colours are blended based on the final noise value: deep purple → indigo → blue-purple → rose → pale gold. A `uTime` uniform drives slow coordinate drift so the nebula gently shifts over time.

---

## Mass Scale

The mass slider (1–100) maps to physical mass via an exponential (power-of-10) curve:

```javascript
mass = Math.pow(10, 2 + (sliderValue - 1) / 99 * 4)
// sliderValue=1   → mass 100      (asteroid)
// sliderValue=50  → mass ~10,000  (planet)
// sliderValue=100 → mass 1,000,000 (black hole)
```

An exponential scale is necessary because the physically interesting range spans four orders of magnitude. A linear slider would spend 99% of its range on uninteresting asteroid-mass bodies.

The visual radius scales as the cube root of mass:

```javascript
radius = Math.max(3, Math.cbrt(mass) * 0.55)
```

This mirrors how a real uniform-density sphere's radius scales with mass: `r ∝ m^(1/3)`.

---

## Trajectory Prediction

When the user is placing a new body (drag mode), a ghost trajectory arc is computed in real time. The predictor advances a copy of the ghost body together with copies of all real bodies using Euler integration (fast but approximate — only used for preview, not the real simulation):

```javascript
for (let step = 0; step < PRED_STEPS; step++) {
    // compute acceleration on ghost from all other bodies
    // advance ghost velocity and position by dt
    pts.push(ghostPos.clone());
    if (ghostPos.distanceToSquared(startPos) > 4e7) break;  // wandered too far
    if (ghostPos.lengthSq() > 9e7) break;                    // escaped the scene
}
```

The two distance limits prevent the arc from spiralling off into infinity when the ghost is on an escape trajectory or highly eccentric orbit. The result is drawn as a `THREE.Line` with a dashed appearance.

---

## Camera Controls

The camera orbits a target point in spherical coordinates (radius, theta, phi):

```
x = target.x + radius * sin(phi) * sin(theta)
y = target.y + radius * cos(phi)
z = target.z + radius * sin(phi) * cos(theta)
```

- **Left drag** — rotate: change theta (azimuth) and phi (polar)
- **Right drag / middle drag** — pan: translate `orbitTarget`
- **Scroll wheel** — zoom: scale `radius`

**Zoom-to-cursor**: instead of zooming toward the current target, the simulator fires a ray from the camera through the mouse position to the Y=0 plane, then lerps `orbitTarget` toward that hit point before scaling `radius`. This makes zoom behave like a camera dolly aimed at whatever is under the cursor.

---

## Visual Systems

### Glow Spheres

Each body has a transparent glow mesh slightly larger than the body sphere. Stars use `AdditiveBlending` (glow adds light to whatever is behind it, making stars look luminous). Planets use `NormalBlending` (softer halo effect). Black holes use a large semi-transparent dark shroud.

### Accretion Disks

For bodies with mass ≥ 700,000, a `THREE.Points` particle system is built with positions sampled from a disk distribution:

```javascript
const r = innerR + Math.pow(Math.random(), 1.5) * (outerR - innerR);
```

The `Math.pow(_, 1.5)` bias clusters particles toward the inner (hotter, brighter) edge. Vertex colors run white → orange → red from inner to outer. The disk mesh rotates each frame around the body's Y axis.

### Impact Flashes

Collisions trigger a brief expanding ring of `THREE.Points` at the merge point. Particles fly outward then fade over ~60 frames.

### Merge Glow Pulse

When a collision merge occurs, the surviving body's `_pulseT` is set to 0. Each frame, `_pulseT` advances from 0 to 1 and drives a sine-bell curve:

```javascript
const p = Math.sin(this._pulseT * Math.PI);  // 0 → 1 → 0
this.glow.scale.setScalar(1 + p * 1.8);
this.glow.material.opacity = baseOpacity * (1 + p * 2.5);
```

This produces a single bloom-and-fade that lasts about 30 frames without any CSS or post-processing.

### Selection Ring

A wireframe sphere slightly larger than the body sphere sits as a child of the body's mesh. Its opacity pulses using `Math.sin(Date.now() * 0.005)` so it visibly throbs. Multi-selected bodies get a cyan ring; the primary selection gets orange.

---

## UI Architecture

### World Labels

ORIGIN and CoM are HTML `<div>` elements positioned in screen space each frame. A `projectToScreen` helper converts a world-space 3D point to NDC then to CSS pixel coordinates:

```javascript
const v = worldPos.clone().project(camera);
el.style.left = ((v.x * 0.5 + 0.5) * innerWidth)  + 'px';
el.style.top  = ((v.y * -0.5 + 0.5) * innerHeight) + 'px';
```

NDC X runs -1 (left) to +1 (right); NDC Y runs -1 (bottom) to +1 (top) — the -0.5 flip converts to CSS where Y=0 is the top. If the projected Z > 1, the point is behind the camera and the element is hidden.

### CSS Animations

All UI transitions use `@keyframes` with `animation-fill-mode: both` so the start state is applied immediately without a flicker:

- **Tutorial fade-in**: `tutBoxIn` scales from 88% to 100% and fades in over 0.45s
- **Tab crossfade**: opacity 0 → 1 over 0.18s on `.tpage` activation
- **Body list slide-in**: `bitemIn` translates from -12px to 0 per list item, with nth-child stagger delays (1st item: 0ms, 2nd: 30ms, 3rd: 60ms, ...)
- **Button ripple**: `btnRipple` expands a box-shadow ring outward on `:active`
- **Spawn scale-in**: done in JavaScript (Three.js side), cubic ease-out over 25 frames
- **Status pop**: brief scale + opacity flash on the status bar text each time it updates

### Minimap

A small 2D canvas in the corner renders a top-down orthographic view of all bodies. Each body is a coloured dot scaled by mass, trails are drawn as thin lines. The minimap also shows the current camera frustum bounds as a rectangle.

---

## Preset Scenarios

| Scenario | What it demonstrates |
|---|---|
| Solar System | Circular orbits via vis-viva; inner rocky planets vs outer gas giants |
| Binary Stars | Two equal-mass stars in circular orbit around their shared CoM |
| Figure-8 | The famous three-body choreography; all three bodies follow the same path |
| Tidal Disruption Event | Star on a highly elliptical orbit falls past black hole, crosses Roche limit at periapsis |
| Galaxy Collision | Two disc galaxies approach; stars pass through without colliding but are gravitationally scattered |

---

## Known Limitations

- **O(N²) gravity**: adding 50+ bodies will slow the simulation. There is no Barnes-Hut tree or fast multipole optimisation.
- **No softening**: the minimum separation guard (`if (d < 0.5) continue`) prevents singularities but close encounters are not physically accurate.
- **Euler predictor**: the trajectory arc uses Euler integration (not leapfrog) for speed. It drifts for long arcs — treat it as an approximation.
- **No relativistic effects**: no gravitational lensing of light, no frame dragging, no gravitational waves. The black hole is purely Newtonian.
- **No collision resolution for small bodies**: two debris fragments that overlap simply pass through each other (no collision check between `_isDebris` bodies).

---

## Controls Reference

| Action | Control |
|---|---|
| Place body | Left-click empty space; drag to set velocity |
| Select body | Left-click a body |
| Multi-select | Shift+click bodies |
| Rotate camera | Left-drag empty space |
| Pan camera | Right-drag or middle-drag |
| Zoom | Scroll wheel |
| Follow body | Select body → Follow button |
| Lock to CoM | CoM Lock button |
| Centre on origin | C key |
| Pause/resume | Space or Pause button |
| Open tutorial | ? key |
| Delete selected | Delete key or Delete button |
| Bulk delete | Shift+select multiple → Delete |

---

## Building Further

The simulator is a single-page app with no framework. To extend it:

- **New body type**: add an entry to `BODY_PRESETS` with `n` (name), `e` (HTML entity icon), `mass`, `color`, and optionally `radius`.
- **New preset scenario**: add a case to the `loadScenario()` function in `orbital_simulator.js`.
- **New force**: add it inside `accelInto()` — it already loops over all pairs, so adding radiation pressure or magnetic fields is just an extra `addScaledVector` call.
- **Better integrator**: replace `stepLeapfrog` with a higher-order symplectic integrator (e.g. Yoshida 4th-order) for better energy conservation at large timesteps.
- **Performance**: implement Barnes-Hut tree (O(N log N)) for N > 100 bodies. The `accelInto` function is the natural replacement target.
