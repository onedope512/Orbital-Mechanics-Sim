/* =============================================================
   Scenario recording, playback, and trajectory prediction
   -------------------------------------------------------------
   Frame capture during simulation, scrubbable playback, and the dashed ghost-trajectory line shown during body placement (uses the same Plummer softening as the live sim).
   ============================================================= */// =============================================================
// SCENARIO RECORDER
// Captures body positions and velocities every RECORD_EVERY frames
// into compact Float32 snapshots for playback scrubbing.
// =============================================================

let recording   = false;
let recBodyCount = 0;
let frames      = [];
let playback    = false;
let pbPlaying   = false;
let pbIdx       = 0;
let pbFrame     = 0;
let recTick     = 0;
const RECORD_EVERY = 2;
const RECORD_MAX   = 9000;

function startRecording() {
  if (bodies.length === 0) {
    document.getElementById('recStatus').textContent = 'No bodies to record';
    return;
  }
  frames       = [];
  recBodyCount = bodies.length;
  recording    = true;
  document.getElementById('btnRecord').classList.add('on');
  document.getElementById('btnStopRec').disabled = false;
  document.getElementById('rec-panel').style.display = 'none';
  document.getElementById('recStatus').textContent   = 'Recording...';
  e0 = null;
}

function stopRecording() {
  if (!recording) return;
  recording = false;
  document.getElementById('btnRecord').classList.remove('on');
  document.getElementById('btnStopRec').disabled = true;
  document.getElementById('recStatus').textContent = frames.length + ' frames captured';
  if (frames.length > 0) {
    document.getElementById('rec-panel').style.display = 'block';
    document.getElementById('pbFrames').textContent    = frames.length;
    document.getElementById('pbSlider').max   = frames.length - 1;
    document.getElementById('pbSlider').value = 0;
  }
}

function captureFrame() {
  if (!recording) return;
  if (bodies.length !== recBodyCount) { stopRecording(); return; }
  recTick++;
  if (recTick % RECORD_EVERY !== 0) return;

  const snap = new Float32Array(recBodyCount * 6);
  bodies.forEach((b, i) => {
    snap[i * 6]     = b.pos.x; snap[i * 6 + 1] = b.pos.y; snap[i * 6 + 2] = b.pos.z;
    snap[i * 6 + 3] = b.vel.x; snap[i * 6 + 4] = b.vel.y; snap[i * 6 + 5] = b.vel.z;
  });
  frames.push(snap);
  if (frames.length >= RECORD_MAX) stopRecording();
  document.getElementById('recStatus').textContent = 'Recording... ' + frames.length + ' frames';
}

function enterPlayback() {
  if (!frames.length) return;
  playback  = true;
  pbIdx     = 0;
  pbPlaying = false;
  pbFrame   = 0;
  paused    = true;
  bodies.forEach(b => b.trail = []);
  setIcon(document.getElementById('btnPlay'), 'play', 'PLAY');
  seekPb(0);
}

function exitPlayback() {
  playback  = false;
  pbPlaying = false;
  document.getElementById('rec-panel').style.display  = frames.length ? 'block' : 'none';
  setIcon(document.getElementById('btnPbPlay'), 'play', 'Play');
}

function seekPb(idx) {
  if (!frames.length || bodies.length !== recBodyCount) return;
  pbIdx = Math.max(0, Math.min(frames.length - 1, idx));
  const snap = frames[pbIdx];
  bodies.forEach((b, i) => {
    b.pos.set(snap[i * 6], snap[i * 6 + 1], snap[i * 6 + 2]);
    b.vel.set(snap[i * 6 + 3], snap[i * 6 + 4], snap[i * 6 + 5]);
  });
  bodies.forEach(b => b.updateVisual());
  document.getElementById('pbSlider').value = pbIdx;
}

// =============================================================
// TRAJECTORY PREDICTION
// Simple Euler integration of a ghost body alongside real bodies
// to give a dashed yellow preview arc during placement/cannon.
// =============================================================

const PRED_STEPS = 3000;
const PRED_MAX   = 3000;
let predictLine;

(function () {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PRED_MAX * 3), 3));
  g.setDrawRange(0, 0);
  predictLine = new THREE.Line(
    g,
    new THREE.LineDashedMaterial({ color: 0xffff00, transparent: true, opacity: .7, dashSize: 8, gapSize: 5 })
  );
  scene.add(predictLine);
})();

function computePrediction(startPos, startVel, mass) {
  // Ghost copies of all existing bodies plus the new one
  const pp = [...bodies.map(b => b.pos.clone()), startPos.clone()];
  const pv = [...bodies.map(b => b.vel.clone()), startVel.clone()];
  const pm = [...bodies.map(b => b.mass), mass];
  const n  = pp.length;
  const pi = n - 1; // index of the ghost body
  const dt = 0.02;
  const pts = [pp[pi].clone()];

  const startPos2 = startPos.clone();
  const _a = new THREE.Vector3();
  const _r = new THREE.Vector3();
  for (let s = 0; s < PRED_STEPS; s++) {
    // Advance all ghost bodies (so attractors move too).
    // Use the same Plummer softening as the live simulation for consistent paths.
    for (let i = 0; i < n; i++) {
      _a.set(0, 0, 0);
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        _r.subVectors(pp[j], pp[i]);
        const d2   = _r.lengthSq() + SOFT_EPS2;
        const dInv = 1 / Math.sqrt(d2);
        _a.addScaledVector(_r, G * pm[j] * dInv * dInv * dInv);
      }
      pv[i].addScaledVector(_a, dt);
    }
    for (let i = 0; i < n; i++) pp[i].addScaledVector(pv[i], dt);
    pts.push(pp[pi].clone());
    // stop if body travels too far from its start point or from origin
    if (pp[pi].distanceToSquared(startPos2) > 4e7) break;
    if (pp[pi].lengthSq() > 9e7) break;
  }

  const arr = predictLine.geometry.attributes.position.array;
  const cnt = Math.min(pts.length, PRED_MAX);
  for (let i = 0; i < cnt; i++) {
    arr[i * 3]     = pts[i].x;
    arr[i * 3 + 1] = pts[i].y;
    arr[i * 3 + 2] = pts[i].z;
  }
  predictLine.geometry.attributes.position.needsUpdate = true;
  predictLine.geometry.setDrawRange(0, cnt);
  predictLine.computeLineDistances();
}

function clearPrediction() {
  predictLine.geometry.setDrawRange(0, 0);
}
