import { TriangleAlertIcon } from 'lucide-react'
import { useState, type FormEventHandler, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'

/**
 * Hộp "Xác nhận tạo …?" hiện SAU khi form đã hợp lệ (bên gọi mở nó trong `handleSubmit`, giữ giá trị chờ
 * gửi). Đang gửi thì hộp khoá như mọi `ConfirmDialog`. Bên gọi tự đóng hộp khi gửi lỗi để lỗi tại ô hiện ra.
 */
export type FormSheetConfirmation = {
  open: boolean
  onOpenChange: (open: boolean) => void
  icon: ReactNode
  title: string
  description: ReactNode
  /** Tóm tắt bản ghi sắp tạo — thường là `SummaryList`. */
  details?: ReactNode
  confirmLabel: string
  onConfirm: () => void
}

type FormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Nhãn nút gửi ("Tạo kho" / "Lưu"); lúc đang gửi tự đổi thành `common:saving`. */
  submitLabel: string
  isPending: boolean
  /** Form sửa khoá nút Lưu khi chưa đổi gì. KHÔNG khoá vì form chưa hợp lệ. */
  submitDisabled?: boolean
  /**
   * Form đã đổi so với lúc mở (`formState.isDirty`). Có → mọi lối đóng KHÔNG qua Lưu (Huỷ, ×, Esc,
   * bấm ra ngoài) hỏi "Bỏ thay đổi chưa lưu?" trước. Bấm Lưu không hỏi — nút Lưu đã là lần xác nhận.
   */
  isDirty?: boolean
  /** Có → hỏi lại trước khi gửi (nghiệp vụ chốt: thao tác TẠO phải xác nhận). Xem `FormSheetConfirmation`. */
  confirmation?: FormSheetConfirmation
  onSubmit: FormEventHandler<HTMLFormElement>
  children: ReactNode
}

/**
 * Khung cho form nhiều ô: ngăn trượt bên phải, tiêu đề cố định, vùng nội dung cuộn được, chân
 * sheet cố định chứa Huỷ/Lưu. Quy ước của dự án: **form nhiều ô → `FormSheet`; thao tác một ô
 * (gán, chọn) → `Dialog`; xác nhận phá huỷ → `AlertDialog`.**
 *
 * Nút Lưu nằm TRONG `<form>` nên submit được bằng cả chuột lẫn Enter, không cần thuộc tính `form=`
 * (jsdom không nối `form=` qua portal của Radix).
 */
export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  isPending,
  submitDisabled = false,
  isDirty = false,
  confirmation,
  onSubmit,
  children,
}: FormSheetProps) {
  const { t } = useTranslation(['common'])
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  // Bên gọi tự đóng sheet (lưu xong) → bỏ luôn hộp hỏi nếu đang mở.
  if (!open && confirmingDiscard) setConfirmingDiscard(false)

  // Bên gọi đóng sheet bằng `onOpenChange` của chính nó sau khi lưu xong — lối đó không qua đây.
  const requestClose = () => {
    if (isDirty) setConfirmingDiscard(true)
    else onOpenChange(false)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <SheetContent
          side="right"
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]"
          // `Dialog.Close` của Radix gọi thẳng `onOpenChange`, KHÔNG đi qua `onEscapeKeyDown` /
          // `onPointerDownOutside` — nút × ở góc vì thế vượt được chốt isPending. Giấu nó lúc đang
          // gửi, để không còn lối đóng nào lọt qua — đúng như Esc, bấm ra ngoài và nút Huỷ.
          showCloseButton={!isPending}
          onEscapeKeyDown={(event) => {
            if (isPending) event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (isPending) event.preventDefault()
          }}
        >
          <SheetHeader className="border-b">
            <SheetTitle>{title}</SheetTitle>
            {description !== undefined && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>

          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>

            <SheetFooter className="flex-row justify-end gap-2 border-t">
              <Button type="button" variant="outline" disabled={isPending} onClick={requestClose}>
                {t('common:cancel')}
              </Button>
              <Button type="submit" disabled={isPending || submitDisabled}>
                {isPending ? t('common:saving') : submitLabel}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        icon={<TriangleAlertIcon />}
        title={t('common:discardTitle')}
        description={t('common:discardDescription')}
        confirmLabel={t('common:discardConfirm')}
        cancelLabel={t('common:keepEditing')}
        onConfirm={() => {
          setConfirmingDiscard(false)
          onOpenChange(false)
        }}
      />

      {confirmation && (
        <ConfirmDialog
          open={open && confirmation.open}
          onOpenChange={confirmation.onOpenChange}
          icon={confirmation.icon}
          tone="default"
          title={confirmation.title}
          description={confirmation.description}
          details={confirmation.details}
          confirmLabel={confirmation.confirmLabel}
          isPending={isPending}
          onConfirm={confirmation.onConfirm}
        />
      )}
    </>
  )
}
