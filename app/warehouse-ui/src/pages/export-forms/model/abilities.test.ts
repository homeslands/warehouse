import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import type { ExportFormStatus, ExportFormType } from '@/entities/export-form'
import { exportFormAbilities } from './abilities'

const user = (scope: string[], userSlug = 'u-me', roleName = 'CUSTOM'): CurrentUser => ({
  userName: 'u',
  userSlug,
  roleName,
  scope,
})
const form = (
  status: ExportFormStatus,
  requesterSlug: string | null = 'u-me',
  type: ExportFormType = 'PRODUCTION',
) => ({ status, requesterSlug, type })

const READ_MATERIALS = ['MATERIAL_READ', 'WAREHOUSE_READ']

/** Quyền mặc định của SUPERVISOR (spec §3) + đọc vật tư / kho mà form cần. */
const SUPERVISOR = user([
  'EXPORT_FORM_CREATE',
  'EXPORT_FORM_READ',
  'EXPORT_FORM_UPDATE_DRAFT_OWN',
  'EXPORT_FORM_DELETE_DRAFT_OWN',
  'EXPORT_FORM_EXPORT',
  ...READ_MATERIALS,
])
/** Quyền mặc định của MANAGER: xoá mọi nháp, xác nhận / huỷ, duyệt huỷ, in. */
const MANAGER = user(
  [
    'EXPORT_FORM_READ',
    'EXPORT_FORM_DELETE_DRAFT',
    'EXPORT_FORM_CONFIRM',
    'EXPORT_FORM_APPROVE_DISPOSAL',
    'EXPORT_FORM_EXPORT',
    ...READ_MATERIALS,
  ],
  'u-mgr',
)

const NOTHING = {
  create: false,
  update: false,
  delete: false,
  submit: false,
  confirm: false,
  cancel: false,
  print: false,
  confirmOnSave: false,
  approveDisposal: false,
  pickBatch: false,
  readWarehouses: false,
  disposalBlocked: false,
}

