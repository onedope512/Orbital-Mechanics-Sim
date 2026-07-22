/* =============================================================
   Physics — gravity, leapfrog integrator, collisions, flashes
   -------------------------------------------------------------
   Velocity-Verlet integrator with Plummer-softened gravity, WASD thrust, perfect-inelastic merges with type transitions, Roche-limit tidal disruption, particle impact flashes, and the totalEnergy() drift readout.
   ============================================================= */// =============================================================
// PHYSICS â€” Velocity-Verlet (symplectic leapfrog)
//
// Symplectic integrators conserve a shadow Hamiltonian exactly,
// so energy oscillates around the true value rather than drifting.
// This keeps orbits stable indefinitely (unlike Euler or RK4).
//
// Sequence per step:
//   1. half-kick:  v += a * dt/2
//   2. drift:      x += v * dt
//   3. recompute:  a = accel(x)
//   4. half-kick:  v += a * dt/2
// =============================================================

const _rTmp = new THREE.Vector3(); // reused scratch vector to avoid GC pressure
const _vTmp = new THREE.Vector3();

// Plummer gravitational softening — caps acceleration at close range so a
// post-merge BH at tiny radius doesn't yeet nearby bodies into oblivion.
const SOFT_EPS2 = 36;  // ε² = 6 units

// Simplified 1PN (post-Newtonian) correction term — the leading-order GR
// effect responsible for perihelion precession (famously Mercury's 43
// arcsec/century). Real form: a_PN = (GM/(c²r²)) · [(4GM/r − v²)r̂ + 4(v·r̂)v].
// We don't have a literal speed of light in these abstract units, so PN_C2
// is a tuned stand-in for c². Calibrated so a_PN/a_Newton ≈ 3GM/(PN_C2·r):
// negligible for ordinary planets, but ~10–45% near a neutron star/black
// hole at close range — strong enough to visibly precess the orbit instead
// of tracing a fixed closed ellipse, without overpowering gravity itself.
const PN_C2 = 1.0e9;
function pnCorrection(rVec, d, vRel, srcMass, out) {
  const gm    = G * srcMass;
  const inv_r = 1 / d;
  const term  = gm / (PN_C2 * d * d);
  const rHat  = _rTmp.copy(rVec).multiplyScalar(inv_r);
  const vDotR = vRel.dot(rHat);
  out.addScaledVector(rHat, term * (4 * gm * inv_r - vRel.lengthSq()));
  out.addScaledVector(vRel, term * 4 * vDotR);
}

// vel/rad arrays are optional — when supplied, sources with a strong enough
// compactness (mass/radius) get a 1PN precession correction on top of
// Newtonian gravity. Cheap to skip for ordinary planet-planet interactions.
function accelInto(idx, positions, masses, out, velocities, radii) {
  out.set(0, 0, 0);
  const pi = positions[idx];
  for (let j = 0; j < positions.length; j++) {
    if (j === idx) continue;
    const dx = positions[j].x - pi.x, dy = positions[j].y - pi.y, dz = positions[j].z - pi.z;
    const d2raw = dx * dx + dy * dy + dz * dz;
    const d2    = d2raw + SOFT_EPS2;
    const dInv  = 1 / Math.sqrt(d2);
    out.x += dx * G * masses[j] * dInv * dInv * dInv;
    out.y += dy * G * masses[j] * dInv * dInv * dInv;
    out.z += dz * G * masses[j] * dInv * dInv * dInv;

    // Compactness gate: mass/radius ratio standing in for GM/(Rc²).
    // Threshold of 150,000 sits cleanly above even a puffy Giant Star
    // (~67,000) and below Neutron Star (~290,000) / Black Hole (~440,000+),
    // so only genuinely compact objects trigger the precession term.
    if (radii && velocities && radii[j] > 0 && masses[j] / radii[j] > 150000) {
      const d = Math.sqrt(d2raw + 1); // avoid singularity at d→0
      _vTmp.subVectors(velocities[idx], velocities[j]);
      pnCorrection(new THREE.Vector3(dx, dy, dz), d, _vTmp, masses[j], out);
    }
  }
}

