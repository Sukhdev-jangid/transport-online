// Short status beep so the user instantly knows a save outcome even without
// reading the toast: a short high tone on success, a low buzz when a save
// FAILS (record not persisted). Uses the Web Audio API so no asset files are
// needed, and never throws if audio is unavailable (the toast still shows).
export function playSound(ok) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    if (ok) {
      osc.type = 'sine'; osc.frequency.value = 880
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
      osc.start(); osc.stop(ctx.currentTime + 0.18)
    } else {
      osc.type = 'square'; osc.frequency.value = 220
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
      osc.start(); osc.stop(ctx.currentTime + 0.6)
    }
  } catch (e) { /* audio unavailable — toast still shows */ }
}
