/* =============================================================
   UI event bindings + scenario presets + tutorial
   -------------------------------------------------------------
   All button/slider event listeners (top bar, settings, recorder, save/load, clear), the global keyboard handler, the tutorial modal wiring, and the orbital-scenario presets (Binary Stars, Solar System, Figure-8, Hohmann, Lagrange, Tidal Disruption).
   ============================================================= */// =============================================================
// EVENT LISTENERS â€” sidebar controls
// =============================================================

document.getElementById('sMass').addEventListener('input', function () {
  document.getElementById('vMass').textContent = fmtMass(getMass());
  // Deselect preset tile when mass is manually adjusted
  document.querySelectorAll('.ptile').forEach(x => x.classList.remove('sel'));
  _selectedPreset = null;
  syncDensityTag();
});

document.getElementById('sSize').addEventListener('input', function () {
  document.getElementById('vSize').textContent = getBodySize();
  // Deselect preset when size is manually adjusted, mirroring the mass
  // slider — so placement only uses exact preset values for an UNTOUCHED
  // preset (see the placement handler in 09-interaction.js).
  document.querySelectorAll('.ptile').forEach(x => x.classList.remove('sel'));
  _selectedPreset = null;
  syncDensityTag();
});

document.getElementById('btnAdd').addEventListener('click', () => {
  exitCannon();
  placementMode = !placementMode;
  placing       = false;
  document.getElementById('btnAdd').classList.toggle('on', placementMode);
  setStatus(placementMode ? 'Click in space to set position' : 'Cancelled.');
  if (velArrowMesh) { scene.remove(velArrowMesh); velArrowMesh = null; }
  if (placeMarker)  { scene.remove(placeMarker);  placeMarker  = null; }
  clearPrediction();
});


document.getElementById('btnPlay').addEventListener('click', () => {
  if (playback) return;
  paused = !paused;
  setIcon(document.getElementById('btnPlay'), paused ? 'play' : 'pause', paused ? 'PLAY' : 'PAUSE');
});

document.getElementById('btnStep').addEventListener('click', () => {
  if (paused && !playback) {
    applyThrust(0.018 * (reversed ? -1 : 1));
    stepLeapfrog(0.018 * (reversed ? -1 : 1));
    checkCollisions();
    bodies.forEach(b => b.updateVisual());
  }
});

document.getElementById('btnReverse').addEventListener('click', () => {
  reversed = !reversed;
  document.getElementById('btnReverse').classList.toggle('on', reversed);
  setIcon(document.getElementById('btnReverse'), 'rewind', reversed ? 'REVERSED' : 'REVERSE');
});

document.getElementById('btnVectors').addEventListener('click', () => {
  showVectors = !showVectors;
  document.getElementById('btnVectors').classList.toggle('on', showVectors);
});

document.getElementById('btnLabels').addEventListener('click', () => {
  showLabels = !showLabels;
  document.getElementById('btnLabels').classList.toggle('on', showLabels);
});

document.getElementById('btnTrails').addEventListener('click', () => {
  showTrails = !showTrails;
  document.getElementById('btnTrails').classList.toggle('on', showTrails);
  if (!showTrails) bodies.forEach(b => { b.trail = []; b.trailLine.geometry.setDrawRange(0, 0); });
});

document.getElementById('btnPotential').addEventListener('click', () => {
  showPotential = !showPotential;
  gwUni.gwEnabled.value = showPotential ? 1.0 : 0.0;
  document.getElementById('btnPotential').classList.toggle('on', showPotential);
});

document.getElementById('btnEasyView').addEventListener('click', () => {
  easyVisuals = !easyVisuals;
  document.getElementById('btnEasyView').classList.toggle('on', easyVisuals);
  // The actual size transition eases smoothly every frame in animate()
  // (easyVisualsBlend), independent of pause state — nothing to do here.
  setStatus(easyVisuals ? 'Easier Visuals on - sizes log-compressed' : 'Easier Visuals off - true scale');
});

document.getElementById('sGwDetail').addEventListener('input', function () {
  // 0% = threshold 100000 (tiny wells), 70% = ~71 (detailed default), 100% = ~3 (enormous, laggy)
  gwThresh = Math.pow(10, 5 - +this.value * 0.045);
  gwUni.gwThresh.value = gwThresh;
  const pct = +this.value;
  document.getElementById('vGwDetail').textContent = pct + '%';
  document.getElementById('gwWarn').style.display  = pct >= 85 ? 'block' : 'none';
});