// Recompute accelerations for all bodies from current positions.
// Must be called after every body addition/removal/merge.
function initAccelerations() {
  if (!bodies.length) return;
  const pos = bodies.map(b => b.pos);
  const ms  = bodies.map(b => b.mass);
  const vel = bodies.map(b => b.vel);
  const rad = bodies.map(b => b._r);
  for (let i = 0; i < bodies.length; i++) accelInto(i, pos, ms, bodies[i].acc, vel, rad);
}

function stepLeapfrog(dt) {
  const n   = bodies.length;
  if (!n) return;
  const hdt = dt * 0.5;

  for (let i = 0; i < n; i++) bodies[i].vel.addScaledVector(bodies[i].acc, hdt);  // half-kick
  for (let i = 0; i < n; i++) bodies[i].pos.addScaledVector(bodies[i].vel, dt);   // drift

  const pos = bodies.map(b => b.pos);
  const ms  = bodies.map(b => b.mass);
  const vel = bodies.map(b => b.vel);
  const rad = bodies.map(b => b._r);
  for (let i = 0; i < n; i++) accelInto(i, pos, ms, bodies[i].acc, vel, rad);     // recompute

  for (let i = 0; i < n; i++) bodies[i].vel.addScaledVector(bodies[i].acc, hdt);  // half-kick
  simTime += dt;
}

// WASD thrust for selected body/group. Applies to all selectedBodies when groupThrust is on,
// otherwise applies only to selectedBody.
function applyThrust(dt) {
  const targets = (groupThrust && selectedBodies.size > 1)
    ? [...selectedBodies]
    : (selectedBody ? [selectedBody] : []);
  if (!targets.length) return;

  let anyKey = false;
  const dv = +document.getElementById('sThrust').value * dt * 30;
  const camFwd = orbitTarget.clone().sub(camera.position);
  camFwd.y = 0;
  if (camFwd.lengthSq() < 0.0001) camFwd.set(0, 0, -1);
  camFwd.normalize();
  const camRight = new THREE.Vector3().crossVectors(camFwd, new THREE.Vector3(0, 1, 0)).normalize();
  for (const b of targets) {
    const vBefore = b.vel.length();
    if (keys['w'] || keys['W']) { b.vel.addScaledVector(camFwd,   dv); anyKey = true; }
    if (keys['s'] || keys['S']) { b.vel.addScaledVector(camFwd,  -dv); anyKey = true; }
    if (keys['a'] || keys['A']) { b.vel.addScaledVector(camRight, -dv); anyKey = true; }
    if (keys['d'] || keys['D']) { b.vel.addScaledVector(camRight,  dv); anyKey = true; }
    if (keys['q'] || keys['Q']) { b.vel.y +=  dv; anyKey = true; }
    if (keys['e'] || keys['E']) { b.vel.y -=  dv; anyKey = true; }
    if (anyKey) b._totalDV += Math.abs(b.vel.length() - vBefore);
  }
  if (anyKey) initAccelerations();
}

