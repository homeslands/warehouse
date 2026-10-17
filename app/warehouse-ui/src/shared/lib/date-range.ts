/** URL sửa tay ngược chiều → đảo lại thay vì để backend trả 400 (mã `*DateRangeInvalid` của từng module). `YYYY-MM-DD` so sánh được như chuỗi. */
export function toCreatedRange(
  startDate?: string,
  endDate?: string,
): { startDate?: string; endDate?: string } {
  const [from, to] =
    startDate && endDate && startDate > endDate ? [endDate, startDate] : [startDate, endDate]
  return { ...(from ? { startDate: from } : {}), ...(to ? { endDate: to } : {}) }
}
