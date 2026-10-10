import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export type StatusTone = 'success' | 'neutral' | 'warning' | 'info'

/**
 * Chấm + chữ cùng màu, không nền, không viền — nhẹ hơn badge, không lấn át cột tên khi quét bảng.
 * Chữ xanh dùng thẳng `--success` cho tươi (chốt với nghiệp vụ): tương phản ~3.8:1 trên nền trắng —
 * dưới 4.5:1 của chữ nhỏ nhưng chữ đậm vừa + chấm + nhãn rõ nghĩa nên vẫn đọc được. `neutral` cho
 * trạng thái chủ động tắt (khoá, ngừng hoạt động): không phải lỗi nên không dùng đỏ.
 */
const TONES: Record<StatusTone, { text: string; dot: string }> = {
  success: {
    text: 'text-success',
    dot: 'bg-success',
  },
  neutral: {
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
  },
  warning: { text: 'text-warning', dot: 'bg-warning' },
  info: { text: 'text-info', dot: 'bg-info' },
}

/**
 * Trạng thái dùng chung cho cột trạng thái của bảng và header trang chi tiết. Luôn có chữ — chấm
 * chỉ để trang trí, không truyền nghĩa một mình (WCAG 1.4.1).
 */
export function StatusIndicator({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const style = TONES[tone]
  return (
    <span
      data-slot="status"
      data-tone={tone}
      className={cn('inline-flex items-center gap-1.5 font-medium whitespace-nowrap', style.text)}
    >
      <span
        data-slot="status-dot"
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-full', style.dot)}
      />
      {children}
    </span>
  )
}
