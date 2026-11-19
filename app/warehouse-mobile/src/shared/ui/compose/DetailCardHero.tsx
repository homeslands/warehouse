import type { ReactNode } from 'react'
import { View } from 'react-native'

import { formatMoney, type FormatLocale } from '../../lib/format'
import { useTheme } from '../../theme/useTheme'
import { BigValue, CardHeader, DashCard } from '../card'
import type { LucideIcon } from '../icons'
import { Text } from '../Text'

export type DetailCardHeroProps = {
  /** Icon trạng thái trong vòng đầu card + nền / màu tô nhạt theo trạng thái. */
  icon: LucideIcon
  iconBackground: string
  iconColor: string
  /** Nhãn đầu card, vd "Phiếu nhập". */
  kind: string
  /** Viên trạng thái (+ viên loại) ở bên phải đầu card. */
  pills: ReactNode
  title: string
  titleMuted?: boolean
  /** Đã dịch, vd "Tổng cộng". */
  totalLabel: string
  /** `null` = không có tổng tiền (vd phiếu xuất không phải Bán) — không vẽ nhãn + số tổng. */
  total: number | null
  locale: FormatLocale
  /** Mã phiếu (dòng phụ, font mã). */
  code: string
  /** Ngày hiển thị sau mã (dòng phụ, font số). */
  date: string
  /** Vd "3 dòng vật tư" (chữ riêng, sau dòng phụ). */
  count: string
  /** Tổng: `${testID}-total`; dòng phụ: `${testID}-meta`. */
  testID?: string
}

/**
 * Đầu màn xem phiếu kiểu card Tổng quan: `DashCard` — đầu card (vòng icon tô theo trạng thái + nhãn loại phiếu
 * + viên trạng thái), tiêu đề (bên bán / người nhận), dòng chính = tổng tiền to đậm, dòng phụ muted.
 * `DetailHero` cũ vẫn dành cho nơi khác.
 */
export function DetailCardHero({
  icon,
  iconBackground,
  iconColor,
  kind,
  pills,
  title,
  titleMuted,
  totalLabel,
  total,
  locale,
  code,
  date,
  count,
  testID,
}: DetailCardHeroProps) {
  const { colors } = useTheme()
  return (
    <DashCard testID={testID}>
      <CardHeader
        icon={icon}
        iconBackground={iconBackground}
        iconColor={iconColor}
        label={kind}
        trailing={<View style={{ flexDirection: 'row', gap: 6 }}>{pills}</View>}
      />
      <Text
        accessibilityRole="header"
        weight="bold"
        size={20}
        numberOfLines={2}
        muted={titleMuted}
        style={{ lineHeight: 25 }}
      >
        {title}
      </Text>
      {total !== null ? (
        <>
          <Text size={13} style={{ marginBottom: -8, color: colors.fieldLabel }}>
            {totalLabel}
          </Text>
          <BigValue
            size={28}
            testID={testID ? `${testID}-total` : undefined}
            value={formatMoney(total, locale)}
          />
        </>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 6 }}>
        <Text testID={testID ? `${testID}-meta` : undefined} muted size={13}>
          <Text code muted size={13}>
            {code}
          </Text>
          <Text numeric muted size={13}>{` · ${date}`}</Text>
        </Text>
        <Text aria-hidden muted size={13}>
          ·
        </Text>
        <Text numeric muted size={13}>
          {count}
        </Text>
      </View>
    </DashCard>
  )
}
