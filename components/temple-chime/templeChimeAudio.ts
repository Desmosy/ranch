/**
 * Synthesized bead-curtain / wind-chime sound, built entirely with the
 * Web Audio API — no audio files. Each "brush" through the strands is a
 * short percussive click (beads knocking together) topped with a bright,
 * inharmonic bell partial stack (small temple bells), volume and
 * brightness scaled by how fast the hand moves through the curtain.
 *
 * Browsers keep audio muted until the page receives a real user gesture
 * (click / tap / key). Global unlock listeners are attached on first use
 * so any interaction anywhere on the page arms the audio.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let lastPlay = 0
let listenersAttached = false

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.85
    master.connect(ctx.destination)

    // 1s of white noise, reused by every knock
    const len = ctx.sampleRate
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }
  attachUnlockListeners()
  return ctx
}

/** Resume the context and play a silent kick (required on iOS). */
function tryUnlock() {
  if (!ctx) return
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  try {
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
  } catch {
    // ignore
  }
}

function attachUnlockListeners() {
  if (listenersAttached || typeof window === 'undefined') return
  listenersAttached = true
  const unlock = () => {
    tryUnlock()
    if (ctx && ctx.state === 'running') {
      for (const ev of GESTURES) window.removeEventListener(ev, unlock)
    }
  }
  const GESTURES = ['pointerdown', 'touchstart', 'keydown', 'click'] as const
  for (const ev of GESTURES) window.addEventListener(ev, unlock, { passive: true })
}

/**
 * Kept for callers that want to force an unlock attempt from their own
 * gesture handlers (e.g. the curtain's pointerdown).
 */
export function unlockTempleChimeAudio() {
  ensureContext()
  tryUnlock()
}

/**
 * Play one bead-knock. `intensity` 0..1 maps hand speed to volume and
 * brightness. Throttled internally so rapid pointermove events blend
 * into a continuous rattle instead of machine-gunning bursts.
 */
export function playTempleChimeBrush(intensity: number) {
  const c = ensureContext()
  if (!c || !master || !noiseBuffer) return
  if (c.state === 'suspended') {
    c.resume().catch(() => {})
    return
  }

  const now = performance.now()
  if (now - lastPlay < 65) return
  lastPlay = now

  const t = c.currentTime
  const amp = 0.045 + Math.min(1, intensity) * 0.1

  // bead-on-bead click: tight, high bandpassed noise burst with a very
  // quick decay — sharper and shorter than a fabric swish
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  src.playbackRate.value = 0.9 + Math.random() * 0.4

  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2400 + intensity * 2200 + Math.random() * 600
  bp.Q.value = 2.2

  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(amp, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)

  src.connect(bp)
  bp.connect(g)
  g.connect(master)
  src.start(t, Math.random() * 0.5, 0.12)
  src.stop(t + 0.14)

  // small temple bell strike — inharmonic partials so overlapping
  // chimes stay bright and metallic rather than muddy
  if (intensity > 0.06) {
    // pentatonic-ish strike tones so overlapping bells stay consonant
    const notes = [1567.98, 1760, 2093, 2349.3, 2637, 3135.96]
    const f0 = notes[Math.floor(Math.random() * notes.length)]
    const partials = [
      { ratio: 1, gain: 1, decay: 0.85 },
      { ratio: 2.4, gain: 0.5, decay: 0.5 },
      { ratio: 4.1, gain: 0.26, decay: 0.3 },
      { ratio: 6.8, gain: 0.13, decay: 0.16 },
    ]
    const strikeAmp = 0.045 + intensity * 0.08
    const detune = 1 + (Math.random() - 0.5) * 0.015

    for (const p of partials) {
      const osc = c.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = f0 * p.ratio * detune

      const og = c.createGain()
      const pAmp = strikeAmp * p.gain
      og.gain.setValueAtTime(0, t)
      og.gain.linearRampToValueAtTime(pAmp, t + 0.003)
      og.gain.exponentialRampToValueAtTime(0.0001, t + p.decay)

      osc.connect(og)
      og.connect(master)
      osc.start(t)
      osc.stop(t + p.decay + 0.05)
    }

    // occasional second, softer knock a moment later — neighboring
    // beads bumping as the strand swings back
    if (Math.random() < 0.4) {
      const dt = 0.05 + Math.random() * 0.07
      const f1 = notes[Math.floor(Math.random() * notes.length)]
      const osc2 = c.createOscillator()
      osc2.type = 'sine'
      osc2.frequency.value = f1 * detune

      const og2 = c.createGain()
      og2.gain.setValueAtTime(0, t + dt)
      og2.gain.linearRampToValueAtTime(strikeAmp * 0.45, t + dt + 0.003)
      og2.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.5)

      osc2.connect(og2)
      og2.connect(master)
      osc2.start(t + dt)
      osc2.stop(t + dt + 0.55)
    }
  }
}
