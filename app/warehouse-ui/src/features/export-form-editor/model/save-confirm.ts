import type { TFunction } from 'i18next'

/**
 * Các nút lưu của wizard phiếu xuất: Lưu nháp khi tạo (`createDraft`), Lưu & gửi duyệt khi tạo / sửa (`saveSubmit`),
 * Gửi & xác nhận khi tạo / sửa (`submitConfirm`), Lưu / Enter khi sửa nháp (`saveEdit`).
 */
export type ExportSaveAction = 'createDraft' | 'saveSubmit' | 'submitConfirm' | 'saveEdit'

export type ExportSaveConfirmCopy = {
  title: string
  description: string
  confirmLabel: string
  tone: 'default' | 'success'
}

/**
 * Nội dung hộp hỏi trước khi lưu, theo hành động (spec §3.2). `code` = mã phiếu sẽ gửi / đang sửa; `changed` = nhãn
 * các ô đã sửa (rỗng khi tạo, hoặc khi sửa mà chưa đổi gì). Hai nút gộp (`saveSubmit`, `submitConfirm`) khi sửa có đổi
 * thì nối "Đã sửa: …" sau câu hậu quả; chưa đổi thì chỉ có hậu quả.
 */
export function exportSaveConfirmCopy(
  t: TFunction<['exportForms', 'common']>,
  action: ExportSaveAction,
  { code, changed }: { code: string; changed: string[] },
): ExportSaveConfirmCopy {
  const changedLine =
    changed.length > 0 ? t('common:changedFields', { fields: changed.join(', ') }) : ''
  const withChanged = (consequence: string) => [consequence, changedLine].filter(Boolean).join(' ')
  switch (action) {
    case 'createDraft':
      return {
        title: t('exportForms:createDraftConfirmTitle', { code }),
        description: t('exportForms:createDraftConfirmDescription'),
        confirmLabel: t('exportForms:saveDraft'),
        tone: 'default',
      }
    case 'saveSubmit':
      return {
        title: t('exportForms:saveAndSubmitConfirmTitle', { code }),
        description: withChanged(t('exportForms:saveAndSubmitConfirmDescription')),
        confirmLabel: t('exportForms:saveAndSubmit'),
        tone: 'default',
      }
    case 'submitConfirm':
      return {
        title: t('exportForms:submitAndConfirmConfirmTitle', { code }),
        description: withChanged(t('exportForms:submitAndConfirmConfirmDescription')),
        confirmLabel: t('exportForms:submitAndConfirm'),
        tone: 'success',
      }
    case 'saveEdit':
      return {
        title: t('common:saveChangesTitle', { entity: t('exportForms:entityName'), name: code }),
        description: changedLine,
        confirmLabel: t('common:saveChanges'),
        tone: 'default',
      }
  }
}
