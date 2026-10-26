import i18n from 'i18next'
import { describe, expect, it } from 'vitest'
import { exportSaveConfirmCopy } from './save-confirm'

const vi = i18n.getFixedT<['exportForms', 'common']>('vi', ['exportForms', 'common'])
const en = i18n.getFixedT<['exportForms', 'common']>('en', ['exportForms', 'common'])

describe('exportSaveConfirmCopy', () => {
  it('createDraft: "Tạo phiếu nháp <mã>?", chưa giữ chỗ, nút "Lưu nháp", tông default', () => {
    expect(exportSaveConfirmCopy(vi, 'createDraft', { code: 'PX-0007', changed: [] })).toEqual({
      title: 'Tạo phiếu nháp PX-0007?',
      description: 'Phiếu chưa giữ chỗ hàng, sửa được tiếp.',
      confirmLabel: 'Lưu nháp',
      tone: 'default',
    })
  })

  it('saveSubmit không có ô đã sửa (tạo / sửa chưa đổi): chỉ câu hậu quả, tông default', () => {
    expect(exportSaveConfirmCopy(vi, 'saveSubmit', { code: 'PX-0007', changed: [] })).toEqual({
      title: 'Lưu và gửi duyệt PX-0007?',
      description: 'Hàng sẽ được giữ chỗ, phiếu không sửa được nữa.',
      confirmLabel: 'Lưu & gửi duyệt',
      tone: 'default',
    })
  })

  it('saveSubmit khi sửa có đổi: nối "Đã sửa: …" sau câu hậu quả', () => {
    expect(
      exportSaveConfirmCopy(vi, 'saveSubmit', {
        code: 'PX-0001',
        changed: ['Số PO', 'Dòng vật tư'],
      }).description,
    ).toBe('Hàng sẽ được giữ chỗ, phiếu không sửa được nữa. Đã sửa: Số PO, Dòng vật tư')
  })

  it('submitConfirm: "Xuất kho <mã>?", tồn bị trừ ngay, nút "Gửi & xác nhận", tông success', () => {
    expect(exportSaveConfirmCopy(vi, 'submitConfirm', { code: 'PX-0007', changed: [] })).toEqual({
      title: 'Xuất kho PX-0007?',
      description: 'Tồn kho bị trừ ngay, không hoàn tác được.',
      confirmLabel: 'Gửi & xác nhận',
      tone: 'success',
    })
  })

  it('submitConfirm khi sửa có đổi: nối "Đã sửa: …", vẫn tông success', () => {
    const copy = exportSaveConfirmCopy(vi, 'submitConfirm', {
      code: 'PX-0001',
      changed: ['Ghi chú'],
    })
    expect(copy.description).toBe('Tồn kho bị trừ ngay, không hoàn tác được. Đã sửa: Ghi chú')
    expect(copy.tone).toBe('success')
  })

  it('saveEdit: "Lưu thay đổi phiếu <mã>?", mô tả là các ô đã sửa, nút "Lưu thay đổi"', () => {
    expect(
      exportSaveConfirmCopy(vi, 'saveEdit', {
        code: 'PX-0001',
        changed: ['Lý do xuất', 'Dòng vật tư'],
      }),
    ).toEqual({
      title: 'Lưu thay đổi phiếu PX-0001?',
      description: 'Đã sửa: Lý do xuất, Dòng vật tư',
      confirmLabel: 'Lưu thay đổi',
      tone: 'default',
    })
  })

  it('tiếng Anh có bản dịch tương ứng', () => {
    expect(exportSaveConfirmCopy(en, 'createDraft', { code: 'PX-1', changed: [] })).toEqual({
      title: 'Create draft goods issue PX-1?',
      description: 'No stock is reserved yet; you can keep editing.',
      confirmLabel: 'Save draft',
      tone: 'default',
    })
    expect(exportSaveConfirmCopy(en, 'saveSubmit', { code: 'PX-1', changed: ['Note'] })).toEqual({
      title: 'Save and submit PX-1?',
      description: 'Stock will be reserved and the form can no longer be edited. Changed: Note',
      confirmLabel: 'Save & submit',
      tone: 'default',
    })
    expect(exportSaveConfirmCopy(en, 'submitConfirm', { code: 'PX-1', changed: [] })).toEqual({
      title: 'Issue stock for PX-1?',
      description: 'Stock is deducted right away and this cannot be undone.',
      confirmLabel: 'Submit & confirm',
      tone: 'success',
    })
    expect(exportSaveConfirmCopy(en, 'saveEdit', { code: 'PX-1', changed: ['Note'] }).title).toBe(
      'Save changes to goods issue PX-1?',
    )
  })
})
