/* =============================================================
   Audio system
   -------------------------------------------------------------
   All Web Audio API setup and synthesized sounds — click, hover, placement, and collision noises. Self-contained; no dependency on the simulation state.
   ============================================================= */// ── Audio (Web Audio API) ────────────────────────────────────────────────────
let _audioCtx   = null;
let _volMaster  = 0.8;   // master multiplier
let _volUI      = 0.8;   // button clicks + hover + placement
let _volImpact  = 0.8;   // collision sounds

function _ac() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}
function _play(buf, vol) {
  if (vol <= 0) return;
  try {
    const ctx = _ac(), src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; g.gain.value = Math.min(1, vol);
    src.connect(g); g.connect(ctx.destination); src.start();
  } catch(e) {}
}
function _noise(dur, baseVol, channel, fn) {
  const vol = baseVol * _volMaster * channel;
  if (vol <= 0.001) return;
  try {
    const ctx = _ac(), sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
    fn(buf.getChannelData(0), sr); _play(buf, vol);
  } catch(e) {}
}

window.setVolume = (type, val) => {
  const v = val / 100;
  if (type === 'master')  _volMaster = v;
  if (type === 'ui')      _volUI     = v;
  if (type === 'impact')  _volImpact = v;
  const lbl = document.getElementById('vVol-' + type);
  if (lbl) lbl.textContent = val + '%';
};

// UI click — short mechanical tick
function playClick() {
  _noise(0.035, 0.15, _volUI, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i/sr;
      d[i] = (Math.random()*2-1)*Math.exp(-t*400)*0.5
           + Math.sin(2*Math.PI*2200*t)*Math.exp(-t*600)*0.5;
    }
  });
}

// Button hover — very soft high tick
function playHover() {
  _noise(0.018, 0.06, _volUI, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i/sr;
      d[i] = Math.sin(2*Math.PI*3400*t)*Math.exp(-t*900);
    }
  });
}

// Placement sounds — rocky, gassy, stellar, black hole
function playPlaceSound(mass) {
  if (mass >= 880000) {
    _noise(0.5, 0.35, _volUI, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i/sr;
        d[i] = (Math.random()*2-1)*Math.exp(-t*6)*0.4
             + Math.sin(2*Math.PI*40*t)*Math.exp(-t*4)*0.6
             + Math.sin(2*Math.PI*80*t)*Math.exp(-t*8)*0.3;
      }
    });
  } else if (mass >= 200000) {
    _noise(0.4, 0.28, _volUI, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i/sr;
        d[i] = (Math.random()*2-1)*Math.exp(-t*12)*0.25
             + Math.sin(2*Math.PI*320*t)*Math.exp(-t*10)*0.45
             + Math.sin(2*Math.PI*640*t)*Math.exp(-t*18)*0.3;
      }
    });
  } else if (mass >= 3000) {
    _noise(0.35, 0.22, _volUI, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i/sr;
        d[i] = (Math.random()*2-1)*Math.exp(-t*9)*0.5
             + Math.sin(2*Math.PI*120*t)*Math.exp(-t*12)*0.5;
      }
    });
  } else {
    _noise(0.12, 0.2, _volUI, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i/sr;
        d[i] = (Math.random()*2-1)*Math.exp(-t*80)*0.7
             + Math.sin(2*Math.PI*900*t)*Math.exp(-t*120)*0.3;
      }
    });
  }
}

// Collision / merge sound — heavier impact for more massive merges
function playCollisionSound(mergedMass) {
  if (mergedMass >= 880000) {
    _noise(0.6, 0.4, _volImpact, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i/sr;
        d[i] = (Math.random()*2-1)*Math.exp(-t*5)*0.35
             + Math.sin(2*Math.PI*30*t)*Math.exp(-t*3)*0.65;
      }
    });
  } else if (mergedMass >= 200000) {
    _noise(0.35, 0.32, _volImpact, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i/sr;
        d[i] = (Math.random()*2-1)*Math.exp(-t*18)*0.4
             + Math.sin(2*Math.PI*160*t)*Math.exp(-t*14)*0.6;
      }
    });
  } else if (mergedMass >= 3000) {
    _noise(0.25, 0.25, _volImpact, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i/sr;
        d[i] = (Math.random()*2-1)*Math.exp(-t*30)*0.5
             + Math.sin(2*Math.PI*220*t)*Math.exp(-t*25)*0.5;
      }
    });
  } else {
    _noise(0.1, 0.18, _volImpact, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i/sr;
        d[i] = (Math.random()*2-1)*Math.exp(-t*120)*0.8
             + Math.sin(2*Math.PI*600*t)*Math.exp(-t*100)*0.2;
      }
    });
  }
}

// Click sound on buttons/tiles/tabs
document.addEventListener('click', e => {
  if (e.target.closest('button, .bitem, .ptile, .ttab')) playClick();
}, true);

// Hover sound on buttons
let _lastHoverEl = null;
document.addEventListener('mouseover', e => {
  const el = e.target.closest('button, .ptile, .ttab');
  if (el && el !== _lastHoverEl) { _lastHoverEl = el; playHover(); }
}, true);
document.addEventListener('mouseout', e => {
  if (e.target.closest('button, .ptile, .ttab')) _lastHoverEl = null;
}, true);

// â”€â”€ Three.js Scene Setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
