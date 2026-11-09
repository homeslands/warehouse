import type { AuthorityCode } from '@/shared/api/authority-codes'
import {
  canCreateImportForm,
  importFormAbilities,
  receiveMode,
  type ImportFormAccess,
} from './abilities'

const access = (codes: AuthorityCode[], userSlug: string | null = 'me'): ImportFormAccess => ({
  can: (c) => codes.includes(c),
  userSlug,
})
const superAdmin: ImportFormAccess = { can: () => true, userSlug: 'root' }

const draft = (requesterSlug: string | null = 'me') => ({ status: 'DRAFT' as const, requesterSlug })

describe('importFormAbilities', () => {
  it('chỉ _OWN + phiếu người khác → chỉ đọc', () => {
    const a = importFormAbilities(
      access(['IMPORT_FORM_UPDATE_DRAFT_OWN', 'IMPORT_FORM_CREATE']),
      draft('other'),
    )
    expect(a).toMatchObject({ canEdit: false, canAddLine: false, canConfirm: false })
  })

  it('_OWN + phiếu của mình → sửa được', () => {
    const a = importFormAbilities(access(['IMPORT_FORM_UPDATE_DRAFT_OWN']), draft('me'))
    expect(a.canEdit).toBe(true)
  })

  it('_OWN, người dùng chưa có userSlug, phiếu mồ côi → không phải của mình', () => {
    const u = access(['IMPORT_FORM_UPDATE_DRAFT_OWN'], null)
    expect(importFormAbilities(u, draft(null)).canEdit).toBe(false)
  })

  it('UPDATE_DRAFT không có CREATE → sửa được nhưng không thêm dòng', () => {
    const a = importFormAbilities(access(['IMPORT_FORM_UPDATE_DRAFT']), draft('other'))
    expect(a.canEdit).toBe(true)
    expect(a.canAddLine).toBe(false)
  })

  it('UPDATE_DRAFT + CREATE → thêm dòng được', () => {
    const a = importFormAbilities(
      access(['IMPORT_FORM_UPDATE_DRAFT', 'IMPORT_FORM_CREATE']),
      draft(),
    )
    expect(a.canAddLine).toBe(true)
  })

  it('có xác nhận mà không có sửa → canConfirm, không canEdit', () => {
    const a = importFormAbilities(access(['IMPORT_FORM_CONFIRM']), draft('other'))
    expect(a).toMatchObject({ canEdit: false, canAddLine: false, canConfirm: true })
  })

  it.each(['CONFIRMED', 'CANCELLED'] as const)('%s → mọi thứ false kể cả SUPER_ADMIN', (status) => {
    const su = superAdmin
    expect(importFormAbilities(su, { status, requesterSlug: 'me' })).toMatchObject({
      canEdit: false,
      canAddLine: false,
      canConfirm: false,
    })
  })

  it("'new' + CREATE → sửa/thêm dòng; canConfirm theo IMPORT_FORM_CONFIRM", () => {
    expect(importFormAbilities(access(['IMPORT_FORM_CREATE']), 'new')).toMatchObject({
      canEdit: true,
      canAddLine: true,
      canConfirm: false,
    })
    expect(
      importFormAbilities(access(['IMPORT_FORM_CREATE', 'IMPORT_FORM_CONFIRM']), 'new').canConfirm,
    ).toBe(true)
  })

  it("'new' không có CREATE → false hết", () => {
    expect(importFormAbilities(access(['IMPORT_FORM_CONFIRM']), 'new')).toMatchObject({
      canEdit: false,
      canAddLine: false,
      canConfirm: false,
    })
  })

  it('SUPER_ADMIN + Nháp → true hết', () => {
    const su = superAdmin
    expect(importFormAbilities(su, draft('other'))).toMatchObject({
      canEdit: true,
      canAddLine: true,
      canConfirm: true,
      canCancel: true,
      canDelete: true,
    })
  })

  it('không quyền nào → false hết', () => {
    expect(importFormAbilities(access([]), draft())).toMatchObject({
      canEdit: false,
      canAddLine: false,
      canConfirm: false,
    })
  })
})

describe('canCreateImportForm', () => {
  it('theo IMPORT_FORM_CREATE', () => {
    expect(canCreateImportForm(access(['IMPORT_FORM_CREATE']))).toBe(true)
    expect(canCreateImportForm(access(['IMPORT_FORM_READ']))).toBe(false)
    expect(canCreateImportForm(superAdmin)).toBe(true)
  })
})

