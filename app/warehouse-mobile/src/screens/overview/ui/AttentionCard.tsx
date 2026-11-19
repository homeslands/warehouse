import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  EXPIRY_SOON_DAYS,
  expiryStatus,
  formatShortDate,
  type MaterialBatch,
} from '@/entities/inventory'
import { useTheme } from '@/shared/theme/useTheme'
import { BigValue, CardFooter, CardHeader, CardLink, CardRow, DashCard, Text } from '@/shared/ui'
import { CircleDot, TriangleAlert } from '@/shared/ui/icons'

import { countdownLabel } from '../model/money'

/** Một số đếm: `count` vắng = đang tải; `failed` = lỗi VÀ chưa có số. */
export type ExpiryCount = { count?: number; failed: boolean }
export type ExpiryRow = { batch: MaterialBatch; name: string }

const ROWS = 2

/**
 * Card "Hạn dùng" của nhóm "Cần chú ý" (chỉ gắn khi có lô quá hạn / sắp hết hạn), biến thể cảnh báo: dòng
 * chính = lô quá hạn (không có thì số sắp hết hạn; lỗi = "!"), dòng phụ "và 3 lô sắp hết hạn trong 60 ngày",
 * hàng "● N lô đã quá hạn ›" (đỏ) / "● N lô sắp hết hạn ›" (cam) — hàng 0 ẩn — mở sheet đúng nhóm, 2 lô hết hạn
 * sớm nhất với viên đếm ngược, chân "Xem tất cả ›". Không theo bộ lọc kỳ.
 */
export function AttentionCard({
  expired,
  soon,
  rows,
  today,
  onOpen,
}: {
  expired: ExpiryCount
  soon: ExpiryCount
  rows?: ExpiryRow[]
  today: Date
  onOpen: (focus?: 'expired' | 'soon') => void
}) {
  const { t } = useTranslation(['overview', 'inventory'])
  const { colors } = useTheme()
  const nExpired = expired.count ?? 0
  // Lỗi và đang tải đọc khác nhau (không đọc "tải lỗi" khi còn đang tải).
  const a11y = expired.failed
    ? t('overview:expiry.cardA11yExpiredFailed')
    : soon.count !== undefined
      ? t('overview:expiry.cardA11y', { expired: nExpired, soon: soon.count })
      : soon.failed
        ? t('overview:expiry.cardA11ySoonFailed', { expired: nExpired })
        : t('overview:expiry.cardA11ySoonLoading', { expired: nExpired })

  const row = ({ batch, name }: ExpiryRow, i: number) => {
    const days = expiryStatus(batch.expiryDate, today).days ?? 0
    const cd = countdownLabel(days)
    const pill =
      cd.key === 'today'
        ? t('overview:expiry.today')
        : t(`overview:expiry.${cd.key}`, { count: cd.n })
    const overdue = cd.key === 'overdue'
    return (
      <CardRow
        key={batch.slug}
        testID={`attention-lot-${batch.slug}`}
        label={name}
        subtitle={t('inventory:batchExpiry', { date: formatShortDate(batch.expiryDate ?? '') })}
        onPress={() => onOpen(overdue ? 'expired' : 'soon')}
        accessibilityHint={t('overview:expiry.openHint')}
        trailing={
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 3,
              backgroundColor: overdue ? colors.destructiveSoft : colors.warningSoft,
            }}
          >
            <Text
              numeric
              weight="semibold"
              size={12}
              numberOfLines={1}
              style={{ color: overdue ? colors.destructiveText : colors.warningText }}
            >
              {pill}
            </Text>
          </View>
        }
      />
    )
  }

  const showExpiredRow = !expired.failed && nExpired > 0
  const showSoonRow = !soon.failed && (soon.count ?? 0) > 0
  const soonErrorStyle = { color: colors.destructiveText }

  return (
    <DashCard testID="attention-expiry" variant="alert">
      <CardHeader
        icon={TriangleAlert}
        variant="alert"
        label={t('overview:expiry.title')}
        trailing={t('overview:expiry.when')}
      />
      <View accessible accessibilityLabel={a11y} testID="attention-expiry-main" style={{ gap: 4 }}>
        {expired.failed ? (
          <Text
            numeric
            weight="bold"
            size={32}
            testID="attention-expired-error"
            style={soonErrorStyle}
          >
            !
          </Text>
        ) : nExpired > 0 ? (
          <BigValue
            value={String(nExpired)}
            unit={t('overview:expiry.expiredUnit')}
            color={colors.destructiveText}
          />
        ) : soon.failed ? (
          <Text
            numeric
            weight="bold"
            size={32}
            testID="attention-soon-error"
            style={soonErrorStyle}
          >
            !
          </Text>
        ) : (
          <BigValue
            value={String(soon.count ?? 0)}
            unit={t('overview:expiry.soonOnlyUnit')}
            color={colors.warningText}
          />
        )}
        {!expired.failed && nExpired > 0 && soon.failed ? (
          <Text muted size={15}>
            <Text
              numeric
              weight="bold"
              size={15}
              testID="attention-soon-error"
              style={soonErrorStyle}
            >
              !
            </Text>
            {` ${t('overview:expiry.soonFailedSub')}`}
          </Text>
        ) : showExpiredRow && showSoonRow ? (
          <Text muted numeric size={15}>
            {t('overview:expiry.andSoon', { count: soon.count, days: EXPIRY_SOON_DAYS })}
          </Text>
        ) : null}
      </View>
      {showExpiredRow || showSoonRow ? (
        <View>
          {showExpiredRow ? (
            <CardRow
              testID="attention-expiry-expired"
              icon={CircleDot}
              iconColor={colors.destructive}
              label={t('overview:expiry.rowExpired', { count: nExpired })}
              onPress={() => onOpen('expired')}
              accessibilityHint={t('overview:expiry.openHint')}
            />
          ) : null}
          {showSoonRow ? (
            <CardRow
              testID="attention-expiry-soon"
              icon={CircleDot}
              iconColor={colors.warning}
              label={t('overview:expiry.rowSoon', { count: soon.count })}
              onPress={() => onOpen('soon')}
              accessibilityHint={t('overview:expiry.openHint')}
            />
          ) : null}
        </View>
      ) : null}
      {rows && rows.length > 0 ? <View>{rows.slice(0, ROWS).map(row)}</View> : null}
      <CardFooter right={<CardLink testID="attention-expiry-all" onPress={() => onOpen()} />} />
    </DashCard>
  )
}