document.getElementById('sGridAlpha').addEventListener('input', function () {
  // 0â€“100 maps to 0â€“3.0 so lines can fully saturate to white at high values
  gwUni.gridAlpha.value = +this.value / 100 * 3.0;
  document.getElementById('vGridAlpha').textContent = this.value + '%';
});

document.getElementById('sGridFreq').addEventListener('input', function () {
  // 0% = coarse (~400 units), 50% = default (100/20), 100% = fine (~25/5)
  const maj = Math.pow(10, 2.6 - +this.value * 0.012);
  gwUni.gridMajor.value = maj;
  gwUni.gridMinor.value = maj / 5;
  document.getElementById('vGridFreq').textContent = this.value + '%';
});

document.getElementById('btnSettings').addEventListener('click', e => {
  e.stopPropagation();
  const p = document.getElementById('settings-popup');
  p.style.display = p.style.display === 'block' ? 'none' : 'block';
});
document.addEventListener('click', e => {
  const p = document.getElementById('settings-popup');
  if (p.style.display === 'block' && !p.contains(e.target) && e.target.id !== 'btnSettings') {
    p.style.display = 'none';
  }
});

document.getElementById('btnLockOn').addEventListener('click', () => {
  if (!selectedBody) return;
  if (followBody === selectedBody) {
    followBody = null;
    document.getElementById('btnFollowOff').style.display = 'none';
  } else {
    followBody = selectedBody;
    document.getElementById('btnFollowOff').style.display = 'block';
  }
  updateLockBtn();
  updateList();
});

document.getElementById('btnOrigin').addEventListener('click', centerOnOrigin);

document.getElementById('btnCoMLock').addEventListener('click', () => {
  lockCoM = !lockCoM;
  document.getElementById('btnCoMLock').classList.toggle('on', lockCoM);
});

document.getElementById('btnFollowOff').addEventListener('click', () => {
  followBody = null;
  document.getElementById('btnFollowOff').style.display = 'none';
  updateList();
});

document.getElementById('sSpeed').addEventListener('input', function () {
  simSpeed = Math.pow(10, +this.value);
  document.getElementById('vSpeed').textContent    = simSpeed.toFixed(simSpeed < 10 ? 2 : 0) + 'x';
  document.getElementById('speedWarn').style.display = simSpeed >= 50 ? 'block' : 'none';
});

document.getElementById('sTrail').addEventListener('input', function () {
  trailLen = +this.value;
  document.getElementById('vTrail').textContent = trailLen;
});

// Star Glow: scales the size/brightness of the transparent glow sphere
// around stars and black holes (not planets). Re-applies live to every
// existing star/neutron/black-hole body, not just future placements.
document.getElementById('sStarGlow').addEventListener('input', function () {
  starGlowMult = +this.value / 100;
  document.getElementById('vStarGlow').textContent = this.value + '%';
  bodies.forEach(b => {
    if (b._type === 'star' || b._type === 'neutron' || b._type === 'blackhole') {
      const gp = b._glowParams();
      b.glow.geometry.dispose();
      b.glow.geometry = new THREE.SphereGeometry(b._r * gp.radMult, 16, 10);
      b.glow.material.opacity = gp.opacity;
    }
  });
});

document.getElementById('sThrust').addEventListener('input', function () {
  document.getElementById('vThrust').textContent = this.value;
});

document.getElementById('btnClear').addEventListener('click', () => {
  clearAll();
  setStatus('Cleared.');
});

// ── Multi-select bar ───────────────────────────────────────────────────
document.getElementById('ms-delete').addEventListener('click', () => {
  const toRemove = [...selectedBodies];
  selectedBodies.clear();
  selectBody(null);
  toRemove.forEach(b => {
    const i = bodies.indexOf(b);
    if (i < 0) return;
    if (followBody === b) { followBody = null; document.getElementById('btnFollowOff').style.display = 'none'; }
    b.remove();
    bodies.splice(i, 1);
  });
  if (recording && bodies.length !== recBodyCount) stopRecording();
  initAccelerations();
  updateList();
});
document.getElementById('ms-clear').addEventListener('click', () => {
  selectedBodies.clear();
  groupComLock = false;
  groupThrust  = false;
  selectBody(null);
});
document.getElementById('ms-com').addEventListener('click', () => {
  groupComLock = !groupComLock;
  if (groupComLock) { followBody = null; lockCoM = false; }
  updateSelectionUI();
});
document.getElementById('ms-thrust').addEventListener('click', () => {
  groupThrust = !groupThrust;
  updateSelectionUI();
});

