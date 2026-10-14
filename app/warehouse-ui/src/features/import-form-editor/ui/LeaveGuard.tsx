import { TriangleAlertIcon } from 'lucide-react'
import { useEffect, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useBlocker } from 'react-router-dom'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'

type Props = {
  when: boolean
  /**
   * Bên gọi đặt `true` ngay trước khi tự điều hướng (lưu xong, xung đột) — đọc LÚC điều hướng, không qua state,
   * nên không phụ thuộc thứ tự render / effect của `useBlocker`.
   */
  bypass: RefObject<boolean>
}

/**
 * Chặn rời trang khi form đã sửa mà chưa lưu: điều hướng trong app → hộp "Bỏ thay đổi chưa lưu?";
 * đóng / tải lại tab → hộp gốc của trình duyệt (`beforeunload`). Cần data router (`useBlocker`).
 */
export function LeaveGuard({ when, bypass }: Props) {
  const { t } = useTranslation(['common'])
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when &&
      !bypass.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  )

  useEffect(() => {
    if (!when) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (bypass.current) return
      e.preventDefault()
      // Trình duyệt cũ chỉ hiện hộp hỏi khi returnValue được gán.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [when, bypass])

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset()
      }}
      icon={<TriangleAlertIcon />}
      title={t('common:discardTitle')}
      description={t('common:discardDescription')}
      confirmLabel={t('common:discardConfirm')}
      cancelLabel={t('common:keepEditing')}
      onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
    />
  )
}
