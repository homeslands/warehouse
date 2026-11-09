import type * as SecureStoreType from 'expo-secure-store'

const KEY = 'warehouse.auth'
const pair = { accessToken: 'acc-1', refreshToken: 'ref-1' }

// Module giữ token trong bộ nhớ → nạp lại cho từng test. SecureStore cũng được nạp lại nên phải lấy
// từ cùng registry, nếu không sẽ kiểm nhầm instance mock.
async function load() {
  jest.resetModules()
  /* eslint-disable @typescript-eslint/no-require-imports */
  const storage = require('./token-storage') as typeof import('./token-storage')
  const SecureStore = require('expo-secure-store') as jest.Mocked<typeof SecureStoreType>
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { ...storage, SecureStore }
}

/** Chờ hàng đợi ghi (chuỗi promise) chạy hết. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

afterEach(() => jest.restoreAllMocks())

describe('hydrateTokens', () => {
  it('đọc JSON hợp lệ từ SecureStore rồi nạp vào bộ nhớ', async () => {
    const { hydrateTokens, getTokens, SecureStore } = await load()
    SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(pair))
    await expect(hydrateTokens()).resolves.toEqual(pair)
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(KEY)
    expect(getTokens()).toEqual(pair)
  })

  it('chưa có gì → null', async () => {
    const { hydrateTokens, getTokens } = await load()
    await expect(hydrateTokens()).resolves.toBeNull()
    expect(getTokens()).toBeNull()
  })

  it.each([
    ['không phải JSON', '{hỏng'],
    ['thiếu refreshToken', JSON.stringify({ accessToken: 'a' })],
    ['sai kiểu', JSON.stringify({ accessToken: 1, refreshToken: 2 })],
    ['chuỗi rỗng trong trường', JSON.stringify({ accessToken: '', refreshToken: '' })],
    ['chuỗi rỗng', ''],
    ['JSON null', 'null'],
  ])('dữ liệu hỏng (%s) → null, không ném', async (_, raw) => {
    const { hydrateTokens, getTokens, SecureStore } = await load()
    SecureStore.getItemAsync.mockResolvedValue(raw)
    await expect(hydrateTokens()).resolves.toBeNull()
    expect(getTokens()).toBeNull()
  })

  it('SecureStore đọc lỗi → null, không ném', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { hydrateTokens, SecureStore } = await load()
    SecureStore.getItemAsync.mockRejectedValue(new Error('keychain locked'))
    await expect(hydrateTokens()).resolves.toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('đăng nhập trong lúc đang đọc → giữ giá trị mới, không bị bản cũ ghi đè', async () => {
    const { hydrateTokens, setTokens, getTokens, SecureStore } = await load()
    let release!: (v: string) => void
    SecureStore.getItemAsync.mockReturnValue(new Promise<string>((r) => (release = r)))
    const hydrating = hydrateTokens()
    const fresh = { accessToken: 'acc-moi', refreshToken: 'ref-moi' }
    setTokens(fresh)
    release(JSON.stringify(pair))
    await expect(hydrating).resolves.toEqual(fresh)
    expect(getTokens()).toEqual(fresh)
  })
})

describe('setTokens / clearTokens', () => {
  it('chưa hydrate → getTokens() là null', async () => {
    const { getTokens } = await load()
    expect(getTokens()).toBeNull()
  })

  it('setTokens xong getTokens trả NGAY (đồng bộ), SecureStore ghi dưới key warehouse.auth', async () => {
    const { setTokens, getTokens, SecureStore } = await load()
    setTokens(pair)
    expect(getTokens()).toEqual(pair)
    await flush()
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(KEY, JSON.stringify(pair))
  })

  it('clearTokens xoá bộ nhớ và key SecureStore', async () => {
    const { setTokens, clearTokens, getTokens, SecureStore } = await load()
    setTokens(pair)
    clearTokens()
    expect(getTokens()).toBeNull()
    await flush()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEY)
  })

  it('ghi SecureStore lỗi → không unhandled rejection, bộ nhớ vẫn đúng', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const { setTokens, clearTokens, getTokens, SecureStore } = await load()
      SecureStore.setItemAsync.mockRejectedValue(new Error('disk full'))
      SecureStore.deleteItemAsync.mockRejectedValue(new Error('disk full'))
      setTokens(pair)
      expect(getTokens()).toEqual(pair)
      clearTokens()
      await flush()
      await flush()
      expect(warn).toHaveBeenCalledTimes(2)
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('ghi theo đúng thứ tự: set rồi clear liền nhau → SecureStore kết thúc ở trạng thái xoá', async () => {
    const { setTokens, clearTokens, SecureStore } = await load()
    const order: string[] = []
    SecureStore.setItemAsync.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      order.push('set')
    })
    SecureStore.deleteItemAsync.mockImplementation(async () => {
      order.push('delete')
    })
    setTokens(pair)
    clearTokens()
    await new Promise((r) => setTimeout(r, 30))
    expect(order).toEqual(['set', 'delete'])
  })
})

describe('subscribe', () => {
  it('setTokens báo cặp mới, clearTokens báo null', async () => {
    const { subscribe, setTokens, clearTokens } = await load()
    const listener = jest.fn()
    subscribe(listener)
    setTokens(pair)
    expect(listener).toHaveBeenLastCalledWith(pair)
    clearTokens()
    expect(listener).toHaveBeenLastCalledWith(null)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('huỷ đăng ký thì không nhận nữa', async () => {
    const { subscribe, setTokens } = await load()
    const listener = jest.fn()
    const unsubscribe = subscribe(listener)
    unsubscribe()
    setTokens(pair)
    expect(listener).not.toHaveBeenCalled()
  })
})
