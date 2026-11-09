import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Platform,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from 'react-native'

import type { AvailableUnit } from '@/entities/import-form'
import { round6, useReceiveDraft, type LocalLine } from '@/features/receive-checklist'
import { formatFullDate, formatMoney, formatQuantity, type FormatLocale } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { useRevealInput } from '@/shared/lib/keyboard'
import { lineAmount } from '@/shared/lib/line-amount'
import { formatMoneyInput } from '@/shared/lib/money-input'
import { confirmAction } from '@/shared/lib/native-confirm'
import { baseOfUnits, unitConversionNote, unitOptionHint } from '@/shared/lib/unit-conversion'
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

import {
  numText as quantityToText,
  parsePrice,
  priceText as priceToText,
  quantityErrorKey,
  readQuantity,
} from './import-line-input'
import { ExpiryRow } from './ExpiryRow'
import { useImportLineUnits } from './useImportLineUnits'
import { formatQty, NOTE_MAX_LENGTH, useExpiryField, useLineAccess } from './receive-line-shared'

/** Khoảng chừa phía trên khối được cuộn tới (`?focus=`). */
const FOCUS_TOP_GAP = 12

/** `nativeID` thanh "Xong" trên bàn phím số iOS của sheet soạn (khác thanh của bước 2 nằm bên dưới). */
const QTY_BAR = 'import-line-sheet-qty'
const PRICE_BAR = 'import-line-sheet-price'
/**
 * Ô đơn giá của sheet ngăn nghìn khi gõ nhưng KHÔNG cắt số lẻ thừa: ✓ báo "tối đa 2 chữ số thập phân" thay
 * vì âm thầm bỏ chữ người dùng vừa gõ (như `/export-line`).
 */
const PRICE_TYPING_DECIMALS = Number.POSITIVE_INFINITY

/** Chữ khác lúc mở mà không phải cùng giá trị (vd gõ "12" rồi trả về "6") → đã sửa. */
const changedNumber = (
  read: { value: number } | { error: string },
  text: string,
  openedText: string,
  openedValue: number,
) => text !== openedText && ('error' in read || round6(read.value) !== round6(openedValue))

/**
 * Thân soạn (`compose=1`, bước 2 Vật tư) — sheet sửa dòng kiểu Apple, cùng khuôn `/export-line` (spec
 * wizard-apple §7): thẻ "Số lượng" [nhãn + chip "<đv> ▾"][stepper to]; khối [Đơn giá `MoneyField`][Thành
 * tiền theo chữ đang gõ]; khối [Hạn dùng → lịch][Ghi chú][Xoá khỏi phiếu]. Mọi ô là state CỤC BỘ (gõ không
 * ghi gì); ✓ chỉ chặn chữ SAI rồi ghi MỘT lần `updateLine(…, { check: false })` (số trống = 0, giá trống =
 * 0 đ — giá nhập tuỳ chọn; dấu đã kiểm của checklist giữ nguyên) và đóng; đổi đơn vị trùng dòng khác → lỗi
 * tại thẻ, không đóng. Đã sửa mà rời (✕, vuốt xuống, back Android) → hỏi "Bỏ thay đổi?"
 * (`useDiscardGuard`). Sheet TỰ KIỂM quyền (mở thẳng / mất quyền): không sửa được → chỉ đọc; đang
 * `saving` → mọi ô khoá.
 */
