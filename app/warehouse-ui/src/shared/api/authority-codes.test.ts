import { describe, expect, it } from 'vitest'
import { AUTHORITY_CODES, authorityCodeDrift } from './authority-codes'

describe('AUTHORITY_CODES', () => {
  it('không trùng mã', () => {
    expect(new Set(AUTHORITY_CODES).size).toBe(AUTHORITY_CODES.length)
  })

  it('có các nhóm backend thêm ở WMS-10-be (đơn vị, vật tư, cửa hàng, hồ sơ thuế)', () => {
    for (const code of ['UNIT_READ', 'MATERIAL_UPDATE', 'STORE_UPDATE', 'TAX_PROFILE_UPDATE'])
      expect(AUTHORITY_CODES).toContain(code)
  })

  it('KHÔNG có mã gán kho riêng — backend dùng STORE_UPDATE + WAREHOUSE_UPDATE', () => {
    expect(AUTHORITY_CODES).not.toContain('STORE_ASSIGN_WAREHOUSE')
  })
})

describe('authorityCodeDrift — FE lệch danh mục của backend', () => {
  const backend = [...AUTHORITY_CODES]

  it('khớp → không lệch', () => {
    expect(authorityCodeDrift(backend)).toEqual({ unknown: [], missing: [] })
  })

  it('backend có mã FE chưa biết → báo `unknown`', () => {
    expect(authorityCodeDrift([...backend, 'NEW_THING']).unknown).toEqual(['NEW_THING'])
  })

  it('FE có mã backend không còn → báo `missing`', () => {
    const withoutOne = backend.filter((code) => code !== 'WAREHOUSE_DELETE')
    expect(authorityCodeDrift(withoutOne).missing).toEqual(['WAREHOUSE_DELETE'])
  })
})
