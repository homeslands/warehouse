/**
 * Danh sách tên gọn: tối đa `max` tên đầu (mặc định 2) + "+N" (như cột Kho của màn Người dùng, NCC của vật tư); đủ tên ở
 * `title` và cho trình đọc màn hình.
 */
export function NameList({
  names,
  max = 2,
  nameClassName,
}: {
  names: string[]
  max?: number
  /** Class cho phần tên (vd `line-clamp-2`) — "+N" nằm ngoài nên không bị cắt theo. */
  nameClassName?: string
}) {
  const all = names.join(', ')
  if (names.length <= max) return <span className={nameClassName}>{all}</span>
  return (
    <span title={all}>
      <span aria-hidden="true">
        <span className={nameClassName}>{names.slice(0, max).join(', ')}</span> +
        {names.length - max}
      </span>
      <span className="sr-only">{all}</span>
    </span>
  )
}
