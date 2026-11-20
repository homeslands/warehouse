import AsyncStorage from '@react-native-async-storage/async-storage'

import { kv } from '@/shared/storage/kv'

import { WELCOME_SEEN_KEY, initWelcome, markWelcomeSeen, useWelcome } from './welcome.store'

beforeEach(async () => {
  await AsyncStorage.clear()
  useWelcome.setState({ seen: null })
})

afterEach(() => jest.restoreAllMocks())

describe('cờ màn chào', () => {
  it('khoá lưu là warehouse.welcomeSeen', () => {
    expect(WELCOME_SEEN_KEY).toBe('warehouse.welcomeSeen')
  })

  it('chưa có cờ → chưa xem', async () => {
    await initWelcome()
    expect(useWelcome.getState().seen).toBe(false)
  })

  it('cờ true → đã xem', async () => {
    await kv.set(WELCOME_SEEN_KEY, true)
    await initWelcome()
    expect(useWelcome.getState().seen).toBe(true)
  })

  it('giá trị hỏng → coi như đã xem (không chặn đăng nhập)', async () => {
    await AsyncStorage.setItem(WELCOME_SEEN_KEY, '{x')
    await initWelcome()
    expect(useWelcome.getState().seen).toBe(true)
  })

  it('đọc lỗi → coi như đã xem (không chặn đăng nhập)', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('hỏng'))
    await initWelcome()
    expect(useWelcome.getState().seen).toBe(true)
  })

  it('markWelcomeSeen → đã xem ngay (trước khi ghi xong) và lưu cờ true', async () => {
    useWelcome.setState({ seen: false })
    const pending = markWelcomeSeen()
    expect(useWelcome.getState().seen).toBe(true)
    await pending
    expect(await kv.get(WELCOME_SEEN_KEY)).toBe(true)
  })
})
