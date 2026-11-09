import { useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View, type ScrollViewInstance, type TextInputInstance } from 'react-native'

import { formatLotLabel } from '@/entities/export-form'
import { useInventory, useMaterialBatches, type MaterialBatch } from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import { useExportDraft, type ExportLine } from '@/features/export-draft'
import { formatMoney, formatQuantity, type FormatLocale } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { useRevealInput } from '@/shared/lib/keyboard'
import { lineAmount } from '@/shared/lib/line-amount'
import { formatMoneyInput } from '@/shared/lib/money-input'
import { confirmAction } from '@/shared/lib/native-confirm'
import { round6 } from '@/shared/lib/round'
import { baseOfUnits, unitConversionNote, unitOptionHint } from '@/shared/lib/unit-conversion'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useDiscardGuard } from '@/shared/lib/useDiscardGuard'
import { useTheme } from '@/shared/theme/useTheme'
import { ChoiceCard, SheetScaffold, Text } from '@/shared/ui'
import {
  ActionRow,
  FormGroup,
  FormInfoRow,
  KeyboardDoneBar,
  MoneyField,
  QuantityStepper,
  UnitChip,
} from '@/shared/ui/compose'

import { BatchPicker } from './BatchPicker'
import {
  NOTE_MAX_LENGTH,
  priceToText,
  quantityToText,
  readPrice,
  readQuantity,
  unitsOf,
} from './line-fields'

/** Khoảng chừa phía trên khối được cuộn tới (`?focus=`). */
const FOCUS_TOP_GAP = 12
/** `nativeID` thanh "Xong" trên bàn phím số iOS của sheet (khác thanh của bước 2 nằm bên dưới). */
const QTY_BAR = 'export-line-sheet-qty'
const PRICE_BAR = 'export-line-sheet-price'
/**
 * Ô đơn giá ngăn nghìn khi gõ nhưng KHÔNG cắt số lẻ thừa: ✓ báo "tối đa 2 chữ số thập phân" thay vì âm
 * thầm bỏ chữ người dùng vừa gõ.
 */
const PRICE_TYPING_DECIMALS = Number.POSITIVE_INFINITY

/**
 * Route `/export-line?key=&focus=lot|note|quantity` — sheet SỬA một dòng của phiếu xuất đang lập (spec wizard-apple
 * §7, mockup `apple-rows-v3` A màn 2); dòng lấy từ bản nháp theo param `key`. Đóng đúng MỘT lần: ghi xong
 * đổi khoá dòng (đổi lô / đơn vị) hay xoá dòng làm `line` biến mất ngay, khi đó hiệu ứng "dòng không còn"
 * không được `back()` thêm một màn nữa.
 */
export function ExportLineSheetScreen() {
  const { key, focus } = useLocalSearchParams<{ key?: string; focus?: string }>()
  const closeSheet = useCloseSheet()
  const draft = useExportDraft((s) => s.draft)
  const line = draft?.lines.find((l) => l.key === key)

  const closed = useRef(false)
  const close = () => {
    if (closed.current) return
    closed.current = true
    closeSheet()
  }

  // Không còn dòng (bản nháp biến mất sau khi phiên đổi, key lạ) → không có gì để sửa.
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
      focus={focus === 'lot' || focus === 'note' || focus === 'quantity' ? focus : null}
    />
  )
}

type Lot = { slug: string | null; expiry: string | null; entry: string | null }

