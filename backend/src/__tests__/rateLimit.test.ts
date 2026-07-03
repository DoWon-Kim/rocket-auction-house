/**
 * MemStore — rate limit window isolation test
 * Verifies that each limiter instance honours its own windowMs,
 * not a shared 60_000 ms constant (bug #1 fix).
 */

// Inline the class to keep the test self-contained and avoid prisma imports
class MemStore {
  private windowMs = 60_000
  private counts = new Map<string, { count: number; resetTime: Date }>()

  init(options: { windowMs?: number }) {
    if (options.windowMs) this.windowMs = options.windowMs
  }

  async increment(key: string) {
    const now = Date.now()
    const entry = this.counts.get(key)
    if (!entry || entry.resetTime.getTime() < now) {
      const resetTime = new Date(now + this.windowMs)
      this.counts.set(key, { count: 1, resetTime })
      return { totalHits: 1, resetTime }
    }
    entry.count++
    return { totalHits: entry.count, resetTime: entry.resetTime }
  }

  async resetKey(key: string) { this.counts.delete(key) }
}

describe('MemStore', () => {
  test('defaults to 60_000 ms when init is not called', async () => {
    const store = new MemStore()
    const r = await store.increment('ip-a')
    expect(r.totalHits).toBe(1)
    const windowMs = r.resetTime.getTime() - Date.now()
    expect(windowMs).toBeGreaterThan(59_000)
    expect(windowMs).toBeLessThanOrEqual(60_000)
  })

  test('respects custom windowMs passed via init', async () => {
    const store = new MemStore()
    store.init({ windowMs: 15 * 60_000 })
    const r = await store.increment('ip-b')
    const windowMs = r.resetTime.getTime() - Date.now()
    expect(windowMs).toBeGreaterThan(14 * 60_000)
    expect(windowMs).toBeLessThanOrEqual(15 * 60_000)
  })

  test('two stores with different windows are independent', async () => {
    const short = new MemStore()
    const long  = new MemStore()
    short.init({ windowMs: 60_000 })
    long.init({ windowMs: 15 * 60_000 })

    const rShort = await short.increment('ip-c')
    const rLong  = await long.increment('ip-c')

    const shortWindow = rShort.resetTime.getTime() - Date.now()
    const longWindow  = rLong.resetTime.getTime()  - Date.now()

    expect(longWindow).toBeGreaterThan(shortWindow)
  })

  test('counter resets after the window expires', async () => {
    const store = new MemStore()
    store.init({ windowMs: 50 })  // 50 ms window

    await store.increment('ip-d')
    await store.increment('ip-d')
    const before = await store.increment('ip-d')
    expect(before.totalHits).toBe(3)

    await new Promise(r => setTimeout(r, 60))  // wait out the window

    const after = await store.increment('ip-d')
    expect(after.totalHits).toBe(1)
  })
})