// â”€â”€ Recorder controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnRecord').addEventListener('click', startRecording);
document.getElementById('btnStopRec').addEventListener('click', stopRecording);

document.getElementById('btnPbPlay').addEventListener('click', () => {
  if (!playback) enterPlayback();
  pbPlaying = !pbPlaying;
  setIcon(document.getElementById('btnPbPlay'), pbPlaying ? 'pause' : 'play', pbPlaying ? 'Pause' : 'Play');
});

document.getElementById('btnPbExit').addEventListener('click', exitPlayback);
document.getElementById('pbSlider').addEventListener('input', function () { seekPb(+this.value); });

// â”€â”€ Save / Load â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnSave').addEventListener('click', () => {
  const data = {
    simTime,
    bodies: bodies.map(b => ({
      pos:   { x: b.pos.x, y: b.pos.y, z: b.pos.z },
      vel:   { x: b.vel.x, y: b.vel.y, z: b.vel.z },
      mass:  b.mass,
      r:     b._r,            // persist explicit radius — presets/custom sizes
      color: b.color,        // differ from the mass-derived natural radius
      name:  b.name,
      noCollide: b._noCollide,
    })),
  };
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'orbit_save.json';
  a.click();
});

document.getElementById('btnLoad').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', function () {
  if (!this.files.length) return;
  const fr = new FileReader();
  fr.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      clearAll();
      simTime = d.simTime || 0;
      for (const bd of d.bodies) {
        const body = new Body(
          new THREE.Vector3(bd.pos.x, bd.pos.y, bd.pos.z),
          new THREE.Vector3(bd.vel.x, bd.vel.y, bd.vel.z),
          bd.mass, bd.color, bd.name,
          bd.r  // restore saved radius (undefined for old saves → natural radius)
        );
        if (bd.noCollide) body._noCollide = true;
        bodies.push(body);
      }
      e0 = null;
      initAccelerations();
      updateList();
    } catch (err) {
      alert('Load failed: ' + err.message);
    }
  };
  fr.readAsText(this.files[0]);
  this.value = '';
});

// =============================================================
// SCENARIO PRESETS
// =============================================================

function clearAll() {
  bodies.forEach(b => b.remove());
  bodies   = [];
  simTime  = 0;
  e0       = null;
  selectedBodies.clear();
  selectBody(null);
  followBody = null;
  document.getElementById('btnFollowOff').style.display = 'none';
  stopRecording();
  frames = [];
  document.getElementById('rec-panel').style.display   = 'none';
  document.getElementById('recStatus').textContent     = 'Ready';
  updateList();
}

// Circular orbital speed for a test body orbiting mass M at radius r
function orbV(M, r) { return Math.sqrt(G * M / r); }

// Frame the camera to comfortably view a region of the given radius around
// the origin. Scenario distances are now on the real-units scale (a Sun is
// 1202 units across, planets orbit thousands of units out), far beyond the
// default camera distance — without this the camera starts buried inside
// the central body.
function frameScene(viewRadius) {
  orbitTarget.set(0, 0, 0);
  orbitSph.radius = THREE.MathUtils.clamp(viewRadius * 2.4, 10, 6000000);
  followBody = null;
  document.getElementById('btnFollowOff').style.display = 'none';
  orbitUpdate();
}

document.getElementById('pBinary').addEventListener('click', () => {
  clearAll();
  // Two equal-mass Sun-scale stars (radius ~1202 each) in a mutual circular
  // orbit. Half-separation r must clear both radii so they never touch.
  const m = 1033000, r = 5000;
  const v = Math.sqrt(G * m / (4 * r)); // mutual orbit speed (centre-of-mass frame)
  bodies.push(new Body(new THREE.Vector3(-r, 0,  0), new THREE.Vector3(0, 0,  v), m, '#ff7744', 'Alpha'));
  bodies.push(new Body(new THREE.Vector3( r, 0,  0), new THREE.Vector3(0, 0, -v), m, '#4488ff', 'Beta'));
  initAccelerations(); updateList(); frameScene(r);
  setStatus('Binary stars - stable mutual orbit');
});

