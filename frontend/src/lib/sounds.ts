/* Web Audio API 합성 효과음 — 외부 파일 없이 브라우저에서 직접 생성 */

class SoundPlayer {
  private ctx: AudioContext | null = null

  private getCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return this.ctx
  }

  private noise(ctx: AudioContext, durationSec: number): AudioBufferSourceNode {
    const size = Math.floor(ctx.sampleRate * durationSec)
    const buf = ctx.createBuffer(1, size, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < size; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    return src
  }

  // 팩 오픈 (뽑기 버튼 클릭)
  packOpen() {
    try {
      const ctx = this.getCtx()
      const out = ctx.destination
      const t = ctx.currentTime

      // 낮은 rumble
      const rumble = ctx.createOscillator()
      rumble.type = 'sine'
      rumble.frequency.setValueAtTime(90, t)
      rumble.frequency.exponentialRampToValueAtTime(35, t + 0.4)
      const rGain = ctx.createGain()
      rGain.gain.setValueAtTime(0.35, t)
      rGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
      rumble.connect(rGain); rGain.connect(out)
      rumble.start(t); rumble.stop(t + 0.5)

      // whoosh 노이즈
      const whoosh = this.noise(ctx, 0.45)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(2500, t)
      bp.frequency.exponentialRampToValueAtTime(700, t + 0.4)
      bp.Q.value = 1.5
      const wGain = ctx.createGain()
      wGain.gain.setValueAtTime(0.18, t)
      wGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
      whoosh.connect(bp); bp.connect(wGain); wGain.connect(out)
      whoosh.start(t); whoosh.stop(t + 0.5)
    } catch { /* 사운드 오류는 무시 */ }
  }

  // 스포트라이트 등장음 (등급별)
  spotlightReveal(isLastOne: boolean) {
    try {
      const ctx = this.getCtx()
      const out = ctx.destination
      const t = ctx.currentTime

      if (isLastOne) {
        // ── Last One: 묵직한 붐 + 웅장한 팡파르 ──

        // 베이스 붐
        const bass = ctx.createOscillator()
        bass.type = 'sine'
        bass.frequency.setValueAtTime(55, t)
        bass.frequency.exponentialRampToValueAtTime(28, t + 0.6)
        const bGain = ctx.createGain()
        bGain.gain.setValueAtTime(0.55, t)
        bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7)
        bass.connect(bGain); bGain.connect(out)
        bass.start(t); bass.stop(t + 0.8)

        // 팡파르 아르페지오 (E4 G#4 B4 E5)
        ;[330, 415, 494, 659].forEach((freq, i) => {
          const osc = ctx.createOscillator()
          osc.type = 'triangle'
          osc.frequency.value = freq
          const g = ctx.createGain()
          const onset = t + i * 0.09
          g.gain.setValueAtTime(0, onset)
          g.gain.linearRampToValueAtTime(0.22, onset + 0.06)
          g.gain.exponentialRampToValueAtTime(0.001, onset + 0.5)
          osc.connect(g); g.connect(out)
          osc.start(onset); osc.stop(onset + 0.6)
        })

        // 고음 스파클
        ;[1200, 1600, 2100].forEach((freq, i) => {
          const osc = ctx.createOscillator()
          osc.type = 'sine'
          osc.frequency.value = freq
          const g = ctx.createGain()
          const onset = t + 0.18 + i * 0.09
          g.gain.setValueAtTime(0.09, onset)
          g.gain.exponentialRampToValueAtTime(0.001, onset + 0.35)
          osc.connect(g); g.connect(out)
          osc.start(onset); osc.stop(onset + 0.4)
        })

      } else {
        // ── ★★★: 상승하는 빛나는 코드 ──
        ;[523, 659, 784].forEach((freq, i) => {
          const osc = ctx.createOscillator()
          osc.type = 'triangle'
          osc.frequency.value = freq
          const g = ctx.createGain()
          const onset = t + i * 0.1
          g.gain.setValueAtTime(0, onset)
          g.gain.linearRampToValueAtTime(0.18, onset + 0.06)
          g.gain.exponentialRampToValueAtTime(0.001, onset + 0.45)
          osc.connect(g); g.connect(out)
          osc.start(onset); osc.stop(onset + 0.55)
        })

        // 반짝이는 shimmer
        const shimmer = ctx.createOscillator()
        shimmer.type = 'sine'
        shimmer.frequency.setValueAtTime(1800, t + 0.22)
        shimmer.frequency.exponentialRampToValueAtTime(2600, t + 0.55)
        const sGain = ctx.createGain()
        sGain.gain.setValueAtTime(0.07, t + 0.22)
        sGain.gain.exponentialRampToValueAtTime(0.001, t + 0.65)
        shimmer.connect(sGain); sGain.connect(out)
        shimmer.start(t + 0.22); shimmer.stop(t + 0.7)
      }
    } catch { /* 사운드 오류는 무시 */ }
  }

  // 카드 뒤집기
  cardFlip() {
    try {
      const ctx = this.getCtx()
      const out = ctx.destination
      const t = ctx.currentTime

      // swish 노이즈
      const swish = this.noise(ctx, 0.14)
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.setValueAtTime(4500, t)
      hp.frequency.exponentialRampToValueAtTime(1200, t + 0.1)
      const swGain = ctx.createGain()
      swGain.gain.setValueAtTime(0.06, t)
      swGain.gain.exponentialRampToValueAtTime(0.001, t + 0.13)
      swish.connect(hp); hp.connect(swGain); swGain.connect(out)
      swish.start(t); swish.stop(t + 0.15)

      // 부드러운 thud
      const thud = ctx.createOscillator()
      thud.type = 'sine'
      thud.frequency.setValueAtTime(220, t + 0.05)
      thud.frequency.exponentialRampToValueAtTime(80, t + 0.13)
      const tGain = ctx.createGain()
      tGain.gain.setValueAtTime(0.12, t + 0.05)
      tGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
      thud.connect(tGain); tGain.connect(out)
      thud.start(t + 0.05); thud.stop(t + 0.18)
    } catch { /* 사운드 오류는 무시 */ }
  }

  // 전체 카드 공개 시작
  allReveal() {
    try {
      const ctx = this.getCtx()
      const out = ctx.destination
      const t = ctx.currentTime

      const w = this.noise(ctx, 0.32)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(700, t)
      bp.frequency.exponentialRampToValueAtTime(2200, t + 0.25)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.09, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32)
      w.connect(bp); bp.connect(g); g.connect(out)
      w.start(t); w.stop(t + 0.35)
    } catch { /* 사운드 오류는 무시 */ }
  }
}

// SSR 안전 처리
export const sounds: SoundPlayer | null =
  typeof window !== 'undefined' ? new SoundPlayer() : null
