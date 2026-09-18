import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'warehouse.auth'
const pair = { accessToken: 'acc-1', refreshToken: 'ref-1' }

// Module đọc/xoá key cũ lúc nạp → nạp lại sau khi chuẩn bị localStorage cho từng test.
async function load() {
  vi.resetModules()
  return import('./token-storage')
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('token-storage', () => {
  it('chưa có gì → getTokens() là null', async () => {
    const { getTokens } = await load()
    expect(getTokens()).toBeNull()
  })

  it('setTokens rồi getTokens trả đúng cặp, lưu dưới một key JSON', async () => {
    const { getTokens, setTokens } = await load()
    setTokens(pair)
    expect(getTokens()).toEqual(pair)
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(pair)
  })

  it('clearTokens xoá key', async () => {
    const { clearTokens, getTokens, setTokens } = await load()
    setTokens(pair)
    clearTokens()
    expect(getTokens()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it.each([
    ['không phải JSON', '{hỏng'],
    ['thiếu refreshToken', JSON.stringify({ accessToken: 'a' })],
    ['sai kiểu', JSON.stringify({ accessToken: 1, refreshToken: 2 })],
    ['chuỗi rỗng', JSON.stringify({ accessToken: '', refreshToken: '' })],
  ])('dữ liệu hỏng (%s) → null, không ném', async (_, raw) => {
    localStorage.setItem(KEY, raw)
    const { getTokens } = await load()
    expect(getTokens()).toBeNull()
  })

  it('xoá key cũ warehouse.accessToken khi nạp module', async () => {
    localStorage.setItem('warehouse.accessToken', 'token-cu')
    await load()
    expect(localStorage.getItem('warehouse.accessToken')).toBeNull()
  })

  it('subscribe nhận thay đổi trong cùng tab', async () => {
    const { clearTokens, setTokens, subscribe } = await load()
    const listener = vi.fn()
    subscribe(listener)
    setTokens(pair)
    clearTokens()
    expect(listener).toHaveBeenNthCalledWith(1, pair)
    expect(listener).toHaveBeenNthCalledWith(2, null)
  })

  it('subscribe nhận thay đổi từ tab khác qua sự kiện storage', async () => {
    const { subscribe } = await load()
    const listener = vi.fn()
    subscribe(listener)

    localStorage.setItem(KEY, JSON.stringify(pair))
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    expect(listener).toHaveBeenLastCalledWith(pair)

    localStorage.removeItem(KEY)
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    expect(listener).toHaveBeenLastCalledWith(null)
  })

  it('tab khác gọi localStorage.clear() (key null) → listener nhận null', async () => {
    const { subscribe } = await load()
    const listener = vi.fn()
    subscribe(listener)

    localStorage.setItem(KEY, JSON.stringify(pair))
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(listener).toHaveBeenCalledWith(null)
  })

  it('bỏ qua sự kiện storage của key khác', async () => {
    const { subscribe } = await load()
    const listener = vi.fn()
    subscribe(listener)
    window.dispatchEvent(new StorageEvent('storage', { key: 'warehouse.language' }))
    expect(listener).not.toHaveBeenCalled()
  })

  it('huỷ subscribe thì không nhận nữa', async () => {
    const { setTokens, subscribe } = await load()
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    unsubscribe()
    setTokens(pair)
    expect(listener).not.toHaveBeenCalled()
  })

  it('nạp module không ném dù xoá key cũ lỗi (storage bị chặn)', async () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    await expect(load()).resolves.toBeDefined()
  })

  it('getTokens trả null khi localStorage.getItem ném lỗi (storage bị chặn)', async () => {
    const { getTokens } = await load()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(getTokens()).toBeNull()
  })

  it('clearTokens không ném khi removeItem lỗi, vẫn notify listener với null', async () => {
    const { clearTokens, setTokens, subscribe } = await load()
    setTokens(pair)
    const listener = vi.fn()
    subscribe(listener)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => clearTokens()).not.toThrow()
    expect(listener).toHaveBeenCalledWith(null)
  })
})