// Keplerian orbital elements of body b relative to its dominant attractor.
// Returns null if b is alone or too close to compute stably.
function computeOrbitalElements(b) {
  if (bodies.length < 2) return null;

  let attractor = null;
  for (const o of bodies) {
    if (o === b) continue;
    if (!attractor || o.mass > attractor.mass) attractor = o;
  }
  if (!attractor) return null;

  // Two-body gravitational parameter (includes both masses for accuracy)
  const mu   = G * (attractor.mass + b.mass);
  const rVec = new THREE.Vector3().subVectors(b.pos, attractor.pos);
  const vVec = new THREE.Vector3().subVectors(b.vel, attractor.vel);
  const r    = rVec.length();
  if (r < 1) return null;
  const v2 = vVec.lengthSq();
  const v  = Math.sqrt(v2);

  // Specific orbital energy ε = v²/2 − μ/r
  const eps = v2 * 0.5 - mu / r;

  // Specific angular momentum vector h = r × v
  const hVec = new THREE.Vector3().crossVectors(rVec, vVec);
  const h    = hVec.length();

  // Eccentricity vector: e = (v × h)/μ − r̂
  const eVec = new THREE.Vector3().crossVectors(vVec, hVec)
    .divideScalar(mu)
    .sub(rVec.clone().divideScalar(r));
  const e = eVec.length();

  // Inclination from the horizontal (XZ) plane — angle between h and +Y axis
  const inc = h > 0
    ? Math.acos(THREE.MathUtils.clamp(hVec.y / h, -1, 1)) * (180 / Math.PI)
    : 0;

  // Semi-major axis, period, and apsides (only for bound orbits)
  let a = null, period = null, rp = null, ra = null;
  if (Math.abs(eps) > 1e-12) a = -mu / (2 * eps);
  if (eps < 0 && a > 0) {
    period = 2 * Math.PI * Math.sqrt(a * a * a / mu);
    rp = a * (1 - e);
    ra = a * (1 + e);
  } else if (h > 0) {
    // Unbound orbit: periapsis from vis-viva at closest approach
    rp = h * h / (mu * (1 + Math.max(e, 1)));
  }

  // Escape speed and circular speed at current distance from attractor
  const vEsc  = Math.sqrt(2 * mu / r);
  const vCirc = Math.sqrt(mu / r);

  // Hill sphere radius: r_H = r·(m/3M)^(1/3) — valid when b.mass ≪ attractor.mass
  const hillR = b.mass < attractor.mass
    ? r * Math.pow(b.mass / (3 * attractor.mass), 1 / 3)
    : null;

  // Schwarzschild radius in sim units: r_s = 2Gm/c², using PN_C2 as c²
  const rs = b._type === 'blackhole' ? 2 * G * b.mass / PN_C2 : null;

  return { e, eps, h, inc, a, period, rp, ra, v, vEsc, vCirc, hillR, rs, r, attractor };
}