describe('exportFormAbilities', () => {
  it('SUPERVISOR, nháp của mình: sửa / gửi duyệt / xoá / in, KHÔNG huỷ, không xác nhận', () => {
    expect(exportFormAbilities(SUPERVISOR, { form: form('DRAFT'), warehouseActive: true })).toEqual(
      {
        create: true,
        update: true,
        delete: true,
        submit: true,
        confirm: false,
        cancel: false,
        print: true,
        confirmOnSave: false,
        approveDisposal: false,
        pickBatch: true,
        readWarehouses: true,
        disposalBlocked: false,
      },
    )
  })

  it('SUPERVISOR, nháp người khác: không sửa / gửi / xoá', () => {
    expect(
      exportFormAbilities(SUPERVISOR, { form: form('DRAFT', 'u-other'), warehouseActive: true }),
    ).toMatchObject({ update: false, submit: false, delete: false })
  })

  it('_OWN mà phiên chưa có userSlug → không coi là của mình', () => {
    const u: CurrentUser = {
      userName: 'u',
      roleName: 'CUSTOM',
      scope: ['EXPORT_FORM_UPDATE_DRAFT_OWN', 'EXPORT_FORM_DELETE_DRAFT_OWN', ...READ_MATERIALS],
    }
    expect(exportFormAbilities(u, { form: form('DRAFT'), warehouseActive: true })).toMatchObject({
      update: false,
      submit: false,
      delete: false,
    })
  })

  it('bản đầy đủ UPDATE_DRAFT / DELETE_DRAFT: nháp người khác cũng được', () => {
    const u = user(['EXPORT_FORM_UPDATE_DRAFT', 'EXPORT_FORM_DELETE_DRAFT', ...READ_MATERIALS])
    expect(
      exportFormAbilities(u, { form: form('DRAFT', 'u-other'), warehouseActive: true }),
    ).toMatchObject({ update: true, submit: true, delete: true })
  })

  it('Ruling 2: tạo / sửa cần thêm MATERIAL_READ + WAREHOUSE_READ; gửi duyệt / xoá thì không', () => {
    for (const missing of READ_MATERIALS) {
      const u = user(
        [
          'EXPORT_FORM_CREATE',
          'EXPORT_FORM_UPDATE_DRAFT',
          'EXPORT_FORM_DELETE_DRAFT',
          ...READ_MATERIALS.filter((c) => c !== missing),
        ],
        'u-me',
      )
      expect(exportFormAbilities(u, { form: form('DRAFT'), warehouseActive: true })).toMatchObject({
        create: false,
        update: false,
        submit: true,
        delete: true,
        pickBatch: false,
      })
    }
  })

  it('kho ngừng hoạt động → không tạo', () => {
    expect(exportFormAbilities(SUPERVISOR, { warehouseActive: false }).create).toBe(false)
    expect(exportFormAbilities(SUPERVISOR, { warehouseActive: true }).create).toBe(true)
  })

  it('MANAGER, nháp người khác: xoá + huỷ, không sửa / gửi duyệt, không xác nhận (chưa Chờ duyệt)', () => {
    expect(
      exportFormAbilities(MANAGER, { form: form('DRAFT', 'u-sup'), warehouseActive: true }),
    ).toMatchObject({
      update: false,
      submit: false,
      delete: true,
      cancel: true,
      confirm: false,
      disposalBlocked: false,
    })
  })

  it('MANAGER, phiếu Chờ duyệt Xuất huỷ có APPROVE_DISPOSAL → xác nhận được', () => {
    expect(
      exportFormAbilities(MANAGER, {
        form: form('PENDING', 'u-sup', 'DISPOSAL'),
        warehouseActive: true,
      }),
    ).toMatchObject({ confirm: true, cancel: true, disposalBlocked: false, delete: false })
  })

  it('Chờ duyệt Xuất huỷ, có CONFIRM nhưng thiếu APPROVE_DISPOSAL → disposalBlocked, không confirm', () => {
    const u = user(['EXPORT_FORM_CONFIRM'], 'u-mgr')
    expect(
      exportFormAbilities(u, { form: form('PENDING', 'u-sup', 'DISPOSAL'), warehouseActive: true }),
    ).toMatchObject({ confirm: false, cancel: true, disposalBlocked: true })
  })

  it('Chờ duyệt lý do khác Xuất huỷ: CONFIRM là đủ, không disposalBlocked', () => {
    const u = user(['EXPORT_FORM_CONFIRM'], 'u-mgr')
    expect(
      exportFormAbilities(u, { form: form('PENDING', 'u-sup', 'SALE'), warehouseActive: true }),
    ).toMatchObject({ confirm: true, disposalBlocked: false })
  })

  it('Chờ duyệt Xuất huỷ mà không có CONFIRM → không nút nào (không disposalBlocked)', () => {
    expect(
      exportFormAbilities(SUPERVISOR, {
        form: form('PENDING', 'u-me', 'DISPOSAL'),
        warehouseActive: true,
      }),
    ).toMatchObject({ confirm: false, cancel: false, disposalBlocked: false, update: false })
  })

  it.each(['CONFIRMED', 'CANCELLED'] as const)('%s: chỉ còn In', (status) => {
    const all = user([
      'EXPORT_FORM_UPDATE_DRAFT',
      'EXPORT_FORM_DELETE_DRAFT',
      'EXPORT_FORM_CONFIRM',
      'EXPORT_FORM_APPROVE_DISPOSAL',
      'EXPORT_FORM_EXPORT',
    ])
    expect(
      exportFormAbilities(all, { form: form(status, 'u-me', 'DISPOSAL'), warehouseActive: true }),
    ).toMatchObject({
      update: false,
      delete: false,
      submit: false,
      confirm: false,
      cancel: false,
      disposalBlocked: false,
      print: true,
    })
  })

  it('cờ cho sheet không xét phiếu: confirmOnSave / approveDisposal / pickBatch / readWarehouses', () => {
    expect(
      exportFormAbilities(
        user(['EXPORT_FORM_CONFIRM', 'EXPORT_FORM_APPROVE_DISPOSAL', 'WAREHOUSE_READ']),
        { warehouseActive: true },
      ),
    ).toMatchObject({
      confirmOnSave: true,
      approveDisposal: true,
      pickBatch: false,
      readWarehouses: true,
      confirm: false,
    })
  })

  it('SUPER_ADMIN qua mọi cổng (Chờ duyệt Xuất huỷ: xác nhận được); null → không gì cả', () => {
    const root = user([], 'x', 'SUPER_ADMIN')
    expect(
      exportFormAbilities(root, {
        form: form('PENDING', 'u-o', 'DISPOSAL'),
        warehouseActive: true,
      }),
    ).toMatchObject({ confirm: true, cancel: true, disposalBlocked: false, print: true })
    expect(
      exportFormAbilities(root, { form: form('DRAFT', 'u-o'), warehouseActive: true }),
    ).toMatchObject({ create: true, update: true, submit: true, delete: true, cancel: true })
    expect(exportFormAbilities(null, { form: form('DRAFT'), warehouseActive: true })).toEqual(
      NOTHING,
    )
  })
})