export function ComposeLineSheet({
  line,
  formDate,
  focus,
  close,
}: {
  line: LocalLine
  formDate: string
  /**
   * Khối mở sẵn khi vào (`?focus=`, từ dòng ở bước 2); `quantity` = dòng vừa thêm / vừa quét (bước 2 tự
   * mở sheet): focus ô số, không cuộn.
   */
  focus: 'expiry' | 'note' | 'quantity' | null
  close: () => void
}) {
  const { t, i18n } = useTranslation(['importForms', 'common'])
  const { colors, radius } = useTheme()
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'
  const decimalSep = locale === 'vi' ? ',' : '.'
  const reveal = useRevealInput()

  const { abilities, waiting, saving, warehouseSlug } = useLineAccess()
  // Phiếu mới: IMPORT_FORM_CREATE; phiếu có: `canEdit`. Chưa biết quyền (đang tải / tải lỗi) → không sửa.
  const allowed = !!abilities?.canEdit
  const editable = allowed && !saving

  // Đơn vị: snapshot của dòng, hoặc tải lười (`available-materials`); không được tải (thiếu
  // IMPORT_FORM_CREATE, dòng không có snapshot) → chỉ đơn vị hiện tại, không gọi API.
  const lineUnits = useImportLineUnits(line, warehouseSlug)
  const { units, load: loadUnits, canLoad: canLoadUnits } = lineUnits
  const [unitsFailed, setUnitsFailed] = useState(false)
  useEffect(() => {
    if (!canLoadUnits) return
    let alive = true
    void loadUnits().then((u) => {
      if (alive && !u) setUnitsFailed(true)
    })
    return () => {
      alive = false
    }
  }, [canLoadUnits, loadUnits])
  const toOptions = (list: AvailableUnit[]) => {
    const base = baseOfUnits(list)
    return list.map((u) => ({
      slug: u.unitSlug,
      name: u.unitName,
      hint: unitOptionHint(u, base, locale),
    }))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chipUnits = useMemo(() => (units ? toOptions(units) : null), [units, locale])
  const chipLoad =
    units || !canLoadUnits || unitsFailed
      ? undefined
      : async () => {
          const loaded = await loadUnits()
          if (!loaded) setUnitsFailed(true)
          return loaded ? toOptions(loaded) : null
        }

  // Dòng lúc mở sheet: so để biết đã sửa chưa.
  const [opened] = useState(() => ({
    line,
    qtyText: quantityToText(line.quantity, decimalSep),
    priceText: priceToText(line.unitPrice, locale),
  }))
  const [qtyText, setQtyText] = useState(opened.qtyText)
  const [priceText, setPriceText] = useState(opened.priceText)
  const [unitSlug, setUnitSlug] = useState(line.unitSlug)
  const exp = useExpiryField(line.expiryDate, formDate, focus === 'expiry')
  const [note, setNote] = useState(line.note ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [duplicate, setDuplicate] = useState(false)
  // Android hơn 3 đơn vị: Alert của chip không đủ nút → bung danh sách đơn vị ngay trong sheet.
  const [unitListOpen, setUnitListOpen] = useState(false)
  // ✓ ghi xong / xoá dòng: sheet đang rời — không hỏi "Bỏ thay đổi?".
  const [leaving, setLeaving] = useState(false)

  const qty = readQuantity(qtyText)
  const price = parsePrice(priceText, locale)
  const qtyValue = 'value' in qty ? qty.value : null
  const priceValue = 'value' in price ? price.value : null
  const noteValue = note.trim() === '' ? null : note
  const dirty =
    !leaving &&
    (changedNumber(qty, qtyText, opened.qtyText, opened.line.quantity) ||
      changedNumber(price, priceText, opened.priceText, opened.line.unitPrice) ||
      unitSlug !== opened.line.unitSlug ||
      exp.expiry !== opened.line.expiryDate ||
      noteValue !== (opened.line.note?.trim() ? opened.line.note : null))
  const { confirmLeave } = useDiscardGuard({ dirty, enabled: editable })

  const conversionNote = units
    ? unitConversionNote({
        units,
        unitSlug,
        quantity: qtyValue,
        locale,
        t: (k, o) => t(k, o),
      })
    : null
  const unitName = units?.find((u) => u.unitSlug === unitSlug)?.unitName ?? line.unitName
  const qtyError =
    submitted && 'error' in qty ? t(`importForms:${quantityErrorKey(qty.error)}`) : null
  const priceError = submitted && 'error' in price ? t(`importForms:${price.error}`) : null
  const amount =
    qtyValue !== null && qtyValue > 0 && priceValue !== null
      ? formatMoney(lineAmount(qtyValue, priceValue), locale)
      : '—'

  // `?focus=`: cuộn tới khối HSD / ô ghi chú (một lần; vị trí = khối + ô trong khối, đo bằng onLayout);
  // HSD thì mở lịch, ghi chú thì focus ô — MỘT lần, khi các ô đã hiện (phiếu tải xong, sửa được).
  const scrollRef = useRef<ScrollViewInstance>(null)
  const noteInput = useRef<TextInputInstance | null>(null)
  const qtyInput = useRef<TextInputInstance | null>(null)
  const priceInput = useRef<TextInputInstance | null>(null)
  const layout = useRef<{ details?: number; note?: number }>({})
  const scrolled = useRef(false)
  const measured = (part: 'details' | 'note', y: number) => {
    layout.current[part] = y
    const { details, note: noteY } = layout.current
    if ((focus !== 'expiry' && focus !== 'note') || scrolled.current || details === undefined)
      return
    if (focus === 'note' && noteY === undefined) return
    scrolled.current = true
    const target = details + (focus === 'note' ? noteY! : 0)
    scrollRef.current?.scrollTo({ y: Math.max(0, target - FOCUS_TOP_GAP), animated: true })
  }
  const focused = useRef(false)
  useEffect(() => {
    if (!focus || !editable || focused.current) return
    focused.current = true
    if (focus === 'note') noteInput.current?.focus()
    else if (focus === 'quantity') qtyInput.current?.focus()
    else if (Platform.OS === 'android') exp.openAndroidPicker()
    // Chỉ một lần, khi các ô vừa hiện.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, editable])

  const step = (delta: 1 | -1) => {
    if (!editable) return
    // Chữ sai bắt đầu lại từ 0 (cả "+" lẫn "−").
    setQtyText((prev) => {
      const r = readQuantity(prev)
      const base = 'value' in r ? r.value : 0
      return quantityToText(round6(Math.max(0, base + delta)), decimalSep)
    })
  }
  const pickUnit = (slug: string) => {
    setUnitListOpen(false)
    if (!editable || slug === unitSlug) return
    haptics.selection()
    setUnitSlug(slug)
    setDuplicate(false)
  }

  const submit = () => {
    const store = useReceiveDraft.getState()
    if (store.saving || !allowed) return
    setSubmitted(true)
    if ('error' in qty || 'error' in price) {
      haptics.error()
      return
    }
    // Đổi đơn vị = `updateLine` tại chỗ (giữ vị trí + `base`, khoá tính lại); trùng dòng khác thì store
    // từ chối và không ghi gì.
    const unit =
      unitSlug !== line.unitSlug ? units?.find((u) => u.unitSlug === unitSlug) : undefined
    const result = store.updateLine(
      line.key,
      {
        quantity: qty.value,
        unitPrice: price.value,
        expiryDate: exp.expiry,
        note: noteValue,
        ...(unit && units ? { unitSlug: unit.unitSlug, unitName: unit.unitName, units } : {}),
      },
      { check: false },
    )
    if (result.ok) {
      haptics.success()
      setLeaving(true)
      close()
      return
    }
    if (result.reason === 'duplicate') setDuplicate(true)
    haptics.error()
  }

  const cancel = async () => {
    if (await confirmLeave()) close()
  }

  const removeNow = () => {
    if (useReceiveDraft.getState().saving) return
    setLeaving(true)
    useReceiveDraft.getState().removeLine(line.key)
    close()
  }
  /** "Xoá khỏi phiếu": dòng có sẵn trên server → hỏi lại; dòng mới thêm trên máy → bỏ ngay. */
  const remove = async () => {
    if (!allowed || useReceiveDraft.getState().saving) return
    if (line.base) {
      const ok = await confirmAction({
        title: t('importForms:compose.line.removeTitle'),
        message: t('importForms:compose.line.removeMessage', { name: line.materialName }),
        confirmLabel: t('importForms:compose.line.remove'),
        cancelLabel: t('common:cancel'),
        destructive: true,
      })
      if (!ok) return
    }
    removeNow()
  }
  /** "−" ở số ≤ 1 (spec §7: − về 0 → hỏi xoá dòng) — luôn hỏi, như `/export-line`. */
  const requestRemove = async () => {
    if (!allowed || useReceiveDraft.getState().saving) return
    const ok = await confirmAction({
      title: t('importForms:wizard.removeTitle', { name: line.materialName }),
      confirmLabel: t('common:compose.delete'),
      cancelLabel: t('common:cancel'),
      destructive: true,
    })
    if (ok) removeNow()
  }

  const block = {
    backgroundColor: colors.card,
    borderRadius: radius.groupLarge,
    overflow: 'hidden',
  } as const
  const removeRow = (
    <ActionRow
      label={t('importForms:compose.line.remove')}
      color={colors.destructive}
      disabled={!editable}
      onPress={() => void remove()}
    />
  )

  const body = waiting ? (
    <ActivityIndicator color={colors.mutedForeground} />
  ) : !allowed ? (
    <View style={{ gap: 12 }}>
      <Text muted size={13}>
        {t('importForms:compose.line.readOnly')}
      </Text>
      <View style={block}>
        <FormInfoRow
          kind="readonly"
          first
          label={t('importForms:compose.line.quantity')}
          value={`${formatQty(line.quantity, locale)} ${line.unitName}`}
        />
        <FormInfoRow
          kind="readonly"
          label={t('importForms:compose.line.unitPrice')}
          value={formatMoney(line.unitPrice, locale)}
        />
        <FormInfoRow
          kind="readonly"
          label={t('importForms:receive.line.expiry')}
          value={line.expiryDate ? formatFullDate(line.expiryDate) : '—'}
        />
        {line.note ? (
          <FormInfoRow
            kind="readonly"
            label={t('importForms:receive.line.note')}
            value={line.note}
          />
        ) : null}
        {removeRow}
      </View>
    </View>
  ) : (
    <View style={{ gap: 12 }}>
      <FormGroup
        title={t('common:compose.group.quantity')}
        footer={conversionNote ?? undefined}
        footerNumeric
        errors={[
          qtyError,
          duplicate ? t('importForms:compose.line.duplicate') : null,
          unitsFailed ? t('importForms:compose.line.unitsFailed') : null,
        ]}
      >
        <FormInfoRow kind="custom" first label={t('importForms:compose.line.unit')}>
          <UnitChip
            variant="value"
            title={line.materialName}
            current={{ slug: unitSlug, name: unitName }}
            units={chipUnits}
            loadUnits={chipLoad}
            disabled={!editable}
            onPick={pickUnit}
            onAndroidOverflow={() => setUnitListOpen(true)}
          />
        </FormInfoRow>
        <FormInfoRow kind="custom" label={t('importForms:compose.line.quantity')}>
          <QuantityStepper
            variant="ios"
            testID="import-line-sheet-qty"
            inputRef={qtyInput}
            text={qtyText}
            onChangeText={(s) => {
              if (editable) setQtyText(s)
            }}
            onFocus={() => {
              if (reveal && qtyInput.current) reveal(qtyInput.current)
            }}
            onStep={step}
            onRequestRemove={() => void requestRemove()}
            // Chữ không đọc được: "−" bắt đầu lại từ 0 như "+" — không hỏi xoá dòng.
            value={qtyValue ?? Number.POSITIVE_INFINITY}
            missing={qtyValue === 0}
            disabled={!editable}
            unitLabel={unitName}
            accessibilityLabel={t('common:compose.qty.a11y', { name: line.materialName })}
            inputAccessoryViewID={QTY_BAR}
          />
        </FormInfoRow>
      </FormGroup>

      {unitListOpen && units ? (
        <View testID="import-line-units" style={{ gap: 8 }}>
          <Text weight="semibold" size={12.5} style={{ marginLeft: 2, color: colors.fieldLabel }}>
            {t('importForms:compose.line.unit')}
          </Text>
          {units.map((u) => {
            const base = units.find((b) => b.isBaseUnit)
            return (
              <ChoiceCard
                key={u.unitSlug}
                title={u.unitName}
                subtitle={
                  u.isBaseUnit || !base
                    ? t('importForms:addLine.baseUnit')
                    : t('importForms:addLine.rate', {
                        unit: u.unitName,
                        rate: formatQuantity(u.conversionRate, locale, 6),
                        base: base.unitName,
                      })
                }
                selected={u.unitSlug === unitSlug}
                onPress={() => pickUnit(u.unitSlug)}
              />
            )
          })}
        </View>
      ) : null}

      <FormGroup title={t('common:compose.group.price')} errors={[priceError]}>
        <FormInfoRow kind="custom" first label={t('importForms:compose.line.unitPrice')}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <MoneyField
              variant="plain"
              testID="import-line-sheet-price"
              inputRef={priceInput}
              value={priceText}
              onChangeText={(typed) => {
                if (editable) setPriceText(formatMoneyInput(typed, locale, PRICE_TYPING_DECIMALS))
              }}
              onFocus={() => {
                if (reveal && priceInput.current) reveal(priceInput.current)
              }}
              unitLabel={unitName}
              // Giá nhập TUỲ CHỌN: trống / 0 đ là mờ, không bao giờ cam "thiếu".
              state={priceValue === 0 ? 'muted' : 'normal'}
              placeholder={t('importForms:wizard.noPrice')}
              accessibilityLabel={t('importForms:compose.line.unitPrice')}
              inputAccessoryViewID={PRICE_BAR}
              editable={editable}
            />
          </View>
        </FormInfoRow>
        <FormInfoRow
          kind="readonly"
          testID="import-line-sheet-amount"
          label={t('importForms:compose.line.amount')}
          value={amount}
        />
      </FormGroup>

      <FormGroup
        testID="import-line-details"
        title={t('common:compose.group.details')}
        footer={editable ? t('importForms:compose.line.expiryFooter') : undefined}
        onLayout={(e) => measured('details', e.nativeEvent.layout.y)}
      >
        <ExpiryRow
          testID="import-line-sheet-expiry"
          exp={exp}
          editable={editable}
          error={exp.expiryError ? t('importForms:expiryBeforeDate') : null}
        />
        <View
          testID="import-line-note-section"
          onLayout={(e) => measured('note', e.nativeEvent.layout.y)}
        >
          <FormInfoRow
            kind="input"
            testID="import-line-sheet-note"
            label={t('importForms:receive.line.note')}
            value={note}
            onChangeText={setNote}
            maxLength={NOTE_MAX_LENGTH}
            editable={editable}
            inputRef={noteInput}
          />
        </View>
      </FormGroup>

      <FormGroup>
        <ActionRow
          variant="centered"
          label={t('importForms:compose.line.remove')}
          color={colors.destructiveText}
          disabled={!editable}
          onPress={() => void remove()}
        />
      </FormGroup>
    </View>
  )

  return (
    <SheetScaffold
      testID="receive-line-sheet"
      title={line.materialName}
      cancelLabel={t('common:close')}
      onCancel={() => void cancel()}
      doneLabel={editable ? t('common:save') : undefined}
      onDone={editable ? submit : undefined}
      footer={saving ? t('importForms:receive.line.savingNote') : undefined}
      scrollRef={scrollRef}
      grouped
    >
      {body}
      <KeyboardDoneBar
        nativeID={QTY_BAR}
        label={t('importForms:wizard.qtyBar', { unit: unitName })}
      />
      <KeyboardDoneBar
        nativeID={PRICE_BAR}
        label={t('importForms:wizard.priceBar', { unit: unitName })}
      />
    </SheetScaffold>
  )
}
