import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleDot,
  Lock,
  LockOpen,
  Minus,
  Pencil,
  Plus,
  type LucideIcon,
} from '@/shared/ui/icons'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import {
  formatQuantity,
  groupHistoryByDay,
  type InventoryAction,
  type InventoryHistory,
} from '@/entities/inventory'
import { formatTime } from '@/shared/lib/format'
import type { ColorTokens } from '@/shared/theme/tokens'
import { useTheme } from '@/shared/theme/useTheme'
import { Button, ComposeSectionHeader, ListGroup, Text } from '@/shared/ui'

import { TabMessage } from './TabMessage'

export type HistoryListProps = {
  /** Các dòng đã tải (mọi trang, mới → cũ); `undefined` = chưa tải xong lần đầu. */
  rows: InventoryHistory[] | undefined
  /** Lần tải đầu lỗi (chưa có dữ liệu). */
  failed: boolean
  retrying: boolean
  onRetry: () => void
  /** Đang tải trang sau / tải trang sau lỗi (màn cha gọi tải khi cuộn gần cuối). */
  loadingMore: boolean
  loadMoreFailed: boolean
  onRetryMore: () => void
  locale: 'vi' | 'en'
  today: Date
}

const TILE = 36
/** Đường kẻ bắt đầu sau ô icon: lề 16 + ô 36 + khoảng 12. */
const ROW_INSET = 64

type Look = { icon: LucideIcon; bg: keyof ColorTokens; fg: keyof ColorTokens }

const LOOK: Record<InventoryAction, Look> = {
  IMPORT: { icon: ArrowDownToLine, bg: 'successSoft', fg: 'successText' },
  EXPORT: { icon: ArrowUpFromLine, bg: 'destructiveSoft', fg: 'destructive' },
  RESERVE: { icon: Lock, bg: 'infoSoft', fg: 'infoText' },
  RELEASE: { icon: LockOpen, bg: 'infoSoft', fg: 'infoText' },
  ADJUST: { icon: Pencil, bg: 'fill', fg: 'fillForeground' },
  ASSIGN: { icon: Plus, bg: 'fill', fg: 'fillForeground' },
  REMOVE: { icon: Minus, bg: 'fill', fg: 'fillForeground' },
}
/** Mã mới BE thêm sau này: icon trung tính, tiêu đề là nguyên mã. */
const UNKNOWN: Look = { icon: CircleDot, bg: 'fill', fg: 'fillForeground' }

const isKnown = (action: string): action is InventoryAction => action in LOOK
const isReservation = (action: string) => action === 'RESERVE' || action === 'RELEASE'

function HistoryRow({ row, locale }: { row: InventoryHistory; locale: 'vi' | 'en' }) {
  const { t } = useTranslation('inventory')
  const { colors } = useTheme()
  const fmt = (v: number) => formatQuantity(v, locale)
  const look = isKnown(row.action) ? LOOK[row.action] : UNKNOWN
  const Icon = look.icon
  const title = isKnown(row.action) ? t(`historyAction.${row.action}`) : row.action
  const subtitle = [row.note, row.changedByName, formatTime(row.createdAt)]
    .filter(Boolean)
    .join(' · ')

  let amount: string
  let amountColor: string
  let detail: string
  if (isReservation(row.action)) {
    amount = fmt(Math.abs(row.reservedDelta))
    amountColor = colors.infoText
    detail = t('historyReserved', { value: fmt(row.reservedAfter) })
  } else {
    const delta = row.quantityDelta
    // Dấu trừ thật (U+2212) như mockup, không phải gạch nối.
    amount = delta > 0 ? `+${fmt(delta)}` : delta < 0 ? `−${fmt(-delta)}` : fmt(0)
    amountColor =
      delta > 0 ? colors.successText : delta < 0 ? colors.destructiveText : colors.mutedForeground
    detail = t('historyChange', {
      before: fmt(row.quantityBefore),
      after: fmt(row.quantityAfter),
    })
  }

  return (
    <View
      testID="history-row"
      accessible
      accessibilityLabel={[title, subtitle, amount, detail].filter(Boolean).join(', ')}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        minHeight: 58,
        paddingHorizontal: 16,
        paddingVertical: 11,
      }}
    >
      <View
        aria-hidden
        style={{
          width: TILE,
          height: TILE,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors[look.bg],
        }}
      >
        <Icon size={20} strokeWidth={2} color={colors[look.fg]} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text weight="semibold" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text muted size={12.5} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 1, maxWidth: '40%' }}>
        <Text numeric weight="semibold" size={15} numberOfLines={1} style={{ color: amountColor }}>
          {amount}
        </Text>
        <Text muted weight="medium" size={11.5} numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </View>
  )
}

/**
 * Tab "Lịch sử" (mockup phone 3): biến động tồn nhóm theo ngày ("Hôm nay" / "Hôm qua" / dd/MM/yyyy),
 * mỗi dòng ô icon theo loại biến động, ghi chú · người làm · giờ, bên phải số thay đổi có dấu và
 * "trước → sau" (giữ chỗ: số giữ + "đang giữ n"). Dòng KHÔNG bấm được (API không trả mã phiếu).
 * Không tự tải trang sau: màn cha gọi khi cuộn gần cuối, ở đây chỉ hiện trạng thái.
 */
export function HistoryList({
  rows,
  failed,
  retrying,
  onRetry,
  loadingMore,
  loadMoreFailed,
  onRetryMore,
  locale,
  today,
}: HistoryListProps) {
  const { t } = useTranslation(['inventory', 'common'])
  const { colors } = useTheme()

  if (!rows && failed)
    return <TabMessage text={t('inventory:historyError')} onRetry={onRetry} retrying={retrying} />
  if (!rows) return <TabMessage loading loadingLabel={t('inventory:loading')} />
  if (rows.length === 0) return <TabMessage text={t('inventory:historyEmpty')} />

  const groups = groupHistoryByDay(rows, today)
  const dayLabel = (label: string) =>
    label === 'today'
      ? t('inventory:historyToday')
      : label === 'yesterday'
        ? t('inventory:historyYesterday')
        : label

  return (
    <View style={{ gap: 6 }}>
      {groups.map((g, i) => (
        <View key={g.key} testID={`history-day-${i}`}>
          <ComposeSectionHeader title={dayLabel(g.label)} />
          <ListGroup large inset={ROW_INSET}>
            {g.rows.map((r) => (
              <HistoryRow key={r.slug} row={r} locale={locale} />
            ))}
          </ListGroup>
        </View>
      ))}
      {loadingMore ? (
        <ActivityIndicator testID="history-loading-more" color={colors.mutedForeground} />
      ) : loadMoreFailed ? (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text muted size={13}>
            {t('inventory:historyMoreError')}
          </Text>
          <Button variant="outline" onPress={onRetryMore}>
            {t('common:retry')}
          </Button>
        </View>
      ) : null}
    </View>
  )
}