// Perfect inelastic collision â€” conserves momentum.
// Returns true if a merge/disruption happened (so the step loop can break early).
// Detection runs inside the physics sub-step loop to avoid tunneling.
function checkCollisions() {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const bi = bodies[i];
      const bj = bodies[j];
      if (bi._noCollide || bj._noCollide) continue;
      const dist = bi.pos.distanceTo(bj.pos);

      const [big, sml] = bi.mass >= bj.mass ? [i, j] : [j, i];
      const B = bodies[big];
      const S = bodies[sml];

      // Tidal disruption: check at the Roche limit, not just physical contact.
      // Must run BEFORE the contact-distance skip so it fires at orbit scale.
      // Skip if the victim is already debris (prevents chain-disruption cascade).
      // Real fluid Roche limit: d = R_victim * (2 * ρ_attractor/ρ_victim)^(1/3) —
      // uses actual densities (mass/r³) rather than assuming equal density,
      // so a small dense body survives much closer to a puffy giant star
      // than a same-mass loose rubble pile would.
      const isMassive = B.mass >= 700000;
      if (isMassive && !S._isDebris && B.mass / S.mass >= 800) {
        const densB = B.mass / (B._r * B._r * B._r);
        const densS = S.mass / (S._r * S._r * S._r);
        const rocheLimit = S._r * Math.pow(2 * densB / densS, 1 / 3);
        if (dist < rocheLimit) {
          tidalDisrupt(B, S, sml);
          return true;
        }
      }

      // Compact objects (BH, neutron star) have a "capture radius" much
      // larger than their visible body so they don't tunnel past each other.
      const captureR = b => (b._type === 'blackhole' || b._type === 'neutron')
        ? Math.max(b._r * 4, 12) : b._r;
      if (dist > (captureR(bi) + captureR(bj)) * .8) continue;

      const tmRaw = bi.mass + bj.mass;

      // Mass-energy radiated away as heat / ejecta / gravitational waves.
      // Real basis: LIGO's GW150914 radiated ~5% of the total mass as
      // gravitational-wave energy. We scale the radiated fraction by how
      // compact the merging pair is — compact-compact mergers (BH/neutron)
      // radiate the most, ordinary planet accretion radiates almost none.
      const compactCount = (B._type === 'blackhole' || B._type === 'neutron' ? 1 : 0)
                          + (S._type === 'blackhole' || S._type === 'neutron' ? 1 : 0);
      const radiatedFrac = compactCount === 2 ? 0.05
                          : compactCount === 1 ? 0.02
                          : (B._type === 'star' || S._type === 'star') ? 0.005 : 0.0005;
      const tm = tmRaw * (1 - radiatedFrac);

      // Compute merged state into NEW vectors before mutating anything
      const mVel = new THREE.Vector3()
        .addScaledVector(bi.vel, bi.mass / tmRaw)
        .addScaledVector(bj.vel, bj.mass / tmRaw);
      const mPos = new THREE.Vector3()
        .addScaledVector(bi.pos, bi.mass / tmRaw)
        .addScaledVector(bj.pos, bj.mass / tmRaw);

      // Angular momentum conservation: spin of both bodies + the orbital
      // angular momentum of their relative motion about the new centre of
      // mass all becomes spin of the merged body (the textbook "giant
      // impact" mechanism that spun up the early Earth-Moon system).
      // L = I·ω for a uniform solid sphere, I = (2/5) m r².
      const I = (b) => 0.4 * b.mass * b._r * b._r;
      const relPos = _rTmp.subVectors(bj.pos, bi.pos);
      const relVel = new THREE.Vector3().subVectors(bj.vel, bi.vel);
      const mu = (bi.mass * bj.mass) / tmRaw; // reduced mass
      const L_orbital = mu * (relPos.x * relVel.z - relPos.z * relVel.x); // y-axis component
      const L_spin_B  = I(B) * B.spinRate;
      const L_spin_S  = I(S) * S.spinRate;
      const L_total   = L_orbital + L_spin_B + L_spin_S;

      // Spawn impact flash at the merge point before modifying anything
      createImpactFlash(mPos, new THREE.Color(B.color).lerp(new THREE.Color(S.color), 0.5).getHex());
      playCollisionSound(tm);

      // Inelastic merger — radiate ~50% of relative kinetic energy as heat /
      // ejecta / gravitational waves so the merged body doesn't fly off
      // with the full incoming momentum.
      B.vel.copy(mVel).multiplyScalar(0.5);
      B.pos.copy(mPos);
      B.mass = tm;

      // Resolve the new body type using the merge rules
      const newType = classifyMerge(B._type, S._type, tm);
      const typeChanged = newType !== B._type;
      B._type = newType;

      // Type transitions override name/color so the result reads correctly.
      if (typeChanged && newType === 'blackhole') {
        B.name  = 'Black Hole';
        B.color = '#330044';
      } else if (typeChanged && newType === 'star') {
        B.name  = (B.name === 'Debris' || B._isDebris) ? 'New Star' : B.name + ' (Ignited)';
        B.color = '#ff7733';
        B._isDebris = false;
      } else if (B._type !== 'blackhole') {
        // Standard naming for same-type merges (debris carries over named bodies)
        const bDebris = B._isDebris || B.name === 'Debris';
        const sDebris = S._isDebris || S.name === 'Debris';
        if (bDebris && !sDebris) { B.name = S.name; B._isDebris = false; }
        else if (!bDebris && sDebris) { /* keep B.name */ }
        else if (bDebris && sDebris)  { B.name = 'Debris'; }
        else { B.name = B.name + '+' + S.name; }
      }

      B.rebuildMesh();

      // Apply the conserved angular momentum using the post-merge radius:
      // ω_new = L_total / I_new. Clamped so a near-zero-mass debris speck
      // grazing a giant can't spin the result up into a blur.
      const I_new = 0.4 * B.mass * B._r * B._r;
      B.spinRate  = THREE.MathUtils.clamp(L_total / I_new, -0.35, 0.35);

      B._pulseT = 0; // trigger glow burst on the surviving body
      initAccelerations();

      if (selectedBody === S) selectBody(null);
      if (selectedBodies.has(S)) selectedBodies.delete(S);
      if (followBody   === S) {
        followBody = null;
        document.getElementById('btnFollowOff').style.display = 'none';
      }

      S.remove();
      bodies.splice(sml, 1);
      if (recording && bodies.length !== recBodyCount) stopRecording();
      updateList();
      return true;
    }
  }
  return false;
}

