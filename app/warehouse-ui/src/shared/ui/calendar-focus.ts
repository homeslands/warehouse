/**
 * `onOpenAutoFocus` của `PopoverContent` chứa `Calendar`: đưa focus vào lưới ngày (ngày đang chọn →
 * hôm nay → ngày đầu tiên bấm được) thay vì mũi tên tháng đầu tiên — mũi tên có tooltip, focus vào
 * đó sẽ bật tooltip và Esc đầu tiên chỉ đóng tooltip.
 */
export function focusCalendarDay(event: Event): void {
  event.preventDefault()
  const root = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const content = root ?? (event.target instanceof HTMLElement ? event.target : null)
  const day =
    content?.querySelector<HTMLElement>('button[data-day][tabindex="0"]') ??
    content?.querySelector<HTMLElement>('button[data-day]:not(:disabled)')
  if (day) day.focus()
  else content?.focus()
}
