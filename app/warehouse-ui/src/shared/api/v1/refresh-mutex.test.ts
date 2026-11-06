/**
 * Mutex refresh giữa các tab khi KHÔNG có Web Locks (BE Q3: không có grace window). Hai "tab" mô
 * phỏng bằng hai instance khác `tabId` trên cùng localStorage; kênh BroadcastChannel là MOCK bus.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { V1_REFRESH_MUTEX_KEY, createStorageMutex } from './refresh-mutex'

type Listener = (event: MessageEvent) => void

/** Bus thay BroadcastChannel: mọi kênh cùng tên nhận message của nhau (trừ chính nó). */
function fakeChannelFactory() {
  const channels = new Set<{ onmessage: Listener | null; close: () => void }>()
  return () => {
    const channel = {
      onmessage: null as Listener | null,
      postMessage(data: unknown) {
        channels.forEach((c) => {
          if (c !== channel) c.onmessage?.(new MessageEvent('message', { data }))
        })
      },
      close() {
        channels.delete(channel)
      },
    }
    channels.add(channel)
    return channel as unknown as BroadcastChannel
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

afterEach(() => {
  localStorage.removeItem(V1_REFRESH_MUTEX_KEY)
})

describe('createStorageMutex', () => {
  it('hai tab refresh cùng lúc → chạy TUẦN TỰ, không chồng nhau; tab chờ tỉnh dậy nhờ tín hiệu nhả khoá', async () => {
    const createChannel = fakeChannelFactory()
    // pollMs lớn: tab chờ chỉ tiếp tục kịp thời nếu tín hiệu nhả khoá hoạt động.
    const tabA = createStorageMutex({ tabId: 'A', settleMs: 5, pollMs: 10_000, createChannel })
    const tabB = createStorageMutex({ tabId: 'B', settleMs: 5, pollMs: 10_000, createChannel })
    const log: string[] = []
    const task = (name: string) => async () => {
      log.push(`${name}:start`)
      await sleep(30)
      log.push(`${name}:end`)
      return name
    }

    const started = Date.now()
    const results = await Promise.all([tabA(task('A')), tabB(task('B'))])

    expect(results).toEqual(['A', 'B'])
    // Không chồng nhau: start/end của một tab liền nhau, rồi mới tới tab kia.
    expect([
      ['A:start', 'A:end', 'B:start', 'B:end'],
      ['B:start', 'B:end', 'A:start', 'A:end'],
    ]).toContainEqual(log)
    expect(Date.now() - started).toBeLessThan(2000)
    expect(localStorage.getItem(V1_REFRESH_MUTEX_KEY)).toBeNull()
  })

  it('tab giữ khoá chết (không nhả) → tab khác giành lại sau TTL, không treo mãi', async () => {
    localStorage.setItem(
      V1_REFRESH_MUTEX_KEY,
      JSON.stringify({ owner: 'dead', expiresAt: Date.now() + 80 }),
    )
    const tab = createStorageMutex({ tabId: 'B', settleMs: 5, pollMs: 20, createChannel: null })
    const started = Date.now()
    await expect(tab(async () => 'ran')).resolves.toBe('ran')
    expect(Date.now() - started).toBeGreaterThanOrEqual(70)
  })

  it('task lỗi vẫn nhả khoá', async () => {
    const tab = createStorageMutex({ tabId: 'A', settleMs: 1, createChannel: null })
    await expect(tab(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(localStorage.getItem(V1_REFRESH_MUTEX_KEY)).toBeNull()
  })

  it('không xoá khoá của tab khác khi khoá của mình đã hết hạn và bị giành', async () => {
    const tab = createStorageMutex({ tabId: 'A', settleMs: 1, createChannel: null })
    await tab(async () => {
      localStorage.setItem(
        V1_REFRESH_MUTEX_KEY,
        JSON.stringify({ owner: 'B', expiresAt: Date.now() + 10_000 }),
      )
    })
    expect(localStorage.getItem(V1_REFRESH_MUTEX_KEY)).toContain('"B"')
  })
})
