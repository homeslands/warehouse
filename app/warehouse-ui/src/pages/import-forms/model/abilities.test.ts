import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import { importFormAbilities, materialAddAbilities } from './abilities'

const user = (scope: string[], userSlug = 'u-me', roleName = 'CUSTOM'): CurrentUser => ({
  userName: 'u',
  userSlug,
  roleName,
  scope,
})
const mine = { status: 'DRAFT' as const, requesterSlug: 'u-me' }
const others = { status: 'DRAFT' as const, requesterSlug: 'u-other' }

describe('importFormAbilities', () => {
  it('quyền đầy đủ: mọi phiếu nháp', () => {
    const u = user([
      'IMPORT_FORM_CREATE',
      'IMPORT_FORM_UPDATE_DRAFT',
      'IMPORT_FORM_DELETE_DRAFT',
      'IMPORT_FORM_CONFIRM',
      'IMPORT_FORM_EXPORT',
    ])
    expect(importFormAbilities(u, { form: others, warehouseActive: true })).toEqual({
      create: true,
      update: true,
      delete: true,
      confirm: true,
      cancel: true,
      print: true,
    })
  })

  it('chỉ _OWN: phiếu mình được, phiếu người khác không', () => {
    const u = user([
      'IMPORT_FORM_CREATE',
      'IMPORT_FORM_UPDATE_DRAFT_OWN',
      'IMPORT_FORM_DELETE_DRAFT_OWN',
    ])
    expect(importFormAbilities(u, { form: mine, warehouseActive: true })).toMatchObject({
      update: true,
      delete: true,
    })
    expect(importFormAbilities(u, { form: others, warehouseActive: true })).toMatchObject({
      update: false,
      delete: false,
    })
  })

  it('có UPDATE_DRAFT nhưng thiếu IMPORT_FORM_CREATE → không sửa (editor cần available-materials)', () => {
    const u = user(['IMPORT_FORM_UPDATE_DRAFT', 'IMPORT_FORM_UPDATE_DRAFT_OWN'])
    expect(importFormAbilities(u, { form: mine, warehouseActive: true }).update).toBe(false)
  })

  it('_OWN mà phiên chưa có userSlug → không coi là của mình', () => {
    const u: CurrentUser = {
      userName: 'u',
      roleName: 'CUSTOM',
      scope: ['IMPORT_FORM_CREATE', 'IMPORT_FORM_UPDATE_DRAFT_OWN'],
    }
    expect(importFormAbilities(u, { form: mine, warehouseActive: true }).update).toBe(false)
  })

  it.each(['CONFIRMED', 'CANCELLED'] as const)(
    '%s: không sửa / xoá / xác nhận / huỷ, vẫn in',
    (status) => {
      const u = user([
        'IMPORT_FORM_UPDATE_DRAFT',
        'IMPORT_FORM_DELETE_DRAFT',
        'IMPORT_FORM_CONFIRM',
        'IMPORT_FORM_EXPORT',
      ])
      expect(
        importFormAbilities(u, { form: { status, requesterSlug: 'u-me' }, warehouseActive: true }),
      ).toEqual({
        create: false,
        update: false,
        delete: false,
        confirm: false,
        cancel: false,
        print: true,
      })
    },
  )

  it('kho ngừng hoạt động → không tạo', () => {
    expect(
      importFormAbilities(user(['IMPORT_FORM_CREATE']), { warehouseActive: false }).create,
    ).toBe(false)
  })

  it('người tạo tự xác nhận được (không chặn tự duyệt)', () => {
    expect(
      importFormAbilities(user(['IMPORT_FORM_CONFIRM']), { form: mine, warehouseActive: true })
        .confirm,
    ).toBe(true)
  })

  it('SUPER_ADMIN qua mọi cổng; null → không gì cả', () => {
    expect(
      importFormAbilities(user([], 'x', 'SUPER_ADMIN'), { form: others, warehouseActive: true }),
    ).toEqual({
      create: true,
      update: true,
      delete: true,
      confirm: true,
      cancel: true,
      print: true,
    })
    expect(importFormAbilities(null, { form: mine, warehouseActive: true })).toEqual({
      create: false,
      update: false,
      delete: false,
      confirm: false,
      cancel: false,
      print: false,
    })
  })
})

describe('materialAddAbilities', () => {
  const u = (scope: string[], roleName = 'CUSTOM'): CurrentUser => ({
    userName: 'u',
    roleName,
    scope,
  })
  it('mặc định MANAGER (chỉ đọc) → tìm được, không gắn / tạo / NCC', () => {
    expect(
      materialAddAbilities(u(['MATERIAL_READ', 'UNIT_READ', 'WAREHOUSE_READ', 'SUPPLIER_READ'])),
    ).toEqual({ search: true, assign: false, create: false, attachSupplier: false })
  })
  it('đủ quyền', () => {
    expect(
      materialAddAbilities(
        u([
          'MATERIAL_READ',
          'MATERIAL_CREATE',
          'MATERIAL_UPDATE',
          'WAREHOUSE_UPDATE',
          'UNIT_READ',
          'SUPPLIER_READ',
          'SUPPLIER_UPDATE',
        ]),
      ),
    ).toEqual({ search: true, assign: true, create: true, attachSupplier: true })
  })
  it('thiếu UNIT_READ → gắn được, không tạo', () => {
    expect(
      materialAddAbilities(
        u(['MATERIAL_READ', 'MATERIAL_CREATE', 'MATERIAL_UPDATE', 'WAREHOUSE_UPDATE']),
      ),
    ).toMatchObject({ assign: true, create: false })
  })
  it('không MATERIAL_READ → không điểm vào', () => {
    expect(materialAddAbilities(u([])).search).toBe(false)
  })
  it('SUPER_ADMIN qua hết', () => {
    expect(materialAddAbilities(u([], 'SUPER_ADMIN'))).toEqual({
      search: true,
      assign: true,
      create: true,
      attachSupplier: true,
    })
  })
})
