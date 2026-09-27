import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { DialogIcon } from '@/shared/ui/DialogIcon'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Glyph trần (vd `<TrashIcon />`) — quầng do `DialogIcon` vẽ. */
  icon: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel: string
  /** `destructive` (mặc định) cho hành động phá huỷ; `success` cho hành động tích cực. */
  tone?: 'destructive' | 'success' | 'default'
  isPending?: boolean
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
  confirmLabel,
  tone = 'destructive',
  isPending = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation('common')

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

        <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
          <Button
            type="button"
            variant="outline"
            size="xl"
            className="rounded-xl"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
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
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
