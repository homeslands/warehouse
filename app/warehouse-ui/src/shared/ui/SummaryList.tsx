import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { EmptyValue } from '@/shared/ui/EmptyValue'

export type SummaryItem = { label: string; value: ReactNode }

/**
 * Tóm tắt nhãn – giá trị trong hộp xác nhận ("Tạo kho mới?"): mỗi thông tin một dòng, nhãn xám bên trái,
 * giá trị đậm bên phải — người dùng soát từng dòng thay vì đọc một câu dài nhồi mọi thứ. Giá trị trống
 * hiện "Chưa có" (`EmptyValue`).
 */
export function SummaryList({ items, className }: { items: SummaryItem[]; className?: string }) {
  return (
    <dl className={cn('bg-muted/60 space-y-2 rounded-xl px-4 py-3 text-sm', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-4">
          <dt className="text-muted-foreground shrink-0">{item.label}</dt>
          <dd className="min-w-0 text-right font-medium break-words">
            {item.value === '' || item.value === null || item.value === undefined ? (
              <EmptyValue />
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