describe('receiveMode', () => {
  const draftOf = (codes: AuthorityCode[]) =>
    receiveMode(importFormAbilities(access(codes), draft()))

  it('xác nhận + sửa → check (MANAGER/ADMIN: checklist)', () => {
    expect(draftOf(['IMPORT_FORM_CONFIRM', 'IMPORT_FORM_UPDATE_DRAFT'])).toBe('check')
  })

  it('chỉ xác nhận → check', () => {
    expect(draftOf(['IMPORT_FORM_CONFIRM'])).toBe('check')
  })

  it('chỉ sửa → edit (SUPERVISOR: sửa phiếu, không dấu kiểm)', () => {
    expect(draftOf(['IMPORT_FORM_UPDATE_DRAFT'])).toBe('edit')
    expect(draftOf(['IMPORT_FORM_UPDATE_DRAFT_OWN', 'IMPORT_FORM_CREATE'])).toBe('edit')
  })

  it('không sửa, không xác nhận → view', () => {
    expect(draftOf(['IMPORT_FORM_READ'])).toBe('view')
    // Chỉ _OWN mà phiếu của người khác.
    expect(
      receiveMode(importFormAbilities(access(['IMPORT_FORM_UPDATE_DRAFT_OWN']), draft('other'))),
    ).toBe('view')
  })

  it('phiếu mới: tạo + xác nhận → check; chỉ tạo → edit; không tạo → view', () => {
    const newOf = (codes: AuthorityCode[]) => receiveMode(importFormAbilities(access(codes), 'new'))
    expect(newOf(['IMPORT_FORM_CREATE', 'IMPORT_FORM_CONFIRM'])).toBe('check')
    expect(newOf(['IMPORT_FORM_CREATE'])).toBe('edit')
    expect(newOf(['IMPORT_FORM_CONFIRM'])).toBe('view')
  })

  it('phiếu không còn Nháp → view kể cả SUPER_ADMIN', () => {
    expect(
      receiveMode(importFormAbilities(superAdmin, { status: 'CONFIRMED', requesterSlug: 'me' })),
    ).toBe('view')
  })
})

describe('importFormAbilities: canCancel / canDelete', () => {
  const st = (
    status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED',
    requesterSlug: string | null = 'me',
  ) => ({
    status,
    requesterSlug,
  })

  it('canCancel: chỉ Nháp + CONFIRM', () => {
    const u = access(['IMPORT_FORM_CONFIRM'])
    expect(importFormAbilities(u, st('DRAFT')).canCancel).toBe(true)
    expect(importFormAbilities(u, st('CONFIRMED')).canCancel).toBe(false)
    expect(importFormAbilities(u, st('CANCELLED')).canCancel).toBe(false)
    expect(importFormAbilities(access([]), st('DRAFT')).canCancel).toBe(false)
  })

  it('canDelete: DELETE_DRAFT dùng cho phiếu bất kỳ của người khác', () => {
    const u = access(['IMPORT_FORM_DELETE_DRAFT'])
    expect(importFormAbilities(u, st('DRAFT', 'other')).canDelete).toBe(true)
  })

  it('canDelete: DELETE_DRAFT_OWN chỉ phiếu của mình', () => {
    const u = access(['IMPORT_FORM_DELETE_DRAFT_OWN'])
    expect(importFormAbilities(u, st('DRAFT', 'me')).canDelete).toBe(true)
    expect(importFormAbilities(u, st('DRAFT', 'other')).canDelete).toBe(false)
    expect(
      importFormAbilities(access(['IMPORT_FORM_DELETE_DRAFT_OWN'], null), st('DRAFT', null))
        .canDelete,
    ).toBe(false)
  })

  it('canDelete: không Nháp → false kể cả DELETE_DRAFT', () => {
    const u = access(['IMPORT_FORM_DELETE_DRAFT'])
    expect(importFormAbilities(u, st('CONFIRMED')).canDelete).toBe(false)
    expect(importFormAbilities(u, st('CANCELLED')).canDelete).toBe(false)
  })

  it("'new' → cả hai false kể cả SUPER_ADMIN", () => {
    const a = importFormAbilities(superAdmin, 'new')
    expect(a.canCancel).toBe(false)
    expect(a.canDelete).toBe(false)
  })
})
