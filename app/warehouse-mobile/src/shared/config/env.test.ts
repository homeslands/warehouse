import { isSandbox, readEnv } from './env'

describe('readEnv', () => {
  it('bỏ "/" cuối và trim khoảng trắng', () => {
    expect(
      readEnv({
        EXPO_PUBLIC_API_BASE_URL: '  https://x/api/v1/ ',
        EXPO_PUBLIC_APP_VARIANT: 'preview',
      }),
    ).toEqual({ apiBaseUrl: 'https://x/api/v1', variant: 'preview' })
  })

  it('thiếu URL thì ném lỗi chứa tên biến', () => {
    expect(() => readEnv({})).toThrow('EXPO_PUBLIC_API_BASE_URL')
    expect(() => readEnv({ EXPO_PUBLIC_API_BASE_URL: '   ' })).toThrow('EXPO_PUBLIC_API_BASE_URL')
  })

  it('variant lạ hoặc thiếu thì về development', () => {
    expect(
      readEnv({ EXPO_PUBLIC_API_BASE_URL: 'https://x', EXPO_PUBLIC_APP_VARIANT: 'foo' }).variant,
    ).toBe('development')
    expect(readEnv({ EXPO_PUBLIC_API_BASE_URL: 'https://x' }).variant).toBe('development')
  })
})

describe('isSandbox', () => {
  const prod = (apiBaseUrl: string) => ({ apiBaseUrl, variant: 'production' as const })

  it('production + URL thật → không phải sandbox (ẩn nhãn)', () => {
    expect(isSandbox(prod('https://warehouse.cmsiot.net/api/v1'))).toBe(false)
  })

  it('host chứa "sandbox" → sandbox, kể cả bản production', () => {
    expect(isSandbox(prod('https://sandbox.warehouse.cmsiot.net/api/v1.0.0'))).toBe(true)
    expect(isSandbox(prod('https://api-SANDBOX.example.com'))).toBe(true)
  })

  it('chỉ xét host, không xét path', () => {
    expect(isSandbox(prod('https://warehouse.cmsiot.net/sandbox/api'))).toBe(false)
  })

  it('variant không phải production → sandbox', () => {
    expect(isSandbox({ apiBaseUrl: 'http://localhost:8085/api/v1', variant: 'development' })).toBe(
      true,
    )
    expect(isSandbox({ apiBaseUrl: 'https://warehouse.cmsiot.net', variant: 'preview' })).toBe(true)
  })
})
