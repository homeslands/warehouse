import { Appearance } from 'react-native'

import { kv } from '@/shared/storage/kv'

import { initAppearance, setAppearance, useAppearance } from './appearance'

const STORAGE_KEY = 'warehouse.appearance'

let setColorScheme: jest.SpyInstance

beforeEach(async () => {
  setColorScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {})
  await kv.remove(STORAGE_KEY)
  useAppearance.setState({ preference: 'system' })
})

afterEach(() => jest.restoreAllMocks())

describe('appearance', () => {
  it('chưa lưu gì → theo hệ thống (bỏ ghi đè)', async () => {
    await initAppearance()
    expect(useAppearance.getState().preference).toBe('system')
    expect(setColorScheme).toHaveBeenCalledWith('unspecified')
  })

  it('đã lưu "dark" → áp dụng tối cho cả app (native)', async () => {
    await kv.set(STORAGE_KEY, 'dark')
    await initAppearance()
    expect(useAppearance.getState().preference).toBe('dark')
    expect(setColorScheme).toHaveBeenCalledWith('dark')
  })

  it('giá trị lưu hỏng → theo hệ thống', async () => {
    await kv.set(STORAGE_KEY, 'purple')
    await initAppearance()
    expect(useAppearance.getState().preference).toBe('system')
    expect(setColorScheme).toHaveBeenCalledWith('unspecified')
  })

  it('setAppearance: đổi store, ghi đè native và lưu trên máy', async () => {
    await setAppearance('light')
    expect(useAppearance.getState().preference).toBe('light')
    expect(setColorScheme).toHaveBeenLastCalledWith('light')
    expect(await kv.get(STORAGE_KEY)).toBe('light')

    await setAppearance('system')
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified')
    expect(await kv.get(STORAGE_KEY)).toBe('system')
  })
})