// Tidal disruption - the small body is shredded into a debris stream
// that orbits the dominant attractor instead of merging.
function tidalDisrupt(attractor, victim, victimIdx) {
  const debrisCount = 18 + Math.floor(Math.random() * 12);
  const baseVel     = victim.vel.clone();
  const relPos      = victim.pos.clone().sub(attractor.pos);
  const tangent     = new THREE.Vector3(-relPos.z, 0, relPos.x).normalize();

  // Debris stream: spread along the tangent direction with slight velocity scatter
  for (let k = 0; k < debrisCount; k++) {
    const t       = (k / (debrisCount - 1) - 0.5) * 2; // -1 â€¦ +1
    const spread  = relPos.length() * 0.15;
    const pos     = victim.pos.clone()
      .addScaledVector(tangent, t * spread)
      .addScaledVector(relPos.clone().normalize(), (Math.random() - 0.5) * spread * 0.4);
    pos.y += (Math.random() - 0.5) * spread * 0.1;

    // Each fragment inherits victim momentum + small random kick
    const kick = new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 1.5
    );
    const vel = baseVel.clone().add(kick);

    const mass  = Math.max(100, Math.round(victim.mass / debrisCount));
    const color = new THREE.Color(victim.color)
      .lerp(new THREE.Color(0xff6600), 0.3 + Math.random() * 0.4).getHex();
    const frag  = new Body(pos, vel, mass, '#' + color.toString(16).padStart(6, '0'), 'Debris');
    frag._isDebris = true; // immune from further tidal disruption
    bodies.push(frag);
  }

  // Big spaghettification flash
  createTidalFlash(victim.pos, victim.color);

  if (selectedBody === victim) selectBody(null);
  if (selectedBodies.has(victim)) selectedBodies.delete(victim);
  if (followBody === victim) {
    followBody = null;
    document.getElementById('btnFollowOff').style.display = 'none';
  }

  victim.remove();
  bodies.splice(victimIdx, 1);
  initAccelerations();
  updateList();
}

