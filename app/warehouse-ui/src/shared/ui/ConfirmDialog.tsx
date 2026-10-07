import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isPhraseConfirmed } from '@/shared/lib/confirm-phrase'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { ConfirmPhraseField } from '@/shared/ui/ConfirmPhraseField'
import { DialogIcon } from '@/shared/ui/DialogIcon'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Glyph trần (vd `<TrashIcon />`) — quầng do `DialogIcon` vẽ. */
  icon: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
  /** Khối nằm giữa phần đầu và các nút, vd `SummaryList` tóm tắt bản ghi sắp tạo. */
  details?: React.ReactNode
  confirmLabel: string
  /** Mặc định "Huỷ". Đổi khi "Huỷ" dễ hiểu nhầm (vd hộp "Bỏ thay đổi?" → "Tiếp tục sửa"). */
  cancelLabel?: string
  /** `destructive` (mặc định) cho hành động phá huỷ; `success` cho hành động tích cực. */
  tone?: 'destructive' | 'success' | 'default'
  isPending?: boolean
  /**
   * Có = hiện ô "Nhập <X> để xác nhận", nút xác nhận khoá tới khi gõ khớp. Dành cho hành động khó đảo ngược
   * (đăng xuất mọi thiết bị…). Nút khoá (thay vì bấm rồi báo lỗi) là cố ý: câu hướng dẫn nằm ngay trên nút.
   */
  confirmPhrase?: string
  onConfirm: () => void
}

/**
 * Hộp xác nhận dùng chung cho mọi hành động phá huỷ (xoá, ngừng hoạt động, đăng xuất mọi thiết bị).
 *
 * Không biết gì về nghiệp vụ: mọi chuỗi và icon đều truyền vào. Bên gọi giữ phần "nhớ bản ghi cuối"
 * lúc hộp đang mờ dần, vì dữ liệu đó thuộc về entity của nó.
 *
 * **Vì sao là `Dialog` chứ không phải `AlertDialog`:** `AlertDialog` của Radix hard-code
 * `onPointerDownOutside: (e) => e.preventDefault()` — không gỡ được bằng props — nên không bao giờ
 * đóng được bằng cách bấm ra ngoài. Ở đây dùng `Dialog` rồi đặt lại `role="alertdialog"` (Radix
 * spread `...contentProps` SAU `role` nên ghi đè được): vừa bấm-ra-ngoài-để-đóng, vừa giữ đúng
 * ngữ nghĩa ARIA của một hộp xác nhận. Đổi lại phải tự chặn mọi lối đóng khi đang gửi request.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  icon,
  title,
  description,
  details,
  confirmLabel,
  cancelLabel,
  tone = 'destructive',
  isPending = false,
  confirmPhrase,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation('common')
  const [typed, setTyped] = useState('')
  // Đóng hộp = xoá chữ đã gõ, mở lại phải gõ lại từ đầu.
  if (!open && typed !== '') setTyped('')
  const confirmed = confirmPhrase === undefined || isPhraseConfirmed(typed, confirmPhrase)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        role="alertdialog"
        className="max-w-md"
        // Đang gửi thì khoá mọi lối đóng — hộp phải mở tới khi request xong, lỗi không được làm
        // nó biến mất như thể đã thành công. Nút × đi thẳng qua onOpenChange nên phải giấu riêng.
        showCloseButton={!isPending}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault()
        }}
      >
        <DialogHeader className="items-center text-center">
          <DialogIcon tone={tone}>{icon}</DialogIcon>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {details}

        {confirmPhrase !== undefined && (
          <ConfirmPhraseField
            phrase={confirmPhrase}
            value={typed}
            onChange={setTyped}
            disabled={isPending}
          />
        )}

        <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
          <Button
            type="button"
            variant="outline"
            size="xl"
            className="rounded-xl"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel ?? t('cancel')}
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
            disabled={isPending || !confirmed}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
