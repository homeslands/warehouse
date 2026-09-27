import { describe, expect, it } from 'vitest'
import enErrors from '@/shared/i18n/locales/en/errors.json'
import viErrors from '@/shared/i18n/locales/vi/errors.json'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { apiError } from '@/shared/test/api'
import { ERROR_CODE_KEYS } from './error-codes'

/**
 * Mã lỗi kho (1005xx) và cửa hàng (1010xx) — đồng bộ warehouse/store `*.validation.ts`.
 * 100512 (`warehouseVersionIsRequired`) và 101015 (`storeVersionIsRequired`) đã bị backend bỏ cùng
 * `version` của kho/cửa hàng (WMS-10-be(2)) — loại khỏi hai dải mã còn lại.
 */
const WAREHOUSE_CODES = Array.from({ length: 17 }, (_, i) => 100501 + i).filter((c) => c !== 100512)
const STORE_CODES = Array.from({ length: 20 }, (_, i) => 101001 + i).filter((c) => c !== 101015)

describe('ERROR_CODE_KEYS — kho và cửa hàng', () => {
  it.each(WAREHOUSE_CODES)('mã kho %i có khoá i18n', (code) => {
    expect(ERROR_CODE_KEYS[code]).toBeDefined()
  })

  it.each(STORE_CODES)('mã cửa hàng %i có khoá i18n', (code) => {
    expect(ERROR_CODE_KEYS[code]).toBeDefined()
  })

  it('mã gắn với ô form đúng khoá — form map lỗi backend vào ô theo bảng này', () => {
    expect(ERROR_CODE_KEYS[100506]).toBe('warehouseCodeDoesExist')
    expect(ERROR_CODE_KEYS[100505]).toBe('warehouseCodeInvalid')
    expect(ERROR_CODE_KEYS[100507]).toBe('warehouseCodeReserved')
    expect(ERROR_CODE_KEYS[100503]).toBe('warehouseNameDoesExist')
    expect(ERROR_CODE_KEYS[100509]).toBe('warehousePhonenumberInvalid')
    expect(ERROR_CODE_KEYS[100515]).toBe('warehouseManagerInactive')
    expect(ERROR_CODE_KEYS[100516]).toBe('warehouseManagerRoleInvalid')
    expect(ERROR_CODE_KEYS[100517]).toBe('warehouseActiveCannotBeDeleted')
    expect(ERROR_CODE_KEYS[101010]).toBe('storeTaxCodeInvalid')
    expect(ERROR_CODE_KEYS[101011]).toBe('storeTaxCodeDoesExist')
    expect(ERROR_CODE_KEYS[101013]).toBe('storeEmailInvalid')
    expect(ERROR_CODE_KEYS[101018]).toBe('storeWarehouseInactive')
    expect(ERROR_CODE_KEYS[101019]).toBe('storeWarehouseAlreadyAssigned')
    expect(ERROR_CODE_KEYS[101020]).toBe('storeWarehouseReserved')
  })

  it('mọi khoá trong bảng đều có bản dịch vi VÀ en — thiếu là người dùng thấy câu tiếng Anh gốc', () => {
    for (const [code, key] of Object.entries(ERROR_CODE_KEYS)) {
      expect(viErrors, `mã ${code} → khoá "${key}" thiếu ở vi`).toHaveProperty(key)
      expect(enErrors, `mã ${code} → khoá "${key}" thiếu ở en`).toHaveProperty(key)
    }
  })
})

describe('resolveApiErrorMessage — mã mới đã dịch, không rơi về message backend', () => {
  it.each([
    [100506, 'Mã kho đã tồn tại'],
    [100517, 'Hãy ngừng hoạt động kho trước khi xoá'],
    [101019, 'Kho đã được gán cho cửa hàng khác'],
  ])('mã %i → "%s"', async (code, expected) => {
    const error = await apiError(422, code, 'Backend english message').json()
    expect(resolveApiErrorMessage(error)).toBe(expected)
  })
})
