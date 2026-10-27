import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { DialogIcon } from '@/shared/ui/DialogIcon'

type DialogConfirmStepProps = {
  /** Glyph trần (vd `<SaveIcon />`) — quầng do `DialogIcon` vẽ. */
  icon: ReactNode
  title: string
  description?: ReactNode
  /** Khối tóm tắt giữa phần đầu và các nút. */
  details?: ReactNode
  confirmLabel: string
  /** Mặc định "Quay lại". */
  backLabel?: string
  tone?: 'default' | 'success' | 'destructive'
  /** Đang gửi: nút xác nhận và "Quay lại" khoá; bên gọi tự đổi `confirmLabel` thành "Đang …". */
  isPending?: boolean
  onBack: () => void
  onConfirm: () => void
}

/**
 * Bước xác nhận nằm TRONG hộp thoại sẵn có (nhóm C: đổi nội dung chính hộp, không chồng hộp thứ hai).
 * Bên gọi render nó bên trong `DialogContent` của mình khi `step === 'confirm'`. Tiêu đề / mô tả dùng
 * `DialogTitle` / `DialogDescription` nên hộp đổi tên khả truy cập theo bước.
 */
export function DialogConfirmStep({
  icon,
  title,
  description,
  details,
  confirmLabel,
  backLabel,
  tone = 'default',
  isPending = false,
  onBack,
  onConfirm,
}: DialogConfirmStepProps) {
  const { t } = useTranslation('common')

  return (
    <>
      <DialogHeader className="items-center text-center">
        <DialogIcon tone={tone}>{icon}</DialogIcon>
        <DialogTitle>{title}</DialogTitle>
        {description !== undefined && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>

      {details}

      <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
        <Button
          type="button"
          variant="outline"
          size="xl"
          className="rounded-xl"
          disabled={isPending}
          onClick={onBack}
        >
          {backLabel ?? t('back')}
        </Button>
        <Button
          type="button"
          variant={
            tone === 'destructive'
              ? 'destructive-solid'
              : tone === 'success'
                ? 'success-solid'
                : 'default'
          }
          size="xl"
          className="rounded-xl"
          disabled={isPending}
          onClick={() => {
            if (!isPending) onConfirm()
          }}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </>
  )
}
