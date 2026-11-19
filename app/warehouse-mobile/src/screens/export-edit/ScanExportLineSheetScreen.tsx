import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated'

import { useInventory } from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  lineSerials,
  MAX_ITEMS,
  normSerial,
  useExportDraft,
  useLotInfo,
} from '@/features/export-draft'
import { ScanScreen, SCAN_TEXT, SCAN_TEXT_MUTED } from '@/features/scan-material'
import { formatQuantity } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { Button, Text } from '@/shared/ui'
import { Check, TriangleAlert, X } from '@/shared/ui/icons'

import { applyScan, readLabel, type ScanOutcome } from './plan-scan'

/** Đỏ / vàng / xanh hệ thống sáng — đọc rõ trên thẻ nền tối của màn quét. */
const WARN_TEXT = '#FFD60A'
const TONE = {
  ok: { color: '#30D158', icon: Check },
  warn: { color: WARN_TEXT, icon: TriangleAlert },
  error: { color: '#FF6961', icon: X },
} as const
/** Số mục tối đa giữ trong danh sách đã quét của một lượt mở. */
const MAX_ENTRIES = 50
const ROW_HEIGHT = 48
/** Thu gọn: chỉ chừng này mục mới nhất. */
const COLLAPSED_ROWS = 2
/** Chiều cao cố định của danh sách thu gọn (2 dòng + đệm đáy). */
const COLLAPSED_HEIGHT = COLLAPSED_ROWS * ROW_HEIGHT + 4
/** Mở rộng: vùng cuộn cao tối đa tỉ lệ này của màn. */
const EXPANDED_MAX = 0.6
/** Vuốt đầu thẻ vượt ngưỡng này (pt) hoặc vận tốc (pt/s) → mở / đóng. */
const SWIPE_DISTANCE = 30
const SWIPE_VELOCITY = 500
/** Dòng "mã vẫn trong khung" tự tắt sau khoảng này. */
const NOTICE_MS = 2500

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never
type ScanFailure = Extract<ScanOutcome, { ok: false }>
/** Một mục của danh sách đã quét: cộng thành công / trùng serial / lỗi khác. */
type ScanEntry = { id: number } & (
  | { kind: 'ok'; name: string; quantity: number; unit: string; serial: string | null }
  | { kind: 'dup'; serial: string; name: string }
  | { kind: 'error'; failure: ScanFailure }
)

/**
 * Route `/scan-export-line` — sheet quét LIÊN TỤC mở từ nút Quét mã / "Quét mã" của bước 2 phiếu xuất
 * (spec export-scan-only §5): vật tư chỉ vào phiếu bằng quét nhãn. Mỗi lần đọc → `applyScan` (+1 đơn vị
 * gốc, nối serial nếu có) rồi rung success / warning (trùng serial) / error; thẻ đáy là DANH SÁCH ĐÃ QUÉT trong lượt mở
 * (mới nhất ở trên, tối đa 50). Nhãn còn trong khung bị camera bỏ qua → `onRepeat` (⚠ nếu serial đã có). Đang Lưu / Gửi duyệt → camera tắt (store cũng chặn ghi). nút "Xong" to đóng màn.
 * Bản nháp không thuộc kho đang chọn (đổi kho / hết phiên trong lúc mở) → đóng sheet, không quét.
 */
