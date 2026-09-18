import type { ReactNode } from 'react'

type ListToolbarProps = {
  /** Trái: ô tìm, bộ lọc. */
  filters?: ReactNode
  /** Phải: nút hành động (Tạo, Xuất...). */
  actions?: ReactNode
}

/** Khung bố cục thanh trên bảng. Không giữ trạng thái — bộ lọc sống trên URL (useListParams). */
export function ListToolbar({ filters, actions }: ListToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-1 flex-wrap items-center gap-2">{filters}</div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  )
}