/** Chữ khác lúc mở mà không phải cùng giá trị (vd gõ "12" rồi trả về "10") → đã sửa. */
const changedNumber = (
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

/**
 * Thân sheet: thẻ "Số lượng" [nhãn + chip "<đv> ▾"][stepper to]; khối [Đơn giá `MoneyField`][Thành tiền theo
 * chữ đang gõ]; khối [Lô → bung `BatchPicker`][Ghi chú][Xoá khỏi phiếu]. Mọi ô là state CỤC BỘ (gõ không
 * ghi gì); ✓ chỉ chặn chữ SAI rồi ghi MỘT lần `updateLine` (số trống = 0, giá trống = `null`) và đóng; đổi
 * đơn vị / lô trùng dòng khác → lỗi tại ô, không đóng. Đã sửa mà rời (✕, vuốt xuống, back Android) → hỏi
 * "Bỏ thay đổi?" (`useDiscardGuard`). Đang `saving` → chỉ đọc.
 */
function LineSheet({
  line,
  close,
  focus,
}: {
  line: ExportLine
  close: () => void
  /** `quantity` = dòng vừa thêm / vừa quét (bước 2 tự mở sheet): focus ô số, không cuộn. */
  focus: 'lot' | 'note' | 'quantity' | null
}) {
  const { t, i18n } = useTranslation(['exportForms', 'common'])
  const { colors } = useTheme()
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'
  const decimalSep = locale === 'vi' ? ',' : '.'
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  // Đang Lưu / Gửi duyệt: kết quả sẽ thay bản nháp → sheet chỉ đọc, không ghi gì (store cũng chặn).
  const saving = useExportDraft((s) => s.saving)
  const reveal = useRevealInput()

  const inventory = useInventory(warehouseSlug)
  const stock = inventory.data?.find((i) => i.materialSlug === line.materialSlug)
  // Chưa có tồn (đang tải / lỗi): chỉ còn đơn vị hiện tại, không đổi đơn vị được.
  const units = useMemo(() => {
    const all = stock ? unitsOf(stock) : []
    return all.some((u) => u.unitSlug === line.unitSlug)
      ? all
      : [
          {
            unitSlug: line.unitSlug,
            unitCode: line.unitName,
            unitName: line.unitName,
            conversionRate: line.conversionRate,
            isBaseUnit: line.conversionRate === 1,
          },
          ...all,
        ]
  }, [stock, line.unitSlug, line.unitName, line.conversionRate])
  const chipUnits = useMemo(() => {
    const base = baseOfUnits(units)
    return units.map((u) => ({
      slug: u.unitSlug,
      name: u.unitName,
      hint: unitOptionHint(u, base, locale),
    }))
  }, [units, locale])
  // Cùng query với `BatchPicker` (cache chung): ngày nhập cho nhãn lô của dòng khi chưa bung danh sách.
  const batches = useMaterialBatches(warehouseSlug, line.materialSlug)

  // Dòng lúc mở sheet: so để biết đã sửa chưa.
  const [opened] = useState(() => ({
    line,
    qtyText: quantityToText(line.quantity, decimalSep),
    priceText: priceToText(line.unitPrice, locale),
  }))
  const [qtyText, setQtyText] = useState(opened.qtyText)
  const [priceText, setPriceText] = useState(opened.priceText)
  const [unitSlug, setUnitSlug] = useState(line.unitSlug)
  const [lot, setLot] = useState<Lot>({
    slug: line.batchSlug,
    expiry: line.batchExpiryDate,
    entry: null,
  })
  const [note, setNote] = useState(line.note ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [duplicate, setDuplicate] = useState<'unit' | 'lot' | null>(null)
  const [lotOpen, setLotOpen] = useState(focus === 'lot')
  // Android hơn 3 đơn vị: Alert của chip không đủ nút → bung danh sách đơn vị ngay trong sheet.
  const [unitListOpen, setUnitListOpen] = useState(false)
  // ✓ ghi xong / xoá dòng: sheet đang rời — không hỏi "Bỏ thay đổi?".
  const [leaving, setLeaving] = useState(false)

  const qty = readQuantity(qtyText)
  const price = readPrice(priceText, locale)
  const qtyValue = 'value' in qty ? qty.value : 0
  const noteValue = note.trim() === '' ? null : note
  const dirty =
    !leaving &&
    (changedNumber(qty, qtyText, opened.qtyText, opened.line.quantity) ||
      changedNumber(price, priceText, opened.priceText, opened.line.unitPrice) ||
      unitSlug !== opened.line.unitSlug ||
      lot.slug !== opened.line.batchSlug ||
      noteValue !== (opened.line.note?.trim() ? opened.line.note : null))
  // Chỉ đọc (đang lưu): không chặn rời — như sheet phiếu nhập.
  const { confirmLeave } = useDiscardGuard({ dirty, enabled: !saving })

  const unit = units.find((u) => u.unitSlug === unitSlug)
  const unitName = unit?.unitName ?? line.unitName
  const conversionNote = unitConversionNote({
    units,
    unitSlug,
    quantity: qtyValue,
    locale,
    t: (k, o) => t(k, o),
  })
  const qtyError = submitted && 'error' in qty ? t(`exportForms:line.${qty.error}`) : null
  const priceError = submitted && 'error' in price ? t(`exportForms:line.${price.error}`) : null
  const amount =
    qtyValue > 0 && 'value' in price && price.value !== null
      ? formatMoney(lineAmount(qtyValue, price.value), locale)
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
  const qtyInput = useRef<TextInputInstance | null>(null)
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
    else if (focus === 'quantity' && !saving) qtyInput.current?.focus()
    // Chỉ khi mở sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const step = (delta: 1 | -1) => {
    if (saving) return
    setQtyText((prev) => {
      const r = readQuantity(prev)
      const base = 'value' in r ? r.value : 0
      return quantityToText(round6(Math.max(0, base + delta)), decimalSep)
    })
  }
  const pickUnit = (slug: string) => {
    setUnitListOpen(false)
    if (saving || slug === unitSlug) return
    haptics.selection()
    setUnitSlug(slug)
    setDuplicate(null)
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
    if ('error' in qty || 'error' in price || !unit) {
      haptics.error()
      return
    }
    // Đổi đơn vị cũng là `updateLine` tại chỗ (giữ vị trí + `base`); đổi đơn vị / lô mà trùng dòng khác
    // thì store từ chối và không ghi gì.
    const result = store.updateLine(line.key, {
      quantity: qty.value,
      unitPrice: price.value,
      unitSlug: unit.unitSlug,
      unitName: unit.unitName,
      conversionRate: unit.conversionRate,
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
    if (result.reason === 'duplicate') setDuplicate(lot.slug === line.batchSlug ? 'unit' : 'lot')
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
  /** "−" ở số ≤ 1 (spec §7: − về 0 → hỏi xoá dòng) — luôn hỏi, kể cả dòng mới thêm trên máy. */
  const requestRemove = async () => {
    if (useExportDraft.getState().saving) return
    const ok = await confirmAction({
      title: t('exportForms:wizard.removeTitle', { name: line.materialName }),
      confirmLabel: t('common:compose.delete'),
      cancelLabel: t('common:cancel'),
      destructive: true,
    })
    if (ok) removeNow()
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
        <FormGroup
          title={t('common:compose.group.quantity')}
          footer={conversionNote ?? undefined}
          footerNumeric
          errors={[qtyError, duplicate === 'unit' ? duplicateText : null]}
        >
          <FormInfoRow kind="custom" first label={t('exportForms:line.unit')}>
            <UnitChip
              variant="value"
              title={line.materialName}
              current={{ slug: unitSlug, name: unitName }}
              units={chipUnits}
              disabled={saving}
              onPick={pickUnit}
              onAndroidOverflow={() => setUnitListOpen(true)}
            />
          </FormInfoRow>
          <FormInfoRow kind="custom" label={t('exportForms:line.quantity')}>
            <QuantityStepper
              variant="ios"
              testID="export-line-sheet-qty"
              inputRef={qtyInput}
              text={qtyText}
              onChangeText={(s) => {
                if (!saving) setQtyText(s)
              }}
              onFocus={() => {
                if (reveal && qtyInput.current) reveal(qtyInput.current)
              }}
              onStep={step}
              onRequestRemove={() => void requestRemove()}
              // Chữ không đọc được: "−" bắt đầu lại từ 0 như "+" — không hỏi xoá dòng.
              value={'value' in qty ? qty.value : Number.POSITIVE_INFINITY}
              missing={qtyValue <= 0 && !qtyError}
              disabled={saving}
              unitLabel={unitName}
              accessibilityLabel={t('common:compose.qty.a11y', { name: line.materialName })}
              inputAccessoryViewID={QTY_BAR}
            />
          </FormInfoRow>
        </FormGroup>

        {unitListOpen ? (
          <View testID="export-line-units" style={{ gap: 8 }}>
            <Text weight="semibold" size={12.5} style={{ marginLeft: 2, color: colors.fieldLabel }}>
              {t('exportForms:line.unit')}
            </Text>
            {units.map((u) => (
              <ChoiceCard
                key={u.unitSlug}
                title={u.unitName}
                subtitle={
                  u.isBaseUnit
                    ? t('exportForms:addLine.baseUnit')
                    : t('exportForms:addLine.rate', {
                        unit: u.unitName,
                        rate: formatQuantity(u.conversionRate, locale, 6),
                        base: stock?.baseUnit?.name ?? '',
                      })
                }
                selected={u.unitSlug === unitSlug}
                onPress={() => pickUnit(u.unitSlug)}
              />
            ))}
          </View>
        ) : null}

        <FormGroup title={t('common:compose.group.price')} errors={[priceError]}>
          <FormInfoRow kind="custom" first label={t('exportForms:line.unitPrice')}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <MoneyField
                variant="plain"
                testID="export-line-sheet-price"
                inputRef={priceInput}
                value={priceText}
                onChangeText={(typed) => {
                  if (!saving) setPriceText(formatMoneyInput(typed, locale, PRICE_TYPING_DECIMALS))
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
        nativeID={QTY_BAR}
        label={t('exportForms:wizard.qtyBar', { unit: unitName })}
      />
      <KeyboardDoneBar
        nativeID={PRICE_BAR}
        label={t('exportForms:wizard.priceBar', { unit: unitName })}
      />
    </SheetScaffold>
  )
}
