import type { TFunction } from 'i18next'

/**
 * Các nút lưu của wizard phiếu nhập: Lưu nháp khi tạo (`createDraft`), Lưu & xác nhận khi tạo / sửa (`saveConfirm`),
 * Lưu / Enter khi sửa nháp (`saveEdit`).
 */
export type ImportSaveAction = 'createDraft' | 'saveConfirm' | 'saveEdit'

export type ImportSaveConfirmCopy = {
  title: string
  description: string
  confirmLabel: string
  tone: 'default' | 'success'
}

/**
 * Nội dung hộp hỏi trước khi lưu, theo hành động (spec §3.2). `code` = mã phiếu sẽ gửi / đang sửa; `changed` = nhãn
 * các ô đã sửa (rỗng khi tạo). `saveConfirm` khi sửa có đổi thì nối "Đã sửa: …" sau câu hậu quả.
 */
export function importSaveConfirmCopy(
  t: TFunction<['importForms', 'common']>,
  action: ImportSaveAction,
  { code, changed }: { code: string; changed: string[] },
): ImportSaveConfirmCopy {
  const changedLine =
    changed.length > 0 ? t('common:changedFields', { fields: changed.join(', ') }) : ''
  switch (action) {
    case 'createDraft':
      return {
        title: t('importForms:createDraftConfirmTitle', { code }),
        description: t('importForms:createDraftConfirmDescription'),
        confirmLabel: t('importForms:saveDraft'),
        tone: 'default',
      }
    case 'saveConfirm':
      return {
        title: t('importForms:saveAndConfirmTitle', { code }),
        description: [t('importForms:saveAndConfirmDescription'), changedLine]
          .filter(Boolean)
          .join(' '),
        confirmLabel: t('importForms:saveAndConfirm'),
        tone: 'success',
      }
    case 'saveEdit':
      return {
        title: t('common:saveChangesTitle', { entity: t('importForms:entityName'), name: code }),
        description: changedLine,
        confirmLabel: t('common:saveChanges'),
        tone: 'default',
      }
  }
}
