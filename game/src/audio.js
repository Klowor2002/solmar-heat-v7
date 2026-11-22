// audio.js — every sound in Solmar is synthesized: no audio files,
// no samples, just oscillators and filtered noise started on the
// player's first click or keypress (which is when browsers allow an
// AudioContext to live at all).
//
// Engine hum follows the player's speed, the siren is a two-tone
// oscillator that only exists while a cruiser is close, gunfire is a
// shaped noise burst, and SOLMAR FM is a tiny two-oscillator loop —
// a bass pulse and a pentatonic twinkle — sequenced off the clock.
export function makeAudio(state) {
  let ctx = null, master = null;
  let engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null;
  let radioTimer = null, radioStep = 0;
  const BASS = [55, 55, 82.4, 55, 65.4, 55, 98, 73.4];
  const LEAD = [220, 261.6, 329.6, 392, 329.6, 261.6, 293.7, 220];

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; return false; }
    return true;
  }

  function blip(freq, dur, type = 'square', vol = 0.16, slide = 0) {
    if (!ensure()) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur);
  }

  function noise(dur, vol, freq) {
    if (!ensure()) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  function startRadio() {
    if (radioTimer || !ensure()) return;
    radioTimer = setInterval(() => {
      if (state.paused || state.screen !== 'game') return;
      const b = BASS[radioStep % BASS.length];
      const l = LEAD[(radioStep * 3) % LEAD.length];
      blip(b, 0.22, 'triangle', 0.11);
      if (radioStep % 2 === 0) blip(l, 0.16, 'sine', 0.05);
      radioStep++;
    }, 240);
  }

  return {
    unlock() { if (ensure()) startRadio(); },
    gunshot(vol = 0.22) { noise(0.14, vol, 1600); },
    dryFire() { blip(1200, 0.04, 'square', 0.05); },
    punch() { noise(0.07, 0.12, 500); },
    reload() { blip(300, 0.06, 'square', 0.08); setTimeout(() => blip(520, 0.05, 'square', 0.08), 130); },
    pickup() { blip(880, 0.09, 'sine', 0.12, 320); },
    cash() { blip(660, 0.07, 'square', 0.09); setTimeout(() => blip(990, 0.1, 'square', 0.09), 70); },
    horn() { blip(370, 0.28, 'sawtooth', 0.1); blip(466, 0.28, 'sawtooth', 0.07); },
    missionDone() { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.12), i * 90)); },
    engineStart() {
      if (!ensure() || engineOsc) return;
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
      engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    },
    update() {
      if (!ctx) return;
      const p = state.player;
      if (engineOsc) {
        const driving = p.inCar && p.car;
        const target = driving ? 0.05 + Math.abs(p.car.speed) * 0.002 : 0.0;
        engineGain.gain.value += (target - engineGain.gain.value) * 0.2;
        if (driving) engineOsc.frequency.value = 55 + Math.abs(p.car.speed) * 3.4;
      }
      const copNear = state.copCars && state.copCars.length > 0 && state.wanted > 0;
      if (copNear && !sirenOsc) {
        sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain(); sirenGain.gain.value = 0.035;
        sirenOsc.connect(sirenGain); sirenGain.connect(master);
        sirenOsc.start();
      }
      if (sirenOsc) {
        sirenOsc.frequency.value = (Math.floor(state.time * 1.6) % 2) ? 660 : 880;
        if (!copNear) { try { sirenOsc.stop(); } catch (e) { /* already stopped */ } sirenOsc = null; }
      }
    },
  };
}
