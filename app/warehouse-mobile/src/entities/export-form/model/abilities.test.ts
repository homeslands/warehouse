import type { AuthorityCode } from '@/shared/api/authority-codes'
import { canCreateExportForm, exportFormAbilities, type ExportFormAccess } from './abilities'
import type { ExportFormStatus, ExportFormType } from './types'

const access = (codes: AuthorityCode[], userSlug: string | null = 'me'): ExportFormAccess => ({
  can: (c) => codes.includes(c),
  userSlug,
})

const supervisor = access([
  'EXPORT_FORM_CREATE',
  'EXPORT_FORM_READ',
  'EXPORT_FORM_UPDATE_DRAFT_OWN',
  'EXPORT_FORM_DELETE_DRAFT_OWN',
])
const manager = access([
  'EXPORT_FORM_CREATE',
  'EXPORT_FORM_READ',
  'EXPORT_FORM_DELETE_DRAFT',
  'EXPORT_FORM_CONFIRM',
])

const form = (
  status: ExportFormStatus,
  requesterSlug: string | null = 'me',
  type: ExportFormType = 'SALE',
) => ({ status, requesterSlug, type })

const none = {
  canEdit: false,
  canSubmit: false,
  canDelete: false,
  canConfirm: false,
  canCancel: false,
  confirmBlockedByDisposal: false,
}

describe('exportFormAbilities', () => {
  it('SUPERVISOR người lập, DRAFT: sửa / gửi / xoá được, không duyệt / huỷ', () => {
    expect(exportFormAbilities(supervisor, form('DRAFT'))).toEqual({
      ...none,
      canEdit: true,
      canSubmit: true,
      canDelete: true,
    })
  })

  it('SUPERVISOR không phải người lập (chỉ _OWN): tất cả false', () => {
    expect(exportFormAbilities(supervisor, form('DRAFT', 'other'))).toEqual(none)
  })

  it('phiên chưa có userSlug → không phải của mình', () => {
    const a = exportFormAbilities(
      access(['EXPORT_FORM_UPDATE_DRAFT_OWN'], null),
      form('DRAFT', null),
    )
    expect(a.canEdit).toBe(false)
  })

  it('MANAGER, DRAFT: huỷ + xoá được, không sửa / gửi / xác nhận', () => {
    expect(exportFormAbilities(manager, form('DRAFT', 'other'))).toEqual({
      ...none,
      canDelete: true,
      canCancel: true,
    })
  })

  it('quyền đầy đủ UPDATE_DRAFT sửa + gửi được phiếu người khác', () => {
    const a = exportFormAbilities(access(['EXPORT_FORM_UPDATE_DRAFT']), form('DRAFT', 'other'))
    expect(a.canEdit).toBe(true)
    expect(a.canSubmit).toBe(true)
  })

  it('PENDING SALE: MANAGER xác nhận + huỷ, không sửa / xoá', () => {
    expect(exportFormAbilities(manager, form('PENDING', 'other'))).toEqual({
      ...none,
      canConfirm: true,
      canCancel: true,
    })
  })

  it('PENDING DISPOSAL thiếu APPROVE_DISPOSAL: không xác nhận, bị chặn bởi xuất huỷ, vẫn huỷ được', () => {
    const a = exportFormAbilities(manager, form('PENDING', 'other', 'DISPOSAL'))
    expect(a.canConfirm).toBe(false)
    expect(a.confirmBlockedByDisposal).toBe(true)
    expect(a.canCancel).toBe(true)
  })

  it('PENDING DISPOSAL có APPROVE_DISPOSAL: xác nhận được', () => {
    const a = exportFormAbilities(
      access(['EXPORT_FORM_CONFIRM', 'EXPORT_FORM_APPROVE_DISPOSAL']),
      form('PENDING', 'other', 'DISPOSAL'),
    )
    expect(a.canConfirm).toBe(true)
    expect(a.confirmBlockedByDisposal).toBe(false)
  })

  it('không có CONFIRM: APPROVE_DISPOSAL một mình không đủ và cũng không "bị chặn"', () => {
    const a = exportFormAbilities(
      access(['EXPORT_FORM_APPROVE_DISPOSAL']),
      form('PENDING', 'other', 'DISPOSAL'),
    )
    expect(a.canConfirm).toBe(false)
    expect(a.confirmBlockedByDisposal).toBe(false)
  })

  it('DISPOSAL còn DRAFT: không bị chặn duyệt (chưa tới bước duyệt)', () => {
    expect(
      exportFormAbilities(manager, form('DRAFT', 'other', 'DISPOSAL')).confirmBlockedByDisposal,
    ).toBe(false)
  })

  it.each(['CONFIRMED', 'CANCELLED'] as const)('%s: bất biến', (status) => {
    const all = access([
      'EXPORT_FORM_CREATE',
      'EXPORT_FORM_UPDATE_DRAFT',
      'EXPORT_FORM_DELETE_DRAFT',
      'EXPORT_FORM_CONFIRM',
    ])
    expect(exportFormAbilities(all, form(status))).toEqual(none)
  })

  it("'new': sửa / gửi theo CREATE, không thao tác khác", () => {
    expect(exportFormAbilities(supervisor, 'new')).toEqual({
      ...none,
      canEdit: true,
      canSubmit: true,
    })
    expect(exportFormAbilities(access([]), 'new')).toEqual(none)
  })
})

describe('canCreateExportForm', () => {
  it('theo EXPORT_FORM_CREATE', () => {
    expect(canCreateExportForm(supervisor)).toBe(true)
    expect(canCreateExportForm(access(['EXPORT_FORM_READ']))).toBe(false)
  })
})