// Elongated particle stream flash for tidal disruption
function createTidalFlash(pos, color) {
  const count      = 200;
  const positions  = new Float32Array(count * 3);
  const velocities = [];
  const col        = new THREE.Color(color).lerp(new THREE.Color(0xff4400), 0.5).getHex();

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
    const angle  = Math.random() * Math.PI * 2;
    const stretch = 8 + Math.random() * 16; // faster along one axis â†’ streaky
    velocities.push(new THREE.Vector3(
      Math.cos(angle) * stretch,
      (Math.random() - 0.5) * 1.5,
      Math.sin(angle) * stretch * 0.3
    ));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({
    color: col, size: 5, transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(pts);

  const flashSphere = new THREE.Mesh(
    new THREE.SphereGeometry(12, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false })
  );
  flashSphere.position.copy(pos);
  scene.add(flashSphere);

  activeFlashes.push({ pts, velocities, flashSphere, age: 0, maxAge: 70 });
}

// Weak-field gravitational potential at a point (excluding one body, so a
// body doesn't dilate against its own field). Drives the time-dilation
// visual cue in Body.updateVisual() — same PN_C2 stand-in for c² used by
// the precession correction above, so "near a black hole" reads
// consistently as both precessing AND visually time-dilated.
function computePotentialAt(pos, exclude) {
  let phi = 0;
  for (const b of bodies) {
    if (b === exclude) continue;
    const d = pos.distanceTo(b.pos);
    if (d < 0.5) continue;
    phi += G * b.mass / d;
  }
  return phi;
}

// Schwarzschild-like time dilation factor: 1 = normal flow, →0 deep in a
// well. Clamped so display logic (1/dilation) never blows up.
function timeDilationAt(pos, exclude) {
  const phi = computePotentialAt(pos, exclude);
  return Math.max(0.15, 1 / Math.sqrt(1 + 2 * phi / PN_C2));
}

const _comResult = new THREE.Vector3();
function computeCoM() {
  if (!bodies.length) return _comResult.set(0, 0, 0);
  let tm = 0;
  _comResult.set(0, 0, 0);
  for (const b of bodies) { _comResult.addScaledVector(b.pos, b.mass); tm += b.mass; }
  return _comResult.divideScalar(tm);
}

// =============================================================
// IMPACT FLASH
// When two bodies merge, burst a cloud of particles at the collision
// point that radiates outward and fades over ~50 frames.
// =============================================================

const activeFlashes = [];

function createImpactFlash(pos, color) {
  const count      = 120;
  const positions  = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
    // Random sphere direction, compressed on Y so the burst reads as planar
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const speed = 2 + Math.random() * 7;
    velocities.push(new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.sin(phi) * Math.sin(theta) * speed * 0.35,
      Math.cos(phi) * speed
    ));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const pts = new THREE.Points(g, new THREE.PointsMaterial({
    color, size: 4, transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(pts);

  // Expanding flash sphere â€” scales up and fades quickly
  const flashSphere = new THREE.Mesh(
    new THREE.SphereGeometry(8, 10, 8),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  flashSphere.position.copy(pos);
  scene.add(flashSphere);

  activeFlashes.push({ pts, velocities, flashSphere, age: 0, maxAge: 50 });
}

// =============================================================
// COLLAPSE FLASH
// When an oversized, gravitationally unbound body collapses down to its
// natural radius (see Body._checkCollapse()), particles scattered over its
// old surface implode inward and a shrinking flash sphere marks the
// moment of collapse — the visual inverse of an impact flash.
// =============================================================
function createCollapseFlash(pos, radius, color) {
  const count      = 140;
  const positions  = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = radius * (0.6 + Math.random() * 0.4); // scatter near the old surface
    const dx = Math.sin(phi) * Math.cos(theta);
    const dy = Math.sin(phi) * Math.sin(theta);
    const dz = Math.cos(phi);
    positions[i * 3]     = pos.x + dx * r;
    positions[i * 3 + 1] = pos.y + dy * r;
    positions[i * 3 + 2] = pos.z + dz * r;
    // Inward speed scales with starting distance so everything converges
    // on the centre at roughly the same time.
    const speed = -r * 0.12;
    velocities.push(new THREE.Vector3(dx * speed, dy * speed, dz * speed));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({
    color, size: Math.min(40, Math.max(3, radius * 0.02)), transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(pts);

  // Shrinking flash sphere â€” starts at the old (oversized) radius, collapses to nothing
  const flashSphere = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(4, radius), 12, 8),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  flashSphere.position.copy(pos);
  scene.add(flashSphere);

  activeFlashes.push({ pts, velocities, flashSphere, age: 0, maxAge: 45, shrink: true });
}

function updateFlashes() {
  for (let i = activeFlashes.length - 1; i >= 0; i--) {
    const f   = activeFlashes[i];
    f.age++;
    const t   = f.age / f.maxAge;
    const arr = f.pts.geometry.attributes.position.array;

    for (let j = 0; j < f.velocities.length; j++) {
      arr[j * 3]     += f.velocities[j].x;
      arr[j * 3 + 1] += f.velocities[j].y;
      arr[j * 3 + 2] += f.velocities[j].z;
      f.velocities[j].multiplyScalar(0.90); // drag
    }
    f.pts.geometry.attributes.position.needsUpdate = true;
    f.pts.material.opacity = Math.max(0, 1 - t * 1.2);

    if (f.shrink) {
      // Collapse flash: sphere shrinks away instead of expanding
      f.flashSphere.scale.setScalar(Math.max(0.001, 1 - t));
      f.flashSphere.material.opacity = Math.max(0, 0.5 - t * 0.5);
    } else {
      // Impact/tidal flash: sphere expands and fades fast
      f.flashSphere.scale.setScalar(1 + t * 10);
      f.flashSphere.material.opacity = Math.max(0, 0.7 - t * 2);
    }

    if (f.age >= f.maxAge) {
      scene.remove(f.pts);
      scene.remove(f.flashSphere);
      f.pts.geometry.dispose();       f.pts.material.dispose();
      f.flashSphere.geometry.dispose(); f.flashSphere.material.dispose();
      activeFlashes.splice(i, 1);
    }
  }
}

// Total mechanical energy (KE + PE). Leapfrog conserves this to within
// a small oscillation â€” we track drift from the initial snapshot.
let e0 = null;
function totalEnergy() {
  let KE = 0, PE = 0;
  for (let i = 0; i < bodies.length; i++) {
    KE += .5 * bodies[i].mass * bodies[i].vel.lengthSq();
    for (let j = i + 1; j < bodies.length; j++) {
      const d = bodies[i].pos.distanceTo(bodies[j].pos);
      if (d > .5) PE -= G * bodies[i].mass * bodies[j].mass / d;
    }
  }
  return KE + PE;
}