export function ScanExportLineSheetScreen() {
  const { t, i18n } = useTranslation(['exportForms', 'inventory', 'common'])
  const closeSheet = useCloseSheet()
  const closed = useRef(false)
  const close = () => {
    if (closed.current) return
    closed.current = true
    closeSheet()
  }
  const reduced = useReducedMotion()
  const { height: screenHeight } = useWindowDimensions()
  const [expanded, setExpanded] = useState(false)
  const locale = i18n.language === 'en' ? 'en' : 'vi'
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const lines = useExportDraft((s) => s.draft?.lines)
  const saving = useExportDraft((s) => s.saving)
  const draftWarehouse = useExportDraft((s) => s.ctx?.warehouseSlug)
  // Tồn kho / lô đọc theo kho đang chọn: bản nháp của kho khác thì không được quét vào.
  const foreign = !draftWarehouse || draftWarehouse !== warehouseSlug
  useEffect(() => {
    if (foreign) close()
    // `close` đổi định danh mỗi lần render; chỉ phản ứng khi kho lệch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foreign])
  const inventory = useInventory(warehouseSlug)
  const lots = useLotInfo(warehouseSlug, lines)
  const stock = inventory.data

  const [entries, setEntries] = useState<ScanEntry[]>([])
  const [count, setCount] = useState(0)
  const [flash, setFlash] = useState<'success' | 'error' | null>(null)
  // Số lần đã xử lý (cả lỗi / trùng): đổi → khung chớp lại dù cùng loại kết quả.
  const [handled, setHandled] = useState(0)
  const [repeatNotice, setRepeatNotice] = useState(false)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextId = useRef(0)
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    },
    [],
  )
  const hideNotice = () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = null
    setRepeatNotice(false)
  }
  const push = (entry: DistributiveOmit<ScanEntry, 'id'>) => {
    nextId.current += 1
    const item = { ...entry, id: nextId.current } as ScanEntry
    setEntries((list) => [item, ...list].slice(0, MAX_ENTRIES))
  }

  const onScanned = (text: string) => {
    if (!stock || foreign) return
    hideNotice()
    const result = applyScan(text, stock, (slug) => lots.get(slug))
    if (result.ok) {
      haptics.success()
      setCount((n) => n + 1)
      push({
        kind: 'ok',
        name: result.materialName,
        quantity: result.quantity,
        unit: result.unitName,
        serial: result.serial,
      })
      setFlash('success')
    } else if (result.reason === 'duplicateSerial') {
      haptics.warning()
      push({ kind: 'dup', serial: result.serial, name: result.materialName })
      setFlash('error')
    } else {
      haptics.error()
      push({ kind: 'error', failure: result })
      setFlash('error')
    }
    setHandled((n) => n + 1)
  }

  /** Nhãn vẫn còn trong khung (camera bỏ qua): có serial đã trên phiếu → ⚠; chỉ Mã → dòng tạm. */
  const onRepeat = (text: string) => {
    if (!stock || foreign) return
    const label = readLabel(text, stock)
    if (label.serial === null) {
      hideNotice()
      setRepeatNotice(true)
      noticeTimer.current = setTimeout(() => {
        noticeTimer.current = null
        setRepeatNotice(false)
      }, NOTICE_MS)
      return
    }
    const serial = normSerial(label.serial)
    const owner = useExportDraft
      .getState()
      .draft?.lines.find((l) => lineSerials(l).some((x) => normSerial(x) === serial))
    if (!owner) return
    haptics.warning()
    push({ kind: 'dup', serial: label.serial, name: owner.materialName })
    setFlash('error')
    setHandled((n) => n + 1)
  }

  const qty = (n: number) => formatQuantity(n, locale)
  const row = (e: ScanEntry) => {
    let title: string
    let detail: ReactNode = null
    let tone: keyof typeof TONE = 'ok'
    if (e.kind === 'ok') {
      title = e.name
      detail = (
        <>
          {t('exportForms:scanSheet.addedDetail', { qty: qty(e.quantity), unit: e.unit })}
          {e.serial ? (
            <>
              {' · '}
              <Text code size={12} style={{ color: SCAN_TEXT_MUTED }}>
                {e.serial}
              </Text>
            </>
          ) : null}
        </>
      )
    } else if (e.kind === 'dup') {
      tone = 'warn'
      title = e.name
      detail = (
        <>
          {t('exportForms:scanSheet.duplicateLabel')}
          {' · '}
          <Text code size={12} style={{ color: SCAN_TEXT_MUTED }}>
            {e.serial}
          </Text>
        </>
      )
    } else {
      tone = 'error'
      const r = e.failure
      switch (r.reason) {
        case 'busy':
          title = t('exportForms:scanSheet.busy')
          break
        case 'notFound':
          title = r.code
          detail = t('exportForms:scanSheet.notFoundShort')
          break
        case 'noUnit':
          title = r.materialName
          detail = t('exportForms:scanSheet.noUnit', { name: r.materialName })
          break
        case 'full':
          title = r.materialName
          detail = t('exportForms:scanSheet.full', { max: MAX_ITEMS })
          break
        case 'overStock':
          title = r.materialName
          detail = t('exportForms:scanSheet.overStock', {
            name: r.materialName,
            available: qty(r.available),
            unit: r.unitName,
          })
          break
        case 'duplicateSerial':
          title = r.materialName
          detail = t('exportForms:scanSheet.duplicateSerial', {
            serial: r.serial,
            name: r.materialName,
          })
          break
      }
    }
    const Icon = TONE[tone].icon
    return (
      <Animated.View
        key={e.id}
        testID="scan-entry"
        entering={reduced ? undefined : FadeIn.duration(200)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: ROW_HEIGHT }}
      >
        <View
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${TONE[tone].color}33`,
          }}
        >
          <Icon size={14} strokeWidth={3} color={TONE[tone].color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text weight="semibold" size={15} numberOfLines={1} style={{ color: SCAN_TEXT }}>
            {title}
          </Text>
          {detail ? (
            <Text size={12} numberOfLines={1} style={{ color: SCAN_TEXT_MUTED }}>
              {detail}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    )
  }

  const toggle = () => setExpanded((v) => !v)
  // Vuốt lên → mở rộng, vuốt xuống → thu gọn (đầu thẻ: thanh nắm + hàng tiêu đề).
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(10)
    .onEnd((e) => {
      if (e.translationY <= -SWIPE_DISTANCE || e.velocityY <= -SWIPE_VELOCITY) setExpanded(true)
      else if (e.translationY >= SWIPE_DISTANCE || e.velocityY >= SWIPE_VELOCITY) setExpanded(false)
    })

  const failed = !stock && inventory.errorUpdateCount > 0
  const muted = (text: string) => (
    <Text size={14} style={{ color: SCAN_TEXT_MUTED, textAlign: 'center' }}>
      {text}
    </Text>
  )

  const listOpen = expanded && entries.length > 0
  const notice = saving ? (
    muted(t('exportForms:scanSheet.busy'))
  ) : repeatNotice ? (
    // Gợi ý (chữ xám), không phải cảnh báo: chỉ hiện khi nhãn đã được cộng mà vẫn để yên trong khung lâu.
    <Text testID="scan-notice" size={13} style={{ color: SCAN_TEXT_MUTED, textAlign: 'center' }}>
      {t('exportForms:scanSheet.repeatCode')}
    </Text>
  ) : null

  let bottom
  if (failed) {
    bottom = (
      <>
        <Text weight="semibold" size={16} style={{ color: SCAN_TEXT, textAlign: 'center' }}>
          {t('inventory:loadError')}
        </Text>
        <Button
          variant="accent"
          capsule
          loading={inventory.isFetching}
          onPress={() => void inventory.refetch({ cancelRefetch: false })}
        >
          {t('common:retry')}
        </Button>
      </>
    )
  } else {
    bottom = (
      <>
        {listOpen ? notice : null}
        <GestureDetector gesture={pan}>
          <View testID="scan-header">
            <Pressable
              testID="scan-grabber"
              accessible={false}
              onPress={toggle}
              style={{ alignItems: 'center', paddingBottom: 6 }}
            >
              <View
                aria-hidden
                style={{
                  width: 36,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: 'rgba(255,255,255,0.3)',
                }}
              />
            </Pressable>
            <Pressable
              accessible={false}
              onPress={toggle}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text
                testID="scan-count"
                weight="semibold"
                size={13}
                style={{ color: SCAN_TEXT_MUTED }}
              >
                {t('exportForms:scanSheet.listTitle', { count })}
              </Text>
              <Pressable
                testID="scan-expand"
                accessibilityRole="button"
                accessibilityLabel={
                  expanded
                    ? t('exportForms:scanSheet.collapseA11y')
                    : t('exportForms:scanSheet.expandA11y')
                }
                accessibilityState={{ expanded }}
                onPress={toggle}
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  justifyContent: 'center',
                  alignItems: 'flex-end',
                }}
              >
                <Text weight="semibold" size={14} style={{ color: SCAN_TEXT }}>
                  {expanded
                    ? t('exportForms:scanSheet.collapse')
                    : t('exportForms:scanSheet.expand')}
                </Text>
              </Pressable>
            </Pressable>
          </View>
        </GestureDetector>
        {listOpen ? (
          <Animated.View layout={reduced ? undefined : LinearTransition.duration(250)}>
            <ScrollView
              testID="scan-list"
              style={{ maxHeight: screenHeight * EXPANDED_MAX }}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
            >
              {entries.map(row)}
            </ScrollView>
          </Animated.View>
        ) : (
          // Thu gọn: vùng CAO CỐ ĐỊNH (đủ 2 dòng) dù trống / có thông báo / có mục — thẻ không đổi cao
          // khi quét nên khung ngắm (đặt theo mép trên thẻ) không nhảy.
          <View
            testID="scan-list"
            style={{
              height: COLLAPSED_HEIGHT,
              overflow: 'hidden',
              justifyContent: entries.length === 0 && !notice ? 'center' : 'flex-start',
            }}
          >
            {notice}
            {entries.length === 0
              ? notice
                ? null
                : muted(stock ? t('exportForms:scanSheet.empty') : t('inventory:scanLoading'))
              : entries.slice(0, notice ? 1 : COLLAPSED_ROWS).map(row)}
          </View>
        )}
        <Button variant="accent" capsule style={{ alignSelf: 'stretch' }} onPress={close}>
          {t('exportForms:scanSheet.done')}
        </Button>
      </>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScanScreen
        testID="scan-sheet"
        continuous
        active={!!stock && !saving && !foreign}
        onScanned={onScanned}
        onRepeat={onRepeat}
        onClose={close}
        hint={t('inventory:scanHint')}
        bottom={bottom}
        flash={flash}
        flashKey={handled}
        bottomExpanded={expanded && entries.length > 0 && !failed}
      />
    </GestureHandlerRootView>
  )
}