document.getElementById('pSolar').addEventListener('click', () => {
  clearAll();
  // Sun at the real-units mass/radius (1202). Planets orbit well outside it.
  const SM = 1033000;
  bodies.push(new Body(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), SM, '#ffee44', 'Sun'));
  for (const p of [
    { r: 2600, m: 1000, col: '#bbbbbb', name: 'Mercury' },
    { r: 4200, m: 5000, col: '#ffaa55', name: 'Venus'   },
    { r: 6000, m: 6000, col: '#4477ff', name: 'Earth'   },
    { r: 8500, m: 2400, col: '#ff5533', name: 'Mars'    },
  ]) {
    const v = orbV(SM, p.r);
    bodies.push(new Body(new THREE.Vector3(p.r, 0, 0), new THREE.Vector3(0, 0, -v), p.m, p.col, p.name));
  }
  initAccelerations(); updateList(); frameScene(8500);
  setStatus('Inner Solar System (scaled)');
});

document.getElementById('pFigure8').addEventListener('click', () => {
  clearAll();
  // Scale-free choreography; L sets the overall size. Bodies are planet-mass
  // (radius ~8) so L=2000 keeps them well separated.
  const m  = 2000, L = 2000;
  const vS = Math.sqrt(G * m / L);
  // Known stable figure-8 initial conditions (Chenciner & Montgomery 2000)
  const px  = [-0.97000436, 0,             0.97000436];
  const pz  = [ 0.24308753, 0,            -0.24308753];
  const vx0 = 0.93240737 / 2, vz0 = 0.86473146 / 2;
  const vxA = [vx0, -2 * vx0, vx0];
  const vzA = [vz0, -2 * vz0, vz0];
  [['#ff4455', 'Body A'], ['#44ff66', 'Body B'], ['#4455ff', 'Body C']].forEach(([col, name], i) => {
    bodies.push(new Body(
      new THREE.Vector3(px[i] * L, 0, pz[i] * L),
      new THREE.Vector3(vxA[i] * vS, 0, vzA[i] * vS),
      m, col, name
    ));
  });
  initAccelerations(); updateList(); frameScene(L);
  setStatus('Figure-8 three-body choreography');
});

document.getElementById('pHohmann').addEventListener('click', () => {
  clearAll();
  const SM = 1033000, r1 = 3000, r2 = 6000;
  bodies.push(new Body(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), SM, '#ffee44', 'Sun'));

  // Vis-viva launch speed for the transfer ellipse periapsis
  const vT = Math.sqrt(G * SM * 2 * r2 / (r1 * (r1 + r2)));
  bodies.push(new Body(new THREE.Vector3(r1, 0, 0), new THREE.Vector3(0, 0, -vT), 5, '#ffff00', 'Transfer Ship'));

  // Place Mars so it arrives at apoapsis (Î¸=Ï€) when the ship arrives
  const a_tr  = (r1 + r2) / 2;
  const T_tr  = Math.PI * Math.sqrt(a_tr * a_tr * a_tr / (G * SM)); // half-period
  const v2    = orbV(SM, r2);
  const omM   = v2 / r2;
  const mTheta = Math.PI - omM * T_tr;
  bodies.push(new Body(
    new THREE.Vector3(r2 * Math.cos(mTheta), 0, -r2 * Math.sin(mTheta)),
    new THREE.Vector3(-v2 * Math.sin(mTheta), 0, -v2 * Math.cos(mTheta)),
    2400, '#ff5533', 'Mars'
  ));
  initAccelerations(); updateList(); frameScene(r2);
  setStatus('Ship launches from Earth orbit - watch it arc out to meet Mars');
});

