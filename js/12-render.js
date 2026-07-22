/* =============================================================
   Minimap + render loop + bootstrap
   -------------------------------------------------------------
   2D minimap overlay, the requestAnimationFrame loop with throttled HUD/minimap/energy updates, world-space origin/CoM labels, and the final UI-readout init + animate() kickoff.
   ============================================================= */// =============================================================
// MINIMAP
// 2D canvas overlay showing a top-down view of all bodies with
// trails, colour-coded dots, and a camera-target crosshair.
// =============================================================

const minimapCanvas = document.createElement('canvas');
minimapCanvas.id    = 'minimap';
minimapCanvas.width = minimapCanvas.height = 190;
Object.assign(minimapCanvas.style, {
  position: 'fixed', bottom: '10px', left: '285px',
  width: '190px', height: '190px', zIndex: '10', pointerEvents: 'none',
});
document.body.appendChild(minimapCanvas);
const mmCtx = minimapCanvas.getContext('2d');

function updateMinimap() {
  const W = minimapCanvas.width, H = minimapCanvas.height;
  mmCtx.clearRect(0, 0, W, H);

  // Dark background
  mmCtx.fillStyle = 'rgba(0,8,18,0.88)';
  mmCtx.fillRect(0, 0, W, H);
  mmCtx.strokeStyle = 'rgba(0,255,255,0.25)';
  mmCtx.lineWidth = 1;
  mmCtx.strokeRect(0.5, 0.5, W - 1, H - 1);

  // "MAP" label
  mmCtx.fillStyle = 'rgba(0,255,255,0.3)';
  mmCtx.font = '8px Courier New';
  mmCtx.fillText('MAP', 6, 13);

  if (!bodies.length) return;

  // Compute bounds to auto-fit all bodies
  let minX =  Infinity, maxX = -Infinity;
  let minZ =  Infinity, maxZ = -Infinity;
  for (const b of bodies) {
    minX = Math.min(minX, b.pos.x); maxX = Math.max(maxX, b.pos.x);
    minZ = Math.min(minZ, b.pos.z); maxZ = Math.max(maxZ, b.pos.z);
  }
  const pad   = 60;
  const range = Math.max(maxX - minX + pad * 2, maxZ - minZ + pad * 2, 200);
  const cx    = (minX + maxX) / 2;
  const cz    = (minZ + maxZ) / 2;
  const scale = (W - 24) / range;
  const toMM  = (x, z) => ({
    sx: W / 2 + (x - cx) * scale,
    sy: H / 2 + (z - cz) * scale,
  });

  // Origin crosshair
  const o = toMM(0, 0);
  mmCtx.strokeStyle = 'rgba(255,255,255,0.12)';
  mmCtx.lineWidth = 0.5;
  mmCtx.beginPath();
  mmCtx.moveTo(o.sx - 5, o.sy); mmCtx.lineTo(o.sx + 5, o.sy);
  mmCtx.moveTo(o.sx, o.sy - 5); mmCtx.lineTo(o.sx, o.sy + 5);
  mmCtx.stroke();

  // Trails
  if (showTrails) {
    for (const b of bodies) {
      if (b.trail.length < 2) continue;
      mmCtx.strokeStyle = b.color + '55';
      mmCtx.lineWidth   = 0.6;
      mmCtx.beginPath();
      let first = true;
      for (let i = 0; i < b.trail.length; i += 4) { // stride 4 for performance
        const { sx, sy } = toMM(b.trail[i].x, b.trail[i].z);
        first ? mmCtx.moveTo(sx, sy) : mmCtx.lineTo(sx, sy);
        first = false;
      }
      mmCtx.stroke();
    }
  }

  // Body dots
  for (const b of bodies) {
    const { sx, sy } = toMM(b.pos.x, b.pos.z);
    const r = Math.max(2, Math.min(7, b._r * scale * 0.6));

    // Soft glow halo
    const grad = mmCtx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
    grad.addColorStop(0, b.color + 'aa');
    grad.addColorStop(1, b.color + '00');
    mmCtx.fillStyle = grad;
    mmCtx.beginPath(); mmCtx.arc(sx, sy, r * 3, 0, Math.PI * 2); mmCtx.fill();

    // Solid dot
    mmCtx.fillStyle = b.color;
    mmCtx.beginPath(); mmCtx.arc(sx, sy, r, 0, Math.PI * 2); mmCtx.fill();

    // Selection highlight
    if (b === selectedBody) {
      mmCtx.strokeStyle = '#ffaa00';
      mmCtx.lineWidth = 1.2;
      mmCtx.beginPath(); mmCtx.arc(sx, sy, r + 2.5, 0, Math.PI * 2); mmCtx.stroke();
    }
  }

  // Camera target crosshair
  const cam = toMM(orbitTarget.x, orbitTarget.z);
  mmCtx.strokeStyle = 'rgba(0,255,255,0.6)';
  mmCtx.lineWidth   = 1;
  mmCtx.beginPath();
  mmCtx.moveTo(cam.sx - 6, cam.sy); mmCtx.lineTo(cam.sx + 6, cam.sy);
  mmCtx.moveTo(cam.sx, cam.sy - 6); mmCtx.lineTo(cam.sx, cam.sy + 6);
  mmCtx.stroke();
}

