import { useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View, type ScrollViewInstance, type TextInputInstance } from 'react-native'

import { formatLotLabel } from '@/entities/export-form'
import { useMaterialBatches, type MaterialBatch } from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  exportHasPrice,
  lineSerials,
  useExportDraft,
  type ExportLine,
} from '@/features/export-draft'
import { formatMoney, formatQuantity, type FormatLocale } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { useRevealInput } from '@/shared/lib/keyboard'
import { lineAmount } from '@/shared/lib/line-amount'
import { formatMoneyInput } from '@/shared/lib/money-input'
import { confirmAction } from '@/shared/lib/native-confirm'
import { round6 } from '@/shared/lib/round'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useDiscardGuard } from '@/shared/lib/useDiscardGuard'
import { useTheme } from '@/shared/theme/useTheme'
import { SheetScaffold, Text } from '@/shared/ui'
import { ActionRow, FormGroup, FormInfoRow, KeyboardDoneBar, MoneyField } from '@/shared/ui/compose'

import { BatchPicker } from './BatchPicker'
import { NOTE_MAX_LENGTH, priceToText, readPrice } from './line-fields'

/** Khoảng chừa phía trên khối được cuộn tới (`?focus=`). */
const FOCUS_TOP_GAP = 12
/** `nativeID` thanh "Xong" trên bàn phím số iOS của sheet (khác thanh của bước 2 nằm bên dưới). */
const PRICE_BAR = 'export-line-sheet-price'
/**
 * Ô đơn giá ngăn nghìn khi gõ nhưng KHÔNG cắt số lẻ thừa: ✓ báo "tối đa 2 chữ số thập phân" thay vì âm
 * thầm bỏ chữ người dùng vừa gõ.
 */
const PRICE_TYPING_DECIMALS = Number.POSITIVE_INFINITY

/**
 * Route `/export-line?key=&focus=lot|note` — sheet SỬA một dòng của phiếu xuất đang lập (spec wizard-apple
 * §7, mockup `apple-rows-v3` A màn 2); dòng lấy từ bản nháp theo param `key`. Đóng đúng MỘT lần: ghi xong
 * đổi khoá dòng (đổi lô / đơn vị) hay xoá dòng làm `line` biến mất ngay, khi đó hiệu ứng "dòng không còn"
 * không được `back()` thêm một màn nữa.
 */
