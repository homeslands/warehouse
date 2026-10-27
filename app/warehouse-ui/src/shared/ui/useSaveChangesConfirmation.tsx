import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { FormSheetConfirmation } from '@/shared/ui/FormSheet'

type Options<T> = {
  /** Sheet đang mở? Sheet đóng thì hộp xác nhận cũng đóng. */
  open: boolean
  /** Loại bản ghi, vd "kho" — ghép vào tiêu đề. */
  entity: string
  /** Tên / mã bản ghi, vd "Kho A". */
  name: string
  /** Nhãn các ô đã sửa (`changedFieldLabels`); rỗng thì bỏ dòng "Đã sửa". */
  changed: string[]
  icon: ReactNode
  onConfirm: (values: T) => void
}

/**
 * Hộp "Lưu thay đổi …?" cho form sheet sửa. Gọi `request(values)` trong `handleSubmit` (sau khi hợp
 * lệ) để giữ giá trị và mở hộp; gọi `close()` trong `onError` để lỗi hiện về đúng ô.
 */
export function useSaveChangesConfirmation<T>({
  open,
  entity,
  name,
  changed,
  icon,
  onConfirm,
}: Options<T>): {
  request: (values: T) => void
  close: () => void
  confirmation: FormSheetConfirmation
} {
  const { t } = useTranslation('common')
  // Bọc trong object để giá trị falsy vẫn phân biệt được với "chưa request".
  const [pending, setPending] = useState<{ values: T } | null>(null)
  // Sheet đóng → bỏ giá trị chờ, mở lại sheet không tự bật hộp.
  if (!open && pending !== null) setPending(null)

  const close = () => setPending(null)

  return {
    request: (values) => setPending({ values }),
    close,
    confirmation: {
      open: open && pending !== null,
      onOpenChange: (next) => {
        if (!next) close()
      },
      icon,
      title: t('saveChangesTitle', { entity, name }),
      description: changed.length > 0 ? t('changedFields', { fields: changed.join(', ') }) : '',
      confirmLabel: t('saveChanges'),
      cancelLabel: t('back'),
      onConfirm: () => {
        if (pending) onConfirm(pending.values)
      },
    },
  }
}