// =============================================================
// RENDER LOOP
// =============================================================

let lastT = performance.now();
let fps   = 60;
let _animFrame = 0;
const _gcVec = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  fps = fps * .92 + (1000 / (now - lastT)) * .08;
  lastT = now;
  _animFrame++;

  // â”€â”€ Easier Visuals smooth transition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Runs unconditionally (even paused/playback) so toggling the size mode
  // always eases smoothly instead of only animating while the sim runs.
  const _evTarget = easyVisuals ? 1 : 0;
  easyVisualsBlend += (_evTarget - easyVisualsBlend) * 0.12;
  if (Math.abs(easyVisualsBlend - _evTarget) < 0.001) easyVisualsBlend = _evTarget;
  // Spawn-in (_spawnT) also advances here, not just in updateVisual()'s
  // physics-gated path — otherwise pausing right after placing a body
  // freezes its pop-in at scale 0 forever (and the easy-visuals scale
  // along with it, since both share mesh.scale via _applyDisplayScale).
  bodies.forEach(b => {
    if (b._spawnT < 1) b._spawnT = Math.min(1, b._spawnT + 0.04);
    b._applyDisplayScale();
  });

  // â”€â”€ Playback scrubbing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (playback) {
    if (pbPlaying) {
      pbFrame++;
      if (pbFrame % 2 === 0) {
        seekPb(pbIdx + 1);
        if (pbIdx >= frames.length - 1) {
          pbPlaying = false;
          setIcon(document.getElementById('btnPbPlay'), 'play', 'Play');
        }
      }
    }

  // â”€â”€ Physics tick â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  } else if (!paused && bodies.length > 0) {
    const dir     = reversed ? -1 : 1;
    const maxDt   = 0.05;
    const totalDt = 0.0009 * simSpeed;
    // Sub-step count scales with sim speed to keep per-step dt â‰¤ maxDt
    const steps  = Math.max(1, Math.min(400, Math.ceil(totalDt / maxDt)));
    const baseDt = totalDt / steps * dir;

    for (let s = 0; s < steps; s++) {
      applyThrust(baseDt);
      stepLeapfrog(baseDt);
      // Check collisions every sub-step so merges happen before gravity
      // can corrupt velocities during overlap (tunneling fix)
      if (checkCollisions()) break;
    }
    captureFrame();
    bodies.forEach(b => b.updateVisual());
  }

  // Compute CoM once per frame; reused by camera follow, marker, and labels
  const com = (bodies.length >= 2) ? computeCoM() : null;

  // ── Camera follow ──────────────────────────────────────────────────────
  if (groupComLock && selectedBodies.size > 1 && !playback) {
    let totalM = 0;
    _gcVec.set(0, 0, 0);
    for (const b of selectedBodies) { _gcVec.addScaledVector(b.pos, b.mass); totalM += b.mass; }
    if (totalM > 0) { _gcVec.divideScalar(totalM); orbitTarget.copy(_gcVec); orbitUpdate(); }
  } else if (followBody && !playback) {
    orbitTarget.copy(followBody.pos);
    orbitUpdate();
  } else if (lockCoM && com && !playback) {
    orbitTarget.copy(com);
    orbitUpdate();
  }

  // â”€â”€ Grid uniforms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // camPos drives the distance-fade in both grid fragment shaders
  gwUni.camPos.value.copy(camera.position);
  _gridBgMat.uniforms.camPos.value.copy(camera.position);

  // Snap the displacement grid to the orbit target in 100-unit steps
  // so it always centres on whatever the camera is looking at
  const _snap = 100;
  _gridMesh.position.set(
    Math.round(orbitTarget.x / _snap) * _snap,
    0,
    Math.round(orbitTarget.z / _snap) * _snap
  );
  // Keep the background grid's cutout aligned with the displacement
  // grid's new position (see innerCenter in 04-shaders.js).
  _gridBgMat.uniforms.innerCenter.value.set(_gridMesh.position.x, _gridMesh.position.z);

  // Push body positions, radii, and well-depth multipliers into the
  // vertex shader uniforms. Depth=0 for unused slots disables them
  // (see the `if (bDepth[i] <= 0.0) continue;` early-out in the shader).
  for (let i = 0; i < GW_MAX_B; i++) {
    if (i < bodies.length) {
      const b = bodies[i];
      gwUni.bPos.value[i].copy(b.pos);
      gwUni.bReach.value[i] = bodyWellReach(b._type, b._r);
      gwUni.bDepth.value[i] = bodyWellDepthMult(b._type, b.mass);
      gwUni.bIsBH.value[i]  = b._type === 'blackhole' ? 1.0 : 0.0;
    } else {
      gwUni.bDepth.value[i] = 0;
    }
  }
  gwUni.bReach.needsUpdate = true;
  gwUni.bDepth.needsUpdate = true;
  gwUni.bIsBH.needsUpdate  = true;

  // â”€â”€ CoM marker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (com) {
    comMesh.position.copy(com);  comMesh.visible  = true;
    comLines.position.copy(com); comLines.visible = true;
  } else {
    comMesh.visible  = false;
    comLines.visible = false;
  }

  // Throttled HUD + energy updates
  if (_animFrame % 6 === 0) {
    if (com) {
      document.getElementById('oCoM').textContent = `(${com.x.toFixed(0)},${com.z.toFixed(0)})`;
    } else {
      document.getElementById('oCoM').textContent = '--';
    }
    document.getElementById('oBodies').textContent = bodies.length;
    document.getElementById('oFps').textContent    = fps.toFixed(0);
  }

  if (_animFrame % 20 === 0) {
    if (bodies.length >= 2) {
      const e = totalEnergy();
      if (e0 === null) e0 = e;
      const drift = e0 !== 0 ? Math.abs((e - e0) / e0) * 100 : 0;
      document.getElementById('oEnergy').textContent = drift.toFixed(2) + '%';
    } else {
      e0 = null;
      document.getElementById('oEnergy').textContent = '--';
    }

    // Orbital elements panel for selected body
    const orbPanel = document.getElementById('orb-panel');
    if (selectedBody && bodies.length >= 2) {
      const el = computeOrbitalElements(selectedBody);
      if (el) {
        const f  = (n, d = 1) => (n == null || !isFinite(n)) ? '—' : n.toFixed(d);
        const fk = n => n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : n.toFixed(0);
        const orbitType = el.e < 0.01 ? 'circular' : el.e < 0.1 ? 'near-circular' : el.e < 1 ? 'elliptic' : el.e < 1.001 ? 'parabolic' : 'hyperbolic';
        const boundLabel = el.eps < 0 ? 'bound' : 'escape';
        let html = `
          <div class="orb-row"><span class="ok">wrt</span><span class="ov orb-att">${el.attractor.name}</span></div>
          <div class="orb-sep"></div>
          <div class="orb-row"><span class="ok">e</span><span class="ov">${f(el.e, 4)}</span><span class="od">${orbitType}</span></div>`;
        if (el.a != null && el.eps < 0) html += `<div class="orb-row"><span class="ok">a</span><span class="ov">${fk(el.a)} u</span></div>`;
        if (el.period != null)           html += `<div class="orb-row"><span class="ok">T</span><span class="ov">${f(el.period, 1)} t</span></div>`;
        html += `<div class="orb-row"><span class="ok">i</span><span class="ov">${f(el.inc, 1)}°</span></div>`;
        if (el.rp != null)               html += `<div class="orb-row"><span class="ok">r<sub>p</sub></span><span class="ov">${fk(el.rp)} u</span></div>`;
        if (el.ra != null)               html += `<div class="orb-row"><span class="ok">r<sub>a</sub></span><span class="ov">${fk(el.ra)} u</span></div>`;
        html += `
          <div class="orb-sep"></div>
          <div class="orb-row"><span class="ok">ε</span><span class="ov">${f(el.eps, 0)}</span><span class="od">${boundLabel}</span></div>
          <div class="orb-row"><span class="ok">h</span><span class="ov">${fk(el.h)}</span></div>
          <div class="orb-row"><span class="ok">v</span><span class="ov">${f(el.v, 2)} u/t</span></div>
          <div class="orb-row"><span class="ok">v<sub>esc</sub></span><span class="ov">${f(el.vEsc, 2)} u/t</span><span class="od">${el.v >= el.vEsc ? '⚠ escape' : ''}</span></div>
          <div class="orb-row"><span class="ok">v<sub>c</sub></span><span class="ov">${f(el.vCirc, 2)} u/t</span></div>`;
        if (el.hillR != null) html += `<div class="orb-row"><span class="ok">r<sub>H</sub></span><span class="ov">${fk(el.hillR)} u</span></div>`;
        if (el.rs    != null) html += `<div class="orb-row"><span class="ok">r<sub>s</sub></span><span class="ov">${f(el.rs, 3)} u</span></div>`;
        if (selectedBody._totalDV > 0)
          html += `<div class="orb-row"><span class="ok">Δv</span><span class="ov">${f(selectedBody._totalDV, 2)} u/t</span></div>`;
        document.getElementById('orb-content').innerHTML = html;
        orbPanel.style.display = 'block';
      } else {
        orbPanel.style.display = 'none';
      }
    } else {
      orbPanel.style.display = 'none';
    }
  }

  nebulaUni.uTime.value += 1;
  updateFlashes();
  if (_animFrame % 2 === 0) updateMinimap();
  updateWorldLabels(com);
  renderer.render(scene, camera);
}

const _labelOriginEl = document.getElementById('label-origin');
const _labelComEl    = document.getElementById('label-com');
const _originPos     = new THREE.Vector3(0, 0, 0);

const _projVec = new THREE.Vector3();
function projectToScreen(worldPos, el) {
  _projVec.copy(worldPos).project(camera);
  if (_projVec.z > 1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left    = (_projVec.x *  0.5 + 0.5) * innerWidth  + 'px';
  el.style.top     = (_projVec.y * -0.5 + 0.5) * innerHeight + 'px';
}

function updateWorldLabels(com) {
  projectToScreen(_originPos, _labelOriginEl);
  if (com) {
    projectToScreen(com, _labelComEl);
  } else {
    _labelComEl.style.display = 'none';
  }
}

// â”€â”€ Initialise UI readouts and start the loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('vMass').textContent  = fmtMass(getMass());
document.getElementById('vSize').textContent  = getBodySize();
document.getElementById('vSpeed').textContent = '1.00x';
syncDensityTag();
lucide.createIcons();
updateLockBtn();
animate();
