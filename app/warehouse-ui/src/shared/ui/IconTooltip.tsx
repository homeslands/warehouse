import type { FocusEvent, ReactElement } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

type IconTooltipProps = {
  /** Đúng chuỗi với `aria-label` / `sr-only` của nút. */
  label: string
  /** Một phần tử nhận được ref + sự kiện chuột (Button, DropdownMenuTrigger asChild...). */
  children: ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Nút đang `disabled` (không nhận sự kiện chuột) → bọc `<span>` để vẫn hiện tooltip. */
  disabled?: boolean
}

/**
 * Focus do code trả về (Radix đóng menu / hộp thoại → focus về nút) không được bật tooltip; chỉ focus
 * bàn phím (`:focus-visible`) mới mở. Radix bỏ handler nội bộ khi `preventDefault()`.
 */
function openOnKeyboardFocusOnly(event: FocusEvent<HTMLElement>) {
  try {
    if (!event.currentTarget.matches(':focus-visible')) event.preventDefault()
  } catch {
    // Môi trường không hỗ trợ `:focus-visible` → giữ hành vi mặc định.
  }
}

/** Tooltip nhìn thấy cho nút chỉ có icon. Không dùng thuộc tính `title`. */
export function IconTooltip({ label, children, side, disabled }: IconTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild onFocus={openOnKeyboardFocusOnly}>
        {disabled ? <span className="inline-flex">{children}</span> : children}
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
