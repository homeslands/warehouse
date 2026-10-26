import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/shared/api/types'
import {
  EXPORT_FORM_NOT_DRAFT,
  EXPORT_FORM_NOT_FOUND,
  EXPORT_FORM_NOT_OWNER,
  EXPORT_FORM_NOT_PENDING,
  INVENTORY_AVAILABLE_INSUFFICIENT,
  MATERIAL_BATCH_INSUFFICIENT,
  isShortageError,
  isStaleExportFormError,
} from './error-codes'

const err = (statusCode: number, code: number): ApiError => ({
  statusCode,
  code,
  timestamp: '',
  path: '',
  method: '',
  message: 'x',
})

describe('mã lỗi phiếu xuất', () => {
  it('đúng số theo BE', () => {
    expect(EXPORT_FORM_NOT_FOUND).toBe(101401)
    expect(EXPORT_FORM_NOT_DRAFT).toBe(101415)
    expect(EXPORT_FORM_NOT_OWNER).toBe(101416)
    expect(EXPORT_FORM_NOT_PENDING).toBe(101437)
    expect(INVENTORY_AVAILABLE_INSUFFICIENT).toBe(100817)
    expect(MATERIAL_BATCH_INSUFFICIENT).toBe(101502)
  })
})

describe('isStaleExportFormError', () => {
  it.each([
    ['409 version lệch', 409, 100800],
    ['101401 không còn', 404, 101401],
    ['NOT_DRAFT', 409, EXPORT_FORM_NOT_DRAFT],
    ['NOT_PENDING', 409, EXPORT_FORM_NOT_PENDING],
    ['NOT_OWNER', 403, EXPORT_FORM_NOT_OWNER],
  ])('%s → cũ', (_, status, code) => {
    expect(isStaleExportFormError(err(status, code))).toBe(true)
  })

  it.each([100817, 101502])('thiếu hàng %i (409) → KHÔNG cũ', (code) => {
    expect(isStaleExportFormError(err(409, code))).toBe(false)
  })

  it('lỗi khác / không phải ApiError → không cũ', () => {
    expect(isStaleExportFormError(err(400, 101404))).toBe(false)
    expect(isStaleExportFormError(new Error('x'))).toBe(false)
  })
})

describe('isShortageError', () => {
  it.each([100817, 101502])('%i → thiếu hàng', (code) => {
    expect(isShortageError(err(409, code))).toBe(true)
  })

  it('version lệch / mã phiếu cũ / không phải ApiError → không', () => {
    expect(isShortageError(err(409, 100800))).toBe(false)
    expect(isShortageError(err(409, EXPORT_FORM_NOT_PENDING))).toBe(false)
    expect(isShortageError(new Error('x'))).toBe(false)
  })
})
