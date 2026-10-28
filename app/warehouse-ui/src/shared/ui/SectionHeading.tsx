import type { ReactNode } from 'react'

type SectionHeadingProps = {
  /** Gắn vào `<h3>` để `<section aria-labelledby>` lấy làm tên vùng. */
  id?: string
  title: ReactNode
  /** Nút phụ căn phải cùng hàng tiêu đề (vd "Sửa"). */
  action?: ReactNode
}

/** Tiêu đề một phần trong thẻ (h3) kèm thao tác phụ căn phải — dùng ở bước "Kiểm tra" của các wizard. */
export function SectionHeading({ id, title, action }: SectionHeadingProps) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <h3 id={id} className="text-base font-semibold">
        {title}
      </h3>
      {action}
    </div>
  )
}