export function ExportLineSheetScreen() {
  const { key, focus } = useLocalSearchParams<{ key?: string; focus?: string }>()
  const closeSheet = useCloseSheet()
  const draft = useExportDraft((s) => s.draft)
  const draftWarehouse = useExportDraft((s) => s.ctx?.warehouseSlug)
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  // Bản nháp của kho khác kho đang chọn (đổi kho trong lúc mở) → coi như không còn dòng.
  const line =
    draftWarehouse && draftWarehouse === warehouseSlug
      ? draft?.lines.find((l) => l.key === key)
      : undefined

  const closed = useRef(false)
  const close = () => {
    if (closed.current) return
    closed.current = true
    closeSheet()
  }

  // Không còn dòng (bản nháp biến mất sau khi phiên đổi, key lạ, khác kho) → không có gì để sửa.
  const missing = !line
  useEffect(() => {
    if (missing) close()
    // `close` đổi định danh mỗi lần render; chỉ phản ứng khi dòng biến mất.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing])

  if (!line) return null
  return (
    <LineSheet
      key={line.key}
      line={line}
      close={close}
      focus={focus === 'lot' || focus === 'note' ? focus : null}
    />
  )
}

type Lot = { slug: string | null; expiry: string | null; entry: string | null }

/** Chữ ô đơn giá khác lúc mở mà không phải cùng giá trị (vd gõ "12" rồi trả về "10") → đã sửa. */
const changedPrice = (
  read: { value: number | null } | { error: string },
  text: string,
  openedText: string,
  openedValue: number | null,
) => {
  if (text === openedText) return false
  if ('error' in read) return true
  const v = read.value
  return v === null || openedValue === null ? v !== openedValue : round6(v) !== round6(openedValue)
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Thân sheet: thẻ "Số lượng" [số chỉ đọc + "Bớt 1"] + danh sách serial của dòng (✕ bỏ đúng serial, −1; phần
 * chưa có serial hiện "k chưa có serial"; spec export-scan-only §7); khối [Đơn giá `MoneyField`][Thành tiền theo
 * chữ đang gõ]; khối [Lô → bung `BatchPicker`][Ghi chú][Xoá khỏi phiếu]. Mọi ô là state CỤC BỘ (gõ không
 * ghi gì); ✓ chỉ chặn chữ SAI rồi ghi MỘT lần `updateLine` (số trống = 0, giá trống = `null`) và đóng; đổi
 * lô trùng dòng khác → lỗi tại ô, không đóng. Đã sửa mà rời (✕, vuốt xuống, back Android) → hỏi
 * "Bỏ thay đổi?" (`useDiscardGuard`). Đang `saving` → chỉ đọc.
 */
function LineSheet({
  line,
  close,
  focus,
}: {
  line: ExportLine
  close: () => void
  focus: 'lot' | 'note' | null
}) {
  const { t, i18n } = useTranslation(['exportForms', 'common'])
  const { colors } = useTheme()
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  // Đang Lưu / Gửi duyệt: kết quả sẽ thay bản nháp → sheet chỉ đọc, không ghi gì (store cũng chặn).
  const saving = useExportDraft((s) => s.saving)
  // Chỉ phiếu Bán có đơn giá (như web): loại khác ẩn khối giá, giữ nguyên giá cũ của dòng khi lưu.
  const priced = exportHasPrice(useExportDraft((s) => s.draft?.header.type))
  const reveal = useRevealInput()

  // Cùng query với `BatchPicker` (cache chung): ngày nhập cho nhãn lô của dòng khi chưa bung danh sách.
  const batches = useMaterialBatches(warehouseSlug, line.materialSlug)

  // Dòng lúc mở sheet: so để biết đã sửa chưa.
  const [opened] = useState(() => ({
    line,
    serials: lineSerials(line),
    priceText: priceToText(line.unitPrice, locale),
  }))
  const [qty, setQty] = useState(line.quantity)
  const [serials, setSerials] = useState(opened.serials)
  const [priceText, setPriceText] = useState(opened.priceText)
  const [lot, setLot] = useState<Lot>({
    slug: line.batchSlug,
    expiry: line.batchExpiryDate,
    entry: null,
  })
  const [note, setNote] = useState(line.note ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [duplicate, setDuplicate] = useState<'lot' | null>(null)
  const [lotOpen, setLotOpen] = useState(focus === 'lot')
  // ✓ ghi xong / xoá dòng: sheet đang rời — không hỏi "Bỏ thay đổi?".
  const [leaving, setLeaving] = useState(false)

  const price = readPrice(priceText, locale)
  const noteValue = note.trim() === '' ? null : note
  const dirty =
    !leaving &&
    (round6(qty) !== round6(opened.line.quantity) ||
      !sameList(serials, opened.serials) ||
      changedPrice(price, priceText, opened.priceText, opened.line.unitPrice) ||
      lot.slug !== opened.line.batchSlug ||
      noteValue !== (opened.line.note?.trim() ? opened.line.note : null))
  // Chỉ đọc (đang lưu): không chặn rời — như sheet phiếu nhập.
  const { confirmLeave } = useDiscardGuard({ dirty, enabled: !saving })

  const unitName = line.unitName
  // Bớt / bỏ serial chỉ khi còn > 0 sau khi trừ 1 (về 0 → "Xoá khỏi phiếu").
  const canDec = !saving && round6(qty - 1) > 0
  // Phần số lượng chưa có serial (dòng cũ / nhãn chỉ Mã), theo đơn vị gốc.
  const unscanned = Math.max(0, Math.floor(round6(qty * line.conversionRate)) - serials.length)
  const priceError = submitted && 'error' in price ? t(`exportForms:line.${price.error}`) : null
  const amount =
    qty > 0 && 'value' in price && price.value !== null
      ? formatMoney(lineAmount(qty, price.value), locale)
      : '—'
  const lotLabel =
    lot.slug === null
      ? t('exportForms:lot.auto')
      : formatLotLabel(
          {
            expiryDate: lot.expiry,
            entryDate: lot.entry ?? batches.data?.find((b) => b.slug === lot.slug)?.entryDate,
          },
          new Date(),
          locale,
        )

  // `?focus=`: cuộn tới khối Lô / ô ghi chú (một lần; vị trí = khối + ô trong khối, đo bằng onLayout).
  const scrollRef = useRef<ScrollViewInstance>(null)
  const noteInput = useRef<TextInputInstance | null>(null)
  const priceInput = useRef<TextInputInstance | null>(null)
  const layout = useRef<{ details?: number; note?: number }>({})
  const scrolled = useRef(false)
  const measured = (part: 'details' | 'note', y: number) => {
    layout.current[part] = y
    const { details, note: noteY } = layout.current
    if ((focus !== 'lot' && focus !== 'note') || scrolled.current || details === undefined) return
    if (focus === 'note' && noteY === undefined) return
    scrolled.current = true
    const target = details + (focus === 'note' ? noteY! : 0)
    scrollRef.current?.scrollTo({ y: Math.max(0, target - FOCUS_TOP_GAP), animated: true })
  }
  useEffect(() => {
    if (focus === 'note') noteInput.current?.focus()
    // Đang lưu: chỉ đọc — không bật bàn phím.
    // Chỉ khi mở sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** "Bớt 1": bỏ serial CUỐI (nếu có) và `quantity − 1`. */
  const dropLast = () => {
    if (!canDec) return
    haptics.selection()
    setQty((q) => round6(q - 1))
    setSerials((prev) => prev.slice(0, -1))
  }
  /** ✕ cạnh serial: bỏ đúng serial đó và `quantity − 1`. */
  const dropSerial = (serial: string) => {
    if (!canDec) return
    haptics.selection()
    setQty((q) => round6(q - 1))
    setSerials((prev) => prev.filter((x) => x !== serial))
  }
  const pickLot = (batch: MaterialBatch | null) => {
    if (saving) return
    setLot({
      slug: batch?.slug ?? null,
      expiry: batch?.expiryDate ?? null,
      entry: batch?.entryDate ?? null,
    })
    setDuplicate(null)
    setLotOpen(false)
  }

  const submit = () => {
    const store = useExportDraft.getState()
    if (store.saving) return
    setSubmitted(true)
    if (priced && 'error' in price) {
      haptics.error()
      return
    }
    // `serials` truyền tường minh (đã bỏ đúng serial): đừng dựa vào cắt tự động của `updateLine`. Đổi lô mà
    // trùng dòng khác thì store từ chối và không ghi gì.
    const result = store.updateLine(line.key, {
      quantity: qty,
      serials,
      unitPrice: priced && 'value' in price ? price.value : line.unitPrice,
      batchSlug: lot.slug,
      batchExpiryDate: lot.expiry,
      note: noteValue,
    })
    if (result.ok) {
      haptics.success()
      setLeaving(true)
      close()
      return
    }
    if (result.reason === 'duplicate') setDuplicate('lot')
    haptics.error()
  }

  const cancel = async () => {
    if (await confirmLeave()) close()
  }

  const removeNow = () => {
    if (useExportDraft.getState().saving) return
    setLeaving(true)
    useExportDraft.getState().removeLine(line.key)
    close()
  }
  /** "Xoá khỏi phiếu": dòng có sẵn trên server → hỏi lại; dòng mới thêm trên máy → bỏ ngay. */
  const remove = async () => {
    if (useExportDraft.getState().saving) return
    if (line.base) {
      const ok = await confirmAction({
        title: t('exportForms:line.removeTitle'),
        message: t('exportForms:line.removeMessage', { name: line.materialName }),
        confirmLabel: t('exportForms:line.remove'),
        cancelLabel: t('common:cancel'),
        destructive: true,
      })
      if (!ok) return
    }
    removeNow()
  }
  const duplicateText = t('exportForms:line.duplicate')

  return (
    <SheetScaffold
      testID="export-line-sheet"
      title={line.materialName}
      cancelLabel={t('common:close')}
      onCancel={() => void cancel()}
      doneLabel={saving ? undefined : t('common:save')}
      onDone={saving ? undefined : submit}
      footer={saving ? t('exportForms:line.savingNote') : undefined}
      scrollRef={scrollRef}
      grouped
    >
      <View style={{ gap: 12 }}>
        <FormGroup title={t('common:compose.group.quantity')}>
          <FormInfoRow kind="custom" first label={t('exportForms:line.quantity')}>
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <Text numeric weight="semibold" size={22} testID="export-line-sheet-qty">
                {formatQuantity(qty, locale, 6)}
              </Text>
              <Text size={15} style={{ color: colors.mutedForeground }}>
                {unitName}
              </Text>
              <Pressable
                testID="export-line-sheet-dec"
                accessibilityRole="button"
                accessibilityLabel={t('exportForms:line.dropOne')}
                accessibilityState={{ disabled: !canDec }}
                disabled={!canDec}
                onPress={dropLast}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  paddingHorizontal: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  weight="semibold"
                  size={15}
                  style={{ color: canDec ? colors.accent : colors.mutedForeground }}
                >
                  {t('exportForms:line.dropOne')}
                </Text>
              </Pressable>
            </View>
          </FormInfoRow>
        </FormGroup>

        {serials.length > 0 || unscanned > 0 ? (
          <FormGroup testID="export-line-serials" title={t('exportForms:line.serials')}>
            {serials.map((serial, i) => (
              <View
                key={serial}
                style={{
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingLeft: 16,
                  borderTopWidth: i === 0 ? 0 : 0.5,
                  borderTopColor: colors.separator,
                }}
              >
                <Text code size={15} style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                  {serial}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('exportForms:line.dropSerial', { serial })}
                  accessibilityState={{ disabled: !canDec }}
                  disabled={!canDec}
                  onPress={() => dropSerial(serial)}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    size={18}
                    style={{ color: canDec ? colors.destructiveText : colors.mutedForeground }}
                  >
                    ✕
                  </Text>
                </Pressable>
              </View>
            ))}
            {unscanned > 0 ? (
              <View
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 16,
                  borderTopWidth: serials.length === 0 ? 0 : 0.5,
                  borderTopColor: colors.separator,
                }}
              >
                <Text
                  testID="export-line-unscanned"
                  size={14}
                  style={{ color: colors.mutedForeground }}
                >
                  {t('exportForms:line.unscanned', { count: unscanned })}
                </Text>
              </View>
            ) : null}
          </FormGroup>
        ) : null}

        {priced ? (
          <FormGroup title={t('common:compose.group.price')} errors={[priceError]}>
            <FormInfoRow kind="custom" first label={t('exportForms:line.unitPrice')}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <MoneyField
                  variant="plain"
                  testID="export-line-sheet-price"
                  inputRef={priceInput}
                  value={priceText}
                  onChangeText={(typed) => {
                    if (!saving)
                      setPriceText(formatMoneyInput(typed, locale, PRICE_TYPING_DECIMALS))
                  }}
                  onFocus={() => {
                    if (reveal && priceInput.current) reveal(priceInput.current)
                  }}
                  unitLabel={unitName}
                  state={priceText.trim() === '' ? 'missing' : 'normal'}
                  placeholder={t('common:compose.price.missing')}
                  accessibilityLabel={t('exportForms:line.unitPrice')}
                  inputAccessoryViewID={PRICE_BAR}
                  editable={!saving}
                />
              </View>
            </FormInfoRow>
            <FormInfoRow
              kind="readonly"
              testID="export-line-sheet-amount"
              label={t('exportForms:line.amount')}
              value={amount}
            />
          </FormGroup>
        ) : null}

        <FormGroup
          testID="export-line-details"
          title={t('common:compose.group.details')}
          onLayout={(e) => measured('details', e.nativeEvent.layout.y)}
        >
          <FormInfoRow
            kind="picker"
            first
            testID="export-line-sheet-lot"
            label={t('exportForms:lot.label')}
            value={lotLabel}
            accentValue
            chevron={lotOpen ? 'down' : 'right'}
            expanded={lotOpen}
            disabled={saving}
            onPress={() => {
              if (!saving) setLotOpen((open) => !open)
            }}
            error={duplicate === 'lot' ? duplicateText : null}
          />
          {lotOpen && !saving ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
              <BatchPicker
                materialSlug={line.materialSlug}
                value={lot.slug}
                expiryDate={line.batchExpiryDate}
                onChange={pickLot}
              />
            </View>
          ) : null}
          <View
            testID="export-line-note-section"
            onLayout={(e) => measured('note', e.nativeEvent.layout.y)}
          >
            <FormInfoRow
              kind="input"
              testID="export-line-sheet-note"
              label={t('exportForms:line.note')}
              value={note}
              onChangeText={setNote}
              maxLength={NOTE_MAX_LENGTH}
              editable={!saving}
              inputRef={noteInput}
            />
          </View>
        </FormGroup>

        <FormGroup>
          <ActionRow
            variant="centered"
            label={t('exportForms:line.remove')}
            color={colors.destructiveText}
            disabled={saving}
            onPress={() => void remove()}
          />
        </FormGroup>
      </View>
      <KeyboardDoneBar
        nativeID={PRICE_BAR}
        label={t('exportForms:wizard.priceBar', { unit: unitName })}
      />
    </SheetScaffold>
  )
}
