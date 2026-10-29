let ctx = null;
let activeSiren = null;

function getCtx() {
  if (!ctx && typeof window !== 'undefined') {
    const AudioCtx =
      window.AudioContext ||
      window.webkitAudioContext;
    if (AudioCtx) {
      ctx = new AudioCtx();
    }
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/**
 * Must be called from a user gesture (click/touch) to unlock audio in browsers.
 */
export function enableAlarmAudio() {
  getCtx();
}

/**
 * Starts an authentic security alarm siren:
 * - Dual modulated oscillators (sawtooth + triangle) for an aggressive horn timbre
 * - Triangle LFO sweeping pitch between 470 Hz and 1230 Hz at 2.2 Hz
 */
export function startAlarm() {
  if (activeSiren) return;

  const c = getCtx();
  if (!c) return;

  const now = c.currentTime;

  // Master output gain with smooth attack
  const masterGain = c.createGain();
  masterGain.gain.setValueAtTime(0.001, now);
  masterGain.gain.linearRampToValueAtTime(0.2, now + 0.1);
  masterGain.connect(c.destination);

  // Primary Siren Oscillator (sawtooth for horn timbre)
  const carrier = c.createOscillator();
  carrier.type = 'sawtooth';
  carrier.frequency.setValueAtTime(850, now);

  // Secondary oscillator for acoustic depth
  const carrierHarmonic = c.createOscillator();
  carrierHarmonic.type = 'triangle';
  carrierHarmonic.frequency.setValueAtTime(850, now);
  carrierHarmonic.detune.setValueAtTime(14, now); // +14 cents chorusing

  // Low Frequency Oscillator (LFO) creating pitch sweep
  const lfo = c.createOscillator();
  lfo.type = 'triangle';
  lfo.frequency.setValueAtTime(2.2, now); // 2.2 sweeps per second

  // Modulation Depth: sweeps pitch +/- 380 Hz
  const lfoGain = c.createGain();
  lfoGain.gain.setValueAtTime(380, now);

  // Modulate carrier frequencies
  lfo.connect(lfoGain);
  lfoGain.connect(carrier.frequency);
  lfoGain.connect(carrierHarmonic.frequency);

  // Route to master output
  carrier.connect(masterGain);
  carrierHarmonic.connect(masterGain);

  // Start sound generation
  carrier.start(now);
  carrierHarmonic.start(now);
  lfo.start(now);

  activeSiren = {
    carrier,
    carrierHarmonic,
    lfo,
    lfoGain,
    masterGain,
  };
}

/**
 * Immediately silences and stops the security siren with a subtle anti-pop fade.
 */
export function stopAlarm() {
  if (!activeSiren) return;

  const { carrier, carrierHarmonic, lfo, masterGain } = activeSiren;
  const c = getCtx();
  if (c) {
    const now = c.currentTime;
    try {
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(0.001, now + 0.05);

      setTimeout(() => {
        try {
          carrier.stop();
          carrierHarmonic.stop();
          lfo.stop();
          carrier.disconnect();
          carrierHarmonic.disconnect();
          lfo.disconnect();
          masterGain.disconnect();
        } catch {}
      }, 60);
    } catch {
      try {
        carrier.stop();
        carrierHarmonic.stop();
        lfo.stop();
      } catch {}
    }
  }

  activeSiren = null;
}
