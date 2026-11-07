import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import { importFormAbilities } from './abilities'

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
      pickSupplier: false,
      confirmOnSave: true,
    })
  })

  it('pickSupplier = SUPPLIER_READ; confirmOnSave = IMPORT_FORM_CONFIRM kể cả khi chưa có phiếu', () => {
    expect(importFormAbilities(user([]), { warehouseActive: true })).toMatchObject({
      pickSupplier: false,
      confirmOnSave: false,
    })
    expect(
      importFormAbilities(user(['SUPPLIER_READ', 'IMPORT_FORM_CONFIRM']), {
        warehouseActive: true,
      }),
    ).toMatchObject({ pickSupplier: true, confirmOnSave: true, confirm: false })
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
        pickSupplier: false,
        confirmOnSave: true,
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
      pickSupplier: true,
      confirmOnSave: true,
    })
    expect(importFormAbilities(null, { form: mine, warehouseActive: true })).toEqual({
      create: false,
      update: false,
      delete: false,
      confirm: false,
      cancel: false,
      print: false,
      pickSupplier: false,
      confirmOnSave: false,
    })
  })
})
