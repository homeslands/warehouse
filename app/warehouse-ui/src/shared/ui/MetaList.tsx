import type { ReactNode } from 'react'

export type MetaItem = { label: string; value: ReactNode }

/**
 * Một dòng meta nhẹ: nhãn mờ + giá trị đậm, các mục ngăn bằng vạch đứng, gạch chân ngăn với nội dung bên dưới.
 * Khung hẹp thì xuống dòng.
 */
export function MetaList({
  items,
  action,
}: {
  items: MetaItem[]
  /** Nút phụ căn phải (vd "Sửa"). */ action?: ReactNode
}) {
  // Mọi mục đều có vạch trái + lề trái; `dl` lùi sang trái đúng bằng lề + vạch trong khung `overflow-hidden` → mục đứng
  // đầu mỗi hàng (kể cả khi xuống dòng) bị cắt mất vạch, nên không có vạch thụt lơ lửng ở đầu hàng.
  return (
    <div className="flex items-start gap-3 border-b pb-3">
      <div className="min-w-0 flex-1 overflow-hidden">
        <dl className="-ml-[calc(1rem+1px)] flex flex-wrap items-baseline gap-y-1 text-sm">
          {items.map((item) => (
            <div key={item.label} className="flex min-w-0 items-baseline gap-1.5 border-l px-4">
              <dt className="text-muted-foreground shrink-0">{item.label}</dt>
              <dd className="min-w-0 font-medium break-words">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {action && <div className="shrink-0 -mt-1">{action}</div>}
    </div>
  )
}
