import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { compareDelta, splitAmount, type Flow, type Translate } from '@/features/overview-period'
import { formatMoney, formatMoneyCompact } from '@/shared/lib/format'
import { useTheme } from '@/shared/theme/useTheme'
import { CardChevron, CardHeader, DashCard, StateValue, Text, type ValueState } from '@/shared/ui'
import { ArrowDownToLine, ArrowDownUp, ArrowUpFromLine, Clock } from '@/shared/ui/icons'

import { MiniBars } from './MiniBars'

/** Phiếu đã xác nhận của kỳ đang xem và kỳ so sánh. */
export type FlowPair = { current: Flow; previous: Flow }
/** Tổng phiếu đang chờ (không theo kỳ): `data` vắng = đang tải; `failed` = lỗi VÀ chưa có số. */
export type PendingPart = {
  data?: { sum: number; count: number; truncated: boolean }
  failed: boolean
}
const CARD_GAP = 14
export type Metric = 'import' | 'export'

type Combined = { state: Exclude<ValueState, 'ok'> } | { state: 'ok'; sum: number; stale: boolean }
type Part = { state: ValueState; sum?: number; stale?: boolean }

/** Lỗi > đang tải > vượt trần > có số. */
function combine(parts: Part[]): Combined {
  for (const s of ['failed', 'loading', 'truncated'] as const)
    if (parts.some((p) => p.state === s)) return { state: s }
  return {
    state: 'ok',
    sum: parts.reduce((acc, p) => acc + (p.sum ?? 0), 0),
    stale: parts.some((p) => p.stale),
  }
}
const ofFlow = (f: Flow): Part =>
  f.state === 'ok' ? { state: f.state, sum: f.amount, stale: f.stale } : { state: f.state }
const ofPending = (p: PendingPart): Part =>
  p.failed
    ? { state: 'failed' as const }
    : !p.data
      ? { state: 'loading' as const }
      : p.data.truncated
        ? { state: 'truncated' as const }
        : { state: 'ok' as const, sum: p.data.sum }

/**
 * Nhóm "Tiền" (theo kỳ đang lọc): thẻ Chênh lệch nhập − xuất (đủ hai quyền; thanh so sánh nhập / xuất),
 * hai thẻ Nhập kho / Xuất kho (số + cột mini theo ô thời gian + so kỳ trước; chạm → màn chi tiết), thẻ
 * Đang chờ xử lý (không theo kỳ). Tiền rút gọn chỉ khi ≥ 1 triệu; trình đọc màn hình đọc số đầy đủ.
 */
