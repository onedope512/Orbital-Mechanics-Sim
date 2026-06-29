/* =============================================================
   Mouse interaction — placement, drag-launch, selection, hover tooltip
   -------------------------------------------------------------
   Raycaster helpers for picking bodies on the y=0 plane, click-to-position + drag-to-aim-velocity placement flow, the selection/multi-select handler, and the floating hover tooltip.
   ============================================================= */// =============================================================
// RAYCASTER HELPERS
// =============================================================

const raycaster   = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Convert a mouse event to a point on the Y=0 world plane
function worldFromMouse(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc  = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width)  *  2 - 1,
    -((e.clientY - rect.top)  / rect.height) *  2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, hit) ? hit : null;
}

// =============================================================
// PLACEMENT MODE
// Click to set position, drag to aim velocity, release to place.
// =============================================================

let placementMode = false;
let placing       = false;
let placePos      = new THREE.Vector3();
let velArrowMesh  = null;
let placeMarker   = null;
let cannonPlacing = false;
let cannonPos     = new THREE.Vector3();

renderer.domElement.addEventListener('mousedown', e => {
  if (!placementMode || e.button !== 0) return;
  e.stopPropagation();
  const wp = worldFromMouse(e);
  if (!wp) return;
  placePos.copy(wp);
  placing = true;

  if (placeMarker) scene.remove(placeMarker);
  placeMarker = new THREE.Mesh(
    new THREE.SphereGeometry(5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true })
  );
  placeMarker.position.copy(placePos);
  scene.add(placeMarker);
  setStatus('Drag to set launch velocity, release to place');
}, true);

renderer.domElement.addEventListener('mousemove', e => {
  if (!placing && !cannonPlacing) return;
  const wp = worldFromMouse(e);
  if (!wp) return;

  if (velArrowMesh) { scene.remove(velArrowMesh); velArrowMesh = null; }
  const origin = cannonPlacing ? cannonPos : placePos;
  const dir    = new THREE.Vector3().subVectors(wp, origin);

  if (dir.length() > 2) {
    velArrowMesh = new THREE.ArrowHelper(
      dir.clone().normalize(), origin,
      Math.min(dir.length(), 60),
      cannonPlacing ? 0x00ff88 : 0xffff00, 10, 6
    );
    scene.add(velArrowMesh);
    computePrediction(origin, dir.clone().multiplyScalar(VEL_SCALE), getMass());
  } else {
    clearPrediction();
  }
}, true);

renderer.domElement.addEventListener('mouseup', e => {
  if (e.button !== 0) return;

  if (placing) {
    placing       = false;
    placementMode = false;
    document.getElementById('btnAdd').classList.remove('on');

    const wp  = worldFromMouse(e);
    const vel = wp
      ? new THREE.Vector3().subVectors(wp, placePos).multiplyScalar(VEL_SCALE)
      : new THREE.Vector3();

    // When an untouched preset is selected, place it at its EXACT mass and
    // radius. The sliders are log-quantized, so reading them back via
    // getMass()/getBodySize() returned values 3–5% off the preset — the
    // "presets get placed at different sizes" bug. Moving either slider
    // clears _selectedPreset (see 11-controls.js), so a customised body
    // still uses the slider values.
    const placedMass = _selectedPreset ? _selectedPreset.mass : getMass();
    const placedSize = _selectedPreset ? _selectedPreset.r    : getBodySize();
    bodies.push(new Body(
      placePos.clone(), vel,
      placedMass,
      document.getElementById('sColor').value,
      _selectedPreset ? _selectedPreset.n : 'Body ' + (++_bodyN),
      placedSize
    ));
    playPlaceSound(placedMass);
    initAccelerations();
    updateList();
    setStatus('Body placed!');

    if (velArrowMesh) { scene.remove(velArrowMesh); velArrowMesh = null; }
    if (placeMarker)  { scene.remove(placeMarker);  placeMarker  = null; }
    clearPrediction();
  }

}, true);

function exitCannon() {
  if (velArrowMesh) { scene.remove(velArrowMesh); velArrowMesh = null; }
  clearPrediction();
  setStatus('Ready');
}

// =============================================================
// BODY SELECTION & HOVER TOOLTIP
// =============================================================

const bodyRay = new THREE.Raycaster();

function trySelectBody(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc  = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width)  *  2 - 1,
    -((e.clientY - rect.top)  / rect.height) *  2 + 1
  );
  bodyRay.setFromCamera(ndc, camera);
  const hits = bodyRay.intersectObjects(bodies.map(b => b.mesh), false);
  if (hits.length) {
    const b = bodies.find(b => b.mesh === hits[0].object);
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+click on canvas: carry over singular selection, then toggle
      if (selectedBody && !selectedBodies.has(selectedBody)) selectedBodies.add(selectedBody);
      if (selectedBodies.has(b)) {
        selectedBodies.delete(b);
        if (selectedBodies.size === 0) selectBody(null);
        else { if (selectedBody === b) selectedBody = [...selectedBodies].at(-1); updateSelectionUI(); }
      } else {
        selectedBodies.add(b);
        selectedBody = b;
        updateSelectionUI(); updateLockBtn();
      }
    } else {
      selectedBodies.clear();
      selectBody(b === selectedBody ? null : b);
    }
    return true;
  }
  if (!e.shiftKey) {
    selectedBodies.clear();
    selectBody(null);
  }
  return false;
}

function selectBody(b) {
  selectedBody = b;
  updateSelectionUI();
  updateLockBtn();
}

const tip = document.getElementById('hover-tip');
window.addEventListener('mousemove', e => {
  if (placing || placementMode) { tip.style.display = 'none'; return; }

  const rect = renderer.domElement.getBoundingClientRect();
  const ndc  = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width)  *  2 - 1,
    -((e.clientY - rect.top)  / rect.height) *  2 + 1
  );
  bodyRay.setFromCamera(ndc, camera);
  const hits = bodyRay.intersectObjects(bodies.map(b => b.mesh), false);

  if (hits.length) {
    const b = bodies.find(b => b.mesh === hits[0].object);
    document.getElementById('ht-name').textContent = b.name;
    document.getElementById('ht-type').textContent = 'mass ' + b.mass.toExponential(1);
    document.getElementById('ht-vel').textContent  = '⚡ speed ' + b.vel.length().toFixed(1);
    tip.style.display = 'block';
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top  = (e.clientY - 10) + 'px';
  } else {
    tip.style.display = 'none';
  }
});
