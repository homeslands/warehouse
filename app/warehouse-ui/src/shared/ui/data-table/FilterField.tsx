import { useId, type ReactNode } from 'react'
import { FILTER_LABEL_CLASS, useFilterDisplay } from './filter-display'

type FilterFieldProps = {
  label: string
  /** Con không phải một control đơn (nhiều nút / ô) → bọc `role="group"` thay cho `<label>`. */
  group?: boolean
  children: ReactNode
}

/**
 * Bọc bộ lọc tự viết (vd `PersonFilter`): ở chế độ `popover` vẽ nhãn phía trên ô; chế độ khác chỉ trả `children`.
 */
export function FilterField({ label, group = false, children }: FilterFieldProps) {
  const display = useFilterDisplay()
  const id = useId()
  if (display !== 'popover') return <>{children}</>
  if (group) {
    return (
      <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
        <span id={id} className={FILTER_LABEL_CLASS}>
          {label}
        </span>
        {children}
      </div>
    )
  }
  return (
    <label className="flex flex-col gap-1.5">
      <span className={FILTER_LABEL_CLASS}>{label}</span>
      {children}
    </label>
  )
}
