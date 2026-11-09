import { Platform } from 'react-native'

import { appVersion } from './app-version'

const mockConfig: { current: unknown } = { current: null }
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConfig.current
    },
  },
}))

describe('appVersion', () => {
  it('phiên bản kèm số build của nền tảng', () => {
    mockConfig.current = {
      version: '1.0.0',
      ios: { buildNumber: '7' },
      android: { versionCode: 9 },
    }
    expect(appVersion()).toBe(Platform.OS === 'android' ? '1.0.0 (9)' : '1.0.0 (7)')
  })

  it('thiếu số build → chỉ phiên bản', () => {
    mockConfig.current = { version: '1.0.0' }
    expect(appVersion()).toBe('1.0.0')
  })

  it('thiếu phiên bản → "—"', () => {
    mockConfig.current = null
    expect(appVersion()).toBe('—')
  })
})
