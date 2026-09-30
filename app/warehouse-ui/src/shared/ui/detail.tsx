import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/cn'
import { EmptyValue } from '@/shared/ui/EmptyValue'

/**
 * Card tổng quan của trang chi tiết: một tiêu đề, các `DetailGroup` ngăn bằng đường kẻ mảnh,
 * và chân card cho thông tin hệ thống (`DetailMeta`).
 */
export function DetailCard({
  title,
  footer,
  children,
}: {
  title: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="bg-card rounded-xl border">
      <div className="space-y-5 p-5 sm:p-6">
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        <div className="space-y-6">{children}</div>
      </div>
      {footer && <div className="border-t px-5 py-3 sm:px-6">{footer}</div>}
    </section>
  )
}

/** Một nhóm trường trong `DetailCard`. Nhóm thứ hai trở đi có đường kẻ phía trên. */
export function DetailGroup({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-4 border-t pt-6 first:border-t-0 first:pt-0">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </div>
  )
}

/**
 * Một trường: nhãn nằm trên giá trị. `span="full"` cho trường dài (địa chỉ, mô tả) chiếm trọn
 * chiều ngang. Giá trị trống: bên gọi truyền `<EmptyValue />`.
 */
export function DetailField({
  label,
  span,
  children,
}: {
  label: ReactNode
  span?: 'full'
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0 space-y-1', span === 'full' && 'sm:col-span-full')}>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  )
}

/** Dòng thông tin phụ ở chân card, vd "Tạo lúc … · Cập nhật lúc …". */
export function DetailMeta({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
      {items.map((item, i) => (
        <div key={i} className="flex gap-1.5">
          <dt>{item.label}</dt>
          <dd className="text-foreground tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Điện thoại / email dạng link `tel:` / `mailto:`; trống thì hiện `<EmptyValue />`. */
export function DetailContact({ kind, value }: { kind: 'tel' | 'mailto'; value?: string | null }) {
  if (!value) return <EmptyValue />
  return (
    <a href={`${kind}:${value}`} className="underline-offset-4 hover:underline">
      {value}
    </a>
  )
}