export function MoneySection({
  imports,
  exports,
  pending,
  prevName,
  onOpen,
}: {
  imports?: FlowPair
  exports?: FlowPair
  pending: { imports?: PendingPart; exports?: PendingPart }
  /** Tên kỳ so sánh viết thường ("tháng 10"). */
  prevName: string
  onOpen: (metric: Metric) => void
}) {
  const { t, i18n } = useTranslation('overview')
  const { colors } = useTheme()
  const lng: 'vi' | 'en' = i18n.language === 'en' ? 'en' : 'vi'

  /** Chuỗi tiền: làm tròn về đơn vị trước khi xét dấu (nhiễu float không thành "+0 đ"). */
  const money = (sum: number, full: boolean, signed = false) => {
    const rounded = Math.round(sum)
    if (rounded === 0) return formatMoney(0, lng)
    const body = (full ? formatMoney : formatMoneyCompact)(Math.abs(rounded), lng)
    if (signed) return `${rounded > 0 ? '+' : '−'}${body}`
    return rounded < 0 ? `−${body}` : body
  }
  const stateText = (v: Combined, signed = false) =>
    v.state === 'ok'
      ? money(v.sum, true, signed)
      : v.state === 'failed'
        ? t('loadError')
        : v.state === 'loading'
          ? t('money.loading')
          : t('money.truncated')
  const value = (id: string, v: Combined, size: number, signed = false) => {
    const [num, unit] = v.state === 'ok' ? splitAmount(money(v.sum, false, signed)) : ['', '']
    return (
      <StateValue
        id={id}
        state={v.state}
        value={num}
        unit={unit}
        size={size}
        dim={v.state === 'ok' && v.stale}
      />
    )
  }

  const tr: Translate = (key, options) => t(key, options) as string
  /** So kỳ trước (`compareDelta`): chỉ khi cả hai kỳ đủ số và không phải số tạm. */
  const delta = (pair: FlowPair) => compareDelta(pair.current, pair.previous, prevName, lng, tr)

  const flowCard = (metric: Metric, pair: FlowPair) => {
    const id = `money-${metric}`
    const v = combine([ofFlow(pair.current)])
    const d = delta(pair)
    const cur = pair.current
    const name = t(`money.${metric}`)
    const bar = metric === 'import' ? colors.accent : colors.chart2
    return (
      <DashCard
        key={metric}
        testID={id}
        onPress={() => onOpen(metric)}
        accessibilityLabel={[t('money.rowA11y', { label: name, value: stateText(v) }), d?.a11y]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint={t('openDetailHint')}
        style={{ flex: 1, minWidth: 0 }}
      >
        <CardHeader
          compact
          icon={metric === 'import' ? ArrowDownToLine : ArrowUpFromLine}
          label={name}
          trailing={<CardChevron />}
        />
        {value(id, v, 26)}
        {cur.state === 'ok' ? (
          <MiniBars
            testID={`mini-bars-${metric}`}
            series={[{ values: cur.bars.amount, color: bar }]}
            elapsed={cur.elapsed}
            dim={cur.stale}
          />
        ) : null}
        {d ? (
          <Text muted numeric size={13} numberOfLines={2}>
            {d.text}
          </Text>
        ) : null}
      </DashCard>
    )
  }

  const diffCard = (imp: FlowPair, exp: FlowPair) => {
    const ci = ofFlow(imp.current)
    const ce = ofFlow(exp.current)
    const v = combine([ci, { ...ce, sum: ce.sum === undefined ? undefined : -ce.sum }])
    const both = ci.state === 'ok' && ce.state === 'ok' ? { i: ci.sum ?? 0, e: ce.sum ?? 0 } : null
    const total = both ? both.i + both.e : 0
    const label = t('money.diff')
    return (
      <DashCard
        testID="money-diff"
        accessibilityLabel={t('money.rowA11y', { label, value: stateText(v, true) })}
      >
        <CardHeader icon={ArrowDownUp} label={label} />
        {value('money-diff', v, 34, true)}
        {both ? (
          <View style={{ gap: 5, opacity: v.state === 'ok' && v.stale ? 0.45 : 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text muted numeric size={13} numberOfLines={1} style={{ flexShrink: 1 }}>
                {t('money.barImport', { amount: formatMoney(both.i, lng) })}
              </Text>
              <Text muted numeric size={13} numberOfLines={1} style={{ flexShrink: 1 }}>
                {t('money.barExport', { amount: formatMoney(both.e, lng) })}
              </Text>
            </View>
            <View
              aria-hidden
              style={{
                flexDirection: 'row',
                height: 8,
                borderRadius: 4,
                overflow: 'hidden',
                gap: total > 0 && both.i > 0 && both.e > 0 ? 2 : 0,
                backgroundColor: colors.fill,
              }}
            >
              {both.i > 0 ? (
                <View style={{ flexGrow: both.i, minWidth: 3, backgroundColor: colors.accent }} />
              ) : null}
              {both.e > 0 ? (
                <View style={{ flexGrow: both.e, minWidth: 3, backgroundColor: colors.chart2 }} />
              ) : null}
            </View>
          </View>
        ) : null}
      </DashCard>
    )
  }

  // Đang chờ: cộng phần có quyền; số phiếu từng loại chỉ khi mọi phần đủ số.
  const parts = [pending.imports, pending.exports].filter((p) => p !== undefined)
  const pv = combine(parts.map(ofPending))
  const detail =
    pv.state === 'ok'
      ? [
          pending.imports?.data
            ? t('money.pendingImports', { count: pending.imports.data.count })
            : null,
          pending.exports?.data
            ? t('money.pendingExports', { count: pending.exports.data.count })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null
  const pendingLabel = t('money.pending')

  return (
    <View style={{ gap: CARD_GAP }}>
      {imports && exports ? diffCard(imports, exports) : null}
      {imports || exports ? (
        <View style={{ flexDirection: 'row', gap: CARD_GAP }}>
          {imports ? flowCard('import', imports) : null}
          {exports ? flowCard('export', exports) : null}
        </View>
      ) : null}
      <DashCard
        testID="money-pending"
        accessibilityLabel={[
          t('money.rowA11y', { label: pendingLabel, value: stateText(pv) }),
          detail,
        ]
          .filter(Boolean)
          .join(', ')}
      >
        <CardHeader icon={Clock} label={pendingLabel} trailing={t('now')} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ flex: 1 }}>{value('money-pending', pv, 32)}</View>
          {detail ? (
            <Text
              muted
              numeric
              size={13}
              style={{ flexShrink: 1, maxWidth: '55%', textAlign: 'right' }}
            >
              {detail}
            </Text>
          ) : null}
        </View>
      </DashCard>
    </View>
  )
}
