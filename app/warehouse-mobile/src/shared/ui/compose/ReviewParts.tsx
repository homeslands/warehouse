import { StyleSheet, View } from 'react-native'

import { formatMoney, type FormatLocale } from '../../lib/format'
import { useTheme } from '../../theme/useTheme'
import { Text } from '../Text'

/**
 * Phần dựng bước 3 "Xác nhận" (tóm tắt CHỈ ĐỌC) dùng chung phiếu xuất / phiếu nhập: dòng khoá–giá trị của
 * nhóm "Thông tin", chân nhóm "Vật tư" ("Lưu ý" + câu ghi chú mờ), hàng "Tổng cộng". Dòng vật tư là
 * `LineSummaryRow` không chevron. Chữ do màn truyền đã dịch; testID do màn đặt.
 */

/** Lề trái của dòng trong nhóm — đường kẻ mảnh giữa các dòng lùi bằng đây. */
const ROW_INSET = 16
/** Lề trái của chữ chân nhóm — thẳng với tiêu đề nhóm (`ComposeSectionHeader`) và lề dòng vật tư. */
const FOOTER_INSET = 18

/** Kẻ mảnh phía trên dòng, lùi theo lề trái của dòng. */
function Hairline({ color }: { color: string }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        left: ROW_INSET,
        height: StyleSheet.hairlineWidth,
        backgroundColor: color,
      }}
    />
  )
}

/** Một dòng khoá–giá trị của nhóm "Thông tin" (dữ liệu dùng chung bước 3 và màn xem). */
export type ReviewInfoRowData = {
  key: string
  label: string
  value: string
  /** `code` → font mã (mã phiếu, PO, HĐ); `numeric` → chữ số (ngày). */
  format?: 'code' | 'numeric'
  /** Số dòng tối đa của giá trị; mặc định 1. */
  lines?: number
}

export type ReviewInfoRowProps = {
  label: string
  value: string
  /** Giá trị là mã (mã phiếu, PO, HĐ) → font mã. */
  code?: boolean
  /** Giá trị là số / ngày → chữ số. */
  numeric?: boolean
  /** Số dòng tối đa của giá trị (ghi chú: 2). */
  lines?: number
  /** Dòng đầu của khối: không kẻ trên. */
  first: boolean
  testID?: string
}

/** Dòng khoá–giá trị chỉ đọc của nhóm "Thông tin" (≥ 44pt, kẻ mảnh lùi 16 trừ dòng đầu). */
export function ReviewInfoRow({
  label,
  value,
  code,
  numeric,
  lines = 1,
  first,
  testID,
}: ReviewInfoRowProps) {
  const { colors } = useTheme()
  return (
    <View
      testID={testID}
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 10,
        paddingLeft: ROW_INSET,
        paddingRight: 14,
      }}
    >
      {first ? null : <Hairline color={colors.separator} />}
      <Text size={14} style={{ color: colors.fieldLabel }}>
        {label}
      </Text>
      <Text
        size={14}
        weight="medium"
        code={code}
        numeric={numeric}
        numberOfLines={lines}
        style={{ flexShrink: 1, textAlign: 'right' }}
      >
        {value}
      </Text>
    </View>
  )
}

/** Khối card các dòng "Thông tin" (bước 3 và màn xem): mỗi dòng testID `${testID}-${row.key}`. */
export function ReviewInfoGroup({
  rows,
  testID,
}: {
  rows: readonly ReviewInfoRowData[]
  testID: string
}) {
  const { colors, radius } = useTheme()
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.groupLarge,
        overflow: 'hidden',
      }}
    >
      {rows.map((row, i) => (
        <ReviewInfoRow
          key={row.key}
          testID={`${testID}-${row.key}`}
          label={row.label}
          value={row.value}
          code={row.format === 'code'}
          numeric={row.format === 'numeric'}
          lines={row.lines ?? 1}
          first={i === 0}
        />
      ))}
    </View>
  )
}

export type ReviewNotesProps = {
  /** Tiêu đề của các cảnh báo (vd "Lưu ý") — chỉ trong nhãn đọc. */
  title: string
  warnings: readonly string[]
  footnote: string
  warningsTestID: string
  footnoteTestID: string
}

/**
 * Chân nhóm "Vật tư · n" của bước 3 (spec wizard-apple §8, kiểu chân nhóm của Cài đặt): các cảnh báo
 * "Lưu ý" là chữ `warningText` 13 ngay dưới nhóm (chỉ khi có; KHÔNG chặn, KHÔNG còn thẻ riêng — tiêu đề
 * chỉ còn trong nhãn đọc "Lưu ý: …") rồi câu ghi chú mờ.
 */
export function ReviewNotes({
  title,
  warnings,
  footnote,
  warningsTestID,
  footnoteTestID,
}: ReviewNotesProps) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: 12, paddingTop: 7 }}>
      {warnings.length > 0 ? (
        <View
          testID={warningsTestID}
          accessible
          accessibilityLabel={`${title}: ${warnings.join('. ')}`}
          style={{ gap: 3, paddingHorizontal: FOOTER_INSET }}
        >
          {warnings.map((w) => (
            <Text key={w} size={13} style={{ color: colors.warningText }}>
              {w}
            </Text>
          ))}
        </View>
      ) : null}
      <Text
        testID={footnoteTestID}
        muted
        size={12.5}
        style={{ paddingHorizontal: FOOTER_INSET, lineHeight: 19 }}
      >
        {footnote}
      </Text>
    </View>
  )
}

export type ReviewTotalProps = {
  testID: string
  /** Đã dịch, vd "Tổng cộng". */
  label: string
  total: number
  locale: FormatLocale
}

/** Hàng "Tổng cộng" + tổng đậm 18 ở đáy bước 3. */
export function ReviewTotal({ testID, label, total, locale }: ReviewTotalProps) {
  const { colors } = useTheme()
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
      }}
    >
      <Text size={13} style={{ color: colors.fillForeground }}>
        {label}
      </Text>
      <Text numeric weight="bold" size={18}>
        {formatMoney(total, locale)}
      </Text>
    </View>
  )
}