document.getElementById('pLagrange').addEventListener('click', () => {
  clearAll();
  // Mass ratio JM/SM must stay below ~0.04 for L4/L5 stability.
  const SM = 1033000, JM = 10000, r = 6000;
  const omega = Math.sqrt(G * (SM + JM) / (r * r * r));
  const sunX  = -r * JM / (SM + JM);
  const jupX  =  r * SM / (SM + JM);

  bodies.push(new Body(new THREE.Vector3(sunX, 0, 0), new THREE.Vector3(0, 0, -sunX * omega), SM, '#ffee44', 'Sun'));
  bodies.push(new Body(new THREE.Vector3(jupX, 0, 0), new THREE.Vector3(0, 0, -jupX * omega), JM, '#ff8844', 'Jupiter'));

  // Trojans at L4 (+60deg) and L5 (-60deg), slightly scattered
  for (const [theta, col, lname] of [
    [ Math.PI / 3, '#55ffff', 'L4 Trojan'],
    [-Math.PI / 3, '#ff55ff', 'L5 Trojan'],
  ]) {
    for (let k = 0; k < 5; k++) {
      const pr  = r * (0.97 + Math.random() * .06);
      const pa  = theta + (Math.random() - .5) * .1;
      const tx  = pr * Math.cos(pa);
      const tz  = -pr * Math.sin(pa);
      const jit = (Math.random() - .5) * .3;
      const trojan = new Body(
        new THREE.Vector3(tx, 0, tz),
        new THREE.Vector3(omega * tz + jit, 0, -omega * tx + jit),
        8, col, lname + ' ' + (k + 1)
      );
      trojan._noCollide = true; // trojans pass through each other
      bodies.push(trojan);
    }
  }
  initAccelerations(); updateList(); frameScene(r);
  setStatus('Sun + Jupiter + Trojan asteroids at L4/L5');
});

document.getElementById('pTidal').addEventListener('click', () => {
  clearAll();

  // Central black hole at the real-units mass.
  const BH_MASS = 5000000;
  bodies.push(new Body(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
    BH_MASS, '#220033', 'Black Hole'
  ));

  // Doomed body on a highly elliptical orbit starting at apoapsis. The
  // density-based Roche limit (~1100 units for these masses) sits between
  // periR and apoR, so disruption fires on the first close pass.
  const starMass = 2000;
  const periR    = 400;
  const apoR     = 4000;
  const a        = (periR + apoR) / 2;
  const vApo     = Math.sqrt(G * BH_MASS * (2 / apoR - 1 / a)); // vis-viva at apoapsis
  bodies.push(new Body(
    new THREE.Vector3(-apoR, 0, 0),
    new THREE.Vector3(0, 0, vApo),
    starMass, '#ffcc44', 'Doomed Star'
  ));

  // A second body on a wide, stable circular orbit â€” survives for contrast.
  const safeR = 5500;
  const vSafe = Math.sqrt(G * BH_MASS / safeR);
  bodies.push(new Body(
    new THREE.Vector3(safeR, 0, 0),
    new THREE.Vector3(0, 0, -vSafe),
    6000, '#44aaff', 'Safe Star'
  ));

  initAccelerations(); updateList(); frameScene(safeR);
  setStatus('Tidal Disruption - watch the Doomed Star pass the black hole');
});
// =============================================================
// TUTORIAL MODAL
// Shows on first visit. Press ? to reopen. localStorage flag
// suppresses it on subsequent visits if the user clicks
// "Don't show again".
// =============================================================
(function () {
  const overlay = document.getElementById('tut-overlay');

  // Tab switching
  document.querySelectorAll('.ttab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ttab').forEach(t => t.classList.remove('on'));
      document.querySelectorAll('.tpage').forEach(p => p.style.display = 'none');
      btn.classList.add('on');
      document.getElementById('tpage-' + btn.dataset.tab).style.display = 'block';
    });
  });

  function closeTut() { overlay.style.display = 'none'; }

  document.getElementById('tut-close').addEventListener('click', closeTut);
  document.getElementById('tut-skip').addEventListener('click', () => {
    closeTut();
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeTut(); });

  // Expose opener so the ? key handler below can call it
  window._openTutorial = () => {
    overlay.style.display = 'flex';
    document.querySelectorAll('.ttab').forEach((t, i) => t.classList.toggle('on', i === 0));
    document.querySelectorAll('.tpage').forEach((p, i) => p.style.display = i === 0 ? 'block' : 'none');
  };
})();

// â”€â”€ Global Keyboard Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === 'Escape') {
    // Close tutorial first if open; otherwise deselect/exit modes
    const tut = document.getElementById('tut-overlay');
    if (tut.style.display !== 'none') { tut.style.display = 'none'; return; }
    selectBody(null);
    exitCannon();
    followBody = null;
    document.getElementById('btnFollowOff').style.display = 'none';
    updateList();
    updateLockBtn();
  }
  if (e.key === '?') window._openTutorial && window._openTutorial();
  if (e.key === 'c' || e.key === 'C') centerOnOrigin();
});

window.addEventListener('keyup', e => keys[e.key] = false);

