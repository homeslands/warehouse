import type { FormEventHandler, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'

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
  onSubmit,
  children,
}: FormSheetProps) {
  const { t } = useTranslation(['common'])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              {t('common:cancel')}
            </Button>
            <Button type="submit" disabled={isPending || submitDisabled}>
              {isPending ? t('common:saving') : submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
