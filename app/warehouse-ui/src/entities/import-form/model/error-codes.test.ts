import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/shared/api/types'
import { isStaleImportFormError } from './error-codes'

const err = (statusCode: number, code: number): ApiError => ({
  statusCode,
  code,
  timestamp: '',
  path: '',
  method: '',
  message: 'x',
})

describe('isStaleImportFormError', () => {
  it('409 version lệch (100800) → cũ', () => {
    expect(isStaleImportFormError(err(409, 100800))).toBe(true)
  })

  it('101314 (không còn DRAFT) → cũ', () => {
    expect(isStaleImportFormError(err(409, 101314))).toBe(true)
  })

  it('101315 (không còn là chủ phiếu) → cũ', () => {
    expect(isStaleImportFormError(err(403, 101315))).toBe(true)
  })

  it('101301 (phiếu không còn) → cũ', () => {
    expect(isStaleImportFormError(err(404, 101301))).toBe(true)
  })

  it('lỗi khác (400 / 101304) → không cũ', () => {
    expect(isStaleImportFormError(err(400, 101304))).toBe(false)
  })

  it('không phải ApiError → không cũ', () => {
    expect(isStaleImportFormError(new Error('x'))).toBe(false)
  })
})
