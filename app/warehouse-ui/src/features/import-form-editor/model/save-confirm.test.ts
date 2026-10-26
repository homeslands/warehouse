import i18n from 'i18next'
import { describe, expect, it } from 'vitest'
import { importSaveConfirmCopy } from './save-confirm'

const vi = i18n.getFixedT<['importForms', 'common']>('vi', ['importForms', 'common'])
const en = i18n.getFixedT<['importForms', 'common']>('en', ['importForms', 'common'])

describe('importSaveConfirmCopy', () => {
  it('createDraft: "Tạo phiếu nháp <mã>?", chưa cộng tồn, tông default', () => {
    expect(importSaveConfirmCopy(vi, 'createDraft', { code: 'PN-0007', changed: [] })).toEqual({
      title: 'Tạo phiếu nháp PN-0007?',
      description: 'Chưa cộng tồn, sửa được tiếp.',
      confirmLabel: 'Lưu nháp',
      tone: 'default',
    })
  })

  it('saveConfirm khi tạo (không có ô đã sửa): chỉ câu hậu quả, tông success', () => {
    expect(importSaveConfirmCopy(vi, 'saveConfirm', { code: 'PN-0007', changed: [] })).toEqual({
      title: 'Lưu và xác nhận PN-0007?',
      description: 'Tồn kho được cộng ngay, phiếu không sửa được nữa.',
      confirmLabel: 'Lưu & xác nhận',
      tone: 'success',
    })
  })

  it('saveConfirm khi sửa có đổi: nối "Đã sửa: …" sau câu hậu quả', () => {
    const copy = importSaveConfirmCopy(vi, 'saveConfirm', {
      code: 'PN-0001',
      changed: ['Số hoá đơn', 'Dòng vật tư'],
    })
    expect(copy.description).toBe(
      'Tồn kho được cộng ngay, phiếu không sửa được nữa. Đã sửa: Số hoá đơn, Dòng vật tư',
    )
    expect(copy.tone).toBe('success')
  })

  it('saveEdit: "Lưu thay đổi phiếu <mã>?", mô tả là các ô đã sửa, nút "Lưu thay đổi"', () => {
    expect(
      importSaveConfirmCopy(vi, 'saveEdit', { code: 'PN-0001', changed: ['Ghi chú'] }),
    ).toEqual({
      title: 'Lưu thay đổi phiếu PN-0001?',
      description: 'Đã sửa: Ghi chú',
      confirmLabel: 'Lưu thay đổi',
      tone: 'default',
    })
  })

  it('saveEdit chỉ có bên bán của dòng chưa lưu (needsPatch): mô tả nêu "Bên bán của dòng"', () => {
    expect(
      importSaveConfirmCopy(vi, 'saveEdit', { code: 'PN-0001', changed: ['Bên bán của dòng'] })
        .description,
    ).toBe('Đã sửa: Bên bán của dòng')
  })

  it('tiếng Anh có bản dịch tương ứng', () => {
    expect(importSaveConfirmCopy(en, 'createDraft', { code: 'PN-1', changed: [] }).title).toBe(
      'Create draft receipt PN-1?',
    )
    expect(importSaveConfirmCopy(en, 'saveConfirm', { code: 'PN-1', changed: ['Note'] })).toEqual({
      title: 'Save and confirm PN-1?',
      description:
        'Stock is added right away and the receipt can no longer be edited. Changed: Note',
      confirmLabel: 'Save & confirm',
      tone: 'success',
    })
    expect(importSaveConfirmCopy(en, 'saveEdit', { code: 'PN-1', changed: ['Note'] }).title).toBe(
      'Save changes to receipt PN-1?',
    )
  })
})
