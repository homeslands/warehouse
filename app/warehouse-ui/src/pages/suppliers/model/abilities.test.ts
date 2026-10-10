import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import { supplierAbilities } from './abilities'

const ON = {
  supplierSearch: true,
  supplierSort: true,
  supplierTransactions: true,
  supplierMaterialFilters: true,
}
const OFF = {
  supplierSearch: false,
  supplierSort: false,
  supplierTransactions: false,
  supplierMaterialFilters: false,
}

const user = (scope: string[], roleName = 'CUSTOM'): CurrentUser => ({
  userName: 'u',
  roleName,
  scope,
})

describe('supplierAbilities', () => {
  it('ADMIN trên sandbox: đủ mọi quyền', () => {
    expect(
      supplierAbilities(
        user([
          'SUPPLIER_READ',
          'SUPPLIER_CREATE',
          'SUPPLIER_UPDATE',
          'SUPPLIER_DELETE',
          'MATERIAL_READ',
          'MATERIAL_UPDATE',
        ]),
        ON,
      ),
    ).toEqual({
      create: true,
      update: true,
      delete: true,
      viewMaterials: true,
      filterMaterials: true,
      manageMaterials: true,
      viewTransactions: true,
      recordTransaction: true,
      search: true,
      sort: true,
    })
  })

  it('MANAGER trên sandbox (SUPPLIER_READ + MATERIAL_READ): chỉ xem', () => {
    expect(supplierAbilities(user(['SUPPLIER_READ', 'MATERIAL_READ']), ON)).toEqual({
      create: false,
      update: false,
      delete: false,
      viewMaterials: true,
      filterMaterials: true,
      manageMaterials: false,
      viewTransactions: true,
      recordTransaction: false,
      search: true,
      sort: true,
    })
  })

  it('gắn/gỡ vật tư cần CẢ SUPPLIER_UPDATE và MATERIAL_UPDATE', () => {
    expect(
      supplierAbilities(user(['SUPPLIER_READ', 'SUPPLIER_UPDATE', 'MATERIAL_READ']), ON)
        .manageMaterials,
    ).toBe(false)
  })

  it('thiếu MATERIAL_READ → không thấy tab Vật tư (nên cũng không lọc vật tư)', () => {
    expect(supplierAbilities(user(['SUPPLIER_READ']), ON)).toMatchObject({
      viewMaterials: false,
      filterMaterials: false,
    })
  })

  it('SUPER_ADMIN qua mọi gác; chưa đăng nhập → không gì', () => {
    expect(Object.values(supplierAbilities(user([], 'SUPER_ADMIN'), ON)).every(Boolean)).toBe(true)
    expect(Object.values(supplierAbilities(null, ON)).some(Boolean)).toBe(false)
  })

  it('backend chưa hỗ trợ: không tìm, không sắp xếp, không tab Giao dịch (kể cả ghi) dù đủ quyền', () => {
    const a = supplierAbilities(user([], 'SUPER_ADMIN'), OFF)
    expect(a).toMatchObject({
      filterMaterials: false,
      search: false,
      sort: false,
      viewTransactions: false,
      recordTransaction: false,
    })
    expect(a.viewMaterials).toBe(true)
  })
})
