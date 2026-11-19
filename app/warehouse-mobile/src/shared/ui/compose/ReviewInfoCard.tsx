import { DashCard, CardRow } from '../card'
import type { ReviewInfoRowData } from './ReviewParts'

/**
 * Nhóm "Thông tin" của màn xem phiếu (kiểu card Tổng quan): một `DashCard` chứa các `CardRow` không mũi
 * tên — nhãn bên trái, giá trị bên phải. Cùng dữ liệu `ReviewInfoRowData` với `ReviewInfoGroup` (bước 3
 * của form vẫn dùng bản cũ). Hàng `${testID}-${key}`.
 */
export function ReviewInfoCard({
  rows,
  testID,
}: {
  rows: readonly ReviewInfoRowData[]
  testID: string
}) {
  return (
    <DashCard testID={testID} style={{ gap: 0, paddingVertical: 10 }}>
      {rows.map((row) => (
        <CardRow
          key={row.key}
          testID={`${testID}-${row.key}`}
          label={row.label}
          value={row.value}
          valueCode={row.format === 'code'}
          valueNumeric={row.format === 'numeric'}
          valueLines={row.lines ?? 1}
        />
      ))}
    </DashCard>
  )
}
