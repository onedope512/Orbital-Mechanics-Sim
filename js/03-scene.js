/* =============================================================
   Three.js scene + orbit camera
   -------------------------------------------------------------
   Creates the WebGLRenderer, scene, perspective camera, and the manual orbit controls (left-drag to rotate, right-drag to pan, scroll to zoom toward cursor on the y=0 plane).
   ============================================================= */const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
// Far plane pushed way out (was 200,000) so the background — nebula sphere,
// starfield, and outer grid — can be expanded ~80x without clipping. See
// 04-shaders.js for the matching background-scale constants.
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 10000000);
camera.position.set(0, 350, 650);
camera.lookAt(0, 0, 0);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// =============================================================
// ORBIT CONTROLS
// Manual implementation: left-drag rotates, right-drag pans,
// scroll wheel zooms toward the cursor position on the Y=0 plane.
// =============================================================

const orbitState  = { mode: 'NONE', lx: 0, ly: 0 };
const orbitSph    = new THREE.Spherical().setFromVector3(camera.position.clone());
const orbitTarget = new THREE.Vector3();
let lockCoM    = false;
let followBody = null;

function orbitUpdate() {
  const p = new THREE.Vector3().setFromSpherical(orbitSph).add(orbitTarget);
  camera.position.copy(p);
  camera.lookAt(orbitTarget);
}

renderer.domElement.addEventListener('mousedown', e => {
  if (placementMode) return;
  if (e.button === 0 && trySelectBody(e)) return;
  orbitState.mode = e.button === 2 ? 'PAN' : 'ROTATE';
  orbitState.lx = e.clientX;
  orbitState.ly = e.clientY;
});

renderer.domElement.addEventListener('mousemove', e => {
  if (orbitState.mode === 'NONE') return;
  const dx = e.clientX - orbitState.lx;
  const dy = e.clientY - orbitState.ly;
  orbitState.lx = e.clientX;
  orbitState.ly = e.clientY;

  if (orbitState.mode === 'ROTATE') {
    orbitSph.theta -= dx * 0.005;
    orbitSph.phi    = Math.max(0.05, Math.min(Math.PI - 0.05, orbitSph.phi - dy * 0.005));
  } else {
    // PAN: move the orbit target in the camera's local XY plane
    const k     = orbitSph.radius * 0.001;
    const fwd   = new THREE.Vector3().setFromSpherical(orbitSph).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up    = new THREE.Vector3().crossVectors(right, fwd).normalize();
    orbitTarget.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
  }
  orbitUpdate();
});

window.addEventListener('mouseup', () => orbitState.mode = 'NONE');

// Zoom-to-cursor: intersect ray with the Y=0 plane to find the world point
// under the cursor, then lerp the orbit target toward it before zooming.
const _zoomPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _zoomRay   = new THREE.Raycaster();
const _zoomPt    = new THREE.Vector3();

renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  const oldR = orbitSph.radius;
  // Max zoom-out distance scaled with the ~80x bigger map (was 80,000) so
  // a 12,021-unit Giant Star can still be framed comfortably from afar.
  const newR = Math.max(10, Math.min(6000000, oldR * (1 + e.deltaY * 0.001)));

  const rect = renderer.domElement.getBoundingClientRect();
  const nx   = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
  const ny   = -((e.clientY - rect.top)  / rect.height) *  2 + 1;
  _zoomRay.setFromCamera(new THREE.Vector2(nx, ny), camera);

  if (_zoomRay.ray.intersectPlane(_zoomPlane, _zoomPt)) {
    // Shift target toward cursor proportionally to how much we're zooming in
    const t = Math.max(0, 1 - newR / oldR) * 0.6;
    orbitTarget.lerp(_zoomPt, t);
  }
  orbitSph.radius = newR;
  orbitUpdate();
}, { passive: false });

renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
