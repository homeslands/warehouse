import { AxiosError } from 'axios'

import { shouldRetry } from './providers'

const apiError = (statusCode: number) => ({
  statusCode,
  timestamp: '',
  path: '',
  method: 'GET',
  message: 'x',
})

describe('shouldRetry (react-query)', () => {
  it('4xx → không thử lại', () => {
    expect(shouldRetry(0, apiError(400))).toBe(false)
    expect(shouldRetry(0, apiError(403))).toBe(false)
    expect(shouldRetry(0, apiError(429))).toBe(false)
  })

  it('5xx / mất mạng → thử lại đúng 1 lần', () => {
    expect(shouldRetry(0, apiError(503))).toBe(true)
    expect(shouldRetry(1, apiError(503))).toBe(false)
    const network = new AxiosError('Network Error', AxiosError.ERR_NETWORK)
    expect(shouldRetry(0, network)).toBe(true)
    expect(shouldRetry(1, network)).toBe(false)
  })
})
