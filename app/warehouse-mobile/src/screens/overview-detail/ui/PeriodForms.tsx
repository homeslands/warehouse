import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Period, type SlimForm } from '@/features/overview-period'
import { formatMoney, formatTime, localDayKey } from '@/shared/lib/format'
import { useTheme } from '@/shared/theme/useTheme'
import { CardFooter, CardRow, DashCard, PillButton, Text } from '@/shared/ui'

import { dayMonth } from '../model/detail'

/**
 * "Phiếu trong kỳ": các phiếu đã xác nhận (đã xếp sẵn) trong một card, mỗi `CardRow` = mã phiếu (`Text code`), ngày (giờ với
 * kỳ Ngày) · bên liên quan, số tiền đầy đủ; `showKind` (Hoạt động) thêm nhãn Nhập / Xuất màu loại. Chạm
 * dòng → `onOpen`. Chỉ vẽ `limit` dòng đầu + nút viên "Xem thêm (n)" ở chân card. Danh sách rỗng → chữ trạng thái.
 */
export function PeriodForms({
  forms,
  limit,
  period,
  showKind,
  dim,
  onMore,
  onOpen,
}: {
  forms: SlimForm[]
  limit: number
  period: Period
  showKind: boolean
  dim?: boolean
  onMore: () => void
  onOpen: (form: SlimForm) => void
}) {
  const { t, i18n } = useTranslation('overview')
  const lng: 'vi' | 'en' = i18n.language === 'en' ? 'en' : 'vi'
  const { colors } = useTheme()
  if (forms.length === 0)
    return (
      <DashCard>
        <Text testID="detail-empty" muted size={15} style={{ textAlign: 'center' }}>
          {t('detail.empty')}
        </Text>
      </DashCard>
    )
  const shown = forms.slice(0, limit)
  const rest = forms.length - shown.length
  const when = (f: SlimForm) => {
    if (period === 'day') return formatTime(f.createdAt)
    const day = localDayKey(f.createdAt)
    return day ? dayMonth(day, lng) : ''
  }
  return (
    <DashCard style={{ opacity: dim ? 0.45 : 1 }}>
      <View>
        {shown.map((f) => {
          const kind = t(`detail.kind.${f.kind}`)
          const amount = formatMoney(f.amount, lng)
          const sub = [when(f), f.party].filter(Boolean).join(' · ')
          return (
            <CardRow
              key={`${f.kind}-${f.slug}`}
              testID={`detail-form-${f.kind}-${f.slug}`}
              accessibilityLabel={[showKind ? kind : null, f.code, sub, amount]
                .filter(Boolean)
                .join(', ')}
              accessibilityHint={t('detail.openFormHint')}
              onPress={() => onOpen(f)}
              value={amount}
              label={
                <Text code size={15}>
                  {f.code}
                </Text>
              }
              subtitle={
                <>
                  {showKind ? (
                    <Text
                      weight="semibold"
                      size={13}
                      style={{ color: f.kind === 'import' ? colors.accentText : colors.chart2 }}
                    >
                      {`${kind} · `}
                    </Text>
                  ) : null}
                  <Text numeric muted size={13}>
                    {sub}
                  </Text>
                </>
              }
            />
          )
        })}
      </View>
      {rest > 0 ? (
        <CardFooter
          left={
            <PillButton
              testID="detail-more"
              label={t('detail.more', { count: rest })}
              onPress={onMore}
            />
          }
        />
      ) : null}
    </DashCard>
  )
}
