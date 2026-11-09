import DateTimePicker from '@react-native-community/datetimepicker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Platform, Pressable, View } from 'react-native'

import { receiveMode } from '@/entities/import-form'
import {
  RECEIVE_CHECKLIST_ENABLED,
  round6,
  useReceiveDraft,
  type LocalLine,
} from '@/features/receive-checklist'
import {
  formatMoney,
  formatFullDate,
  parseDecimalInput,
  type FormatLocale,
} from '@/shared/lib/format'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { numericStyle } from '@/shared/theme/fonts'
import { useTheme } from '@/shared/theme/useTheme'
import { Button, FormField, SheetScaffold, Text } from '@/shared/ui'

import { ComposeLineSheet } from './ComposeLineSheet'
import { formatQty, NOTE_MAX_LENGTH, useExpiryField, useLineAccess } from './receive-line-shared'

type QtyCheck = { value: number; error: null } | { value: null; error: 'invalidQty' | 'scaleQty' }

/** Ô "Thực nhận" của checklist (không đổi). */
function checkQuantity(text: string): QtyCheck {
  const v = parseDecimalInput(text, 6)
  if (v !== null) return { value: v, error: null }
  // Đọc được nếu bỏ giới hạn số lẻ → lỗi duy nhất là quá 6 chữ số thập phân.
  return { value: null, error: parseDecimalInput(text, 99) !== null ? 'scaleQty' : 'invalidQty' }
}

/**
 * Route `/import-line`: sheet sửa một dòng của phiếu nhập; dòng lấy từ bản nháp theo param `key`. Hai thân:
 * - Checklist Kiểm hàng (không `compose`, `ChecklistLineSheet`): giữ nguyên bố cục cũ — "Phiếu ghi" /
 *   "Thực nhận" / HSD / ghi chú, nút "Lưu · sang dòng chưa kiểm tiếp", không sửa được thì "Đánh dấu đã
 *   kiểm"; không xác nhận được → chỉ xem, không nút.
 * - Soạn (`compose=1`, bước 2 Vật tư, `ComposeLineSheet`): sheet sửa dòng kiểu Apple (spec wizard-apple §7).
 * Đóng đúng MỘT lần: ghi xong đổi khoá dòng (đổi đơn vị) hay xoá dòng làm `line` biến mất ngay, khi đó
 * hiệu ứng "dòng không còn" không được `back()` thêm một màn nữa.
 */
export function ReceiveLineSheetScreen() {
  const { key, compose, focus } = useLocalSearchParams<{
    key?: string
    compose?: string
    focus?: string
  }>()
  const closeSheet = useCloseSheet()
  const draft = useReceiveDraft((s) => s.draft)
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

  if (!draft || !line) return null
  return compose === '1' ? (
    <ComposeLineSheet
      key={line.key}
      line={line}
      formDate={draft.header.date}
      focus={focus === 'expiry' || focus === 'note' || focus === 'quantity' ? focus : null}
      close={close}
    />
  ) : (
    <ChecklistLineSheet key={line.key} line={line} formDate={draft.header.date} close={close} />
  )
}

/**
 * Thân checklist Kiểm hàng (`receiveMode` 'check'): nút "Lưu · sang dòng chưa kiểm tiếp", không sửa được
 * thì "Đánh dấu đã kiểm". Cờ `RECEIVE_CHECKLIST_ENABLED` tắt: chỉ ✓ trên header (lưu + đóng, không đặt
 * `checked`), không hai nút trên, không câu "chỉ đánh dấu được". Không xác nhận được (chỉ xem; người chỉ sửa được sửa ở màn soạn `compose=1`,
 * hoặc phiếu vừa thôi Nháp): chỉ xem, không nút.
 */
function ChecklistLineSheet({
  line,
  formDate,
  close,
}: {
  line: LocalLine
  formDate: string
  close: () => void
}) {
  const { t, i18n } = useTranslation(['importForms', 'common'])
  const { colors } = useTheme()
  const router = useRouter()
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'
  const decimalSep = locale === 'vi' ? ',' : '.'

  const { abilities, waiting, saving } = useLineAccess()
  // Chưa biết quyền (phiếu đang tải / tải lỗi) → như checklist cũ; chỉ khi đã rõ là không xác nhận được
  // mới bỏ phần đánh dấu.
  const checklist = !abilities || receiveMode(abilities) === 'check'
  // Ngoài màn soạn chỉ checklist mới sửa (người chỉ sửa được dùng màn soạn). Đang lưu → chỉ đọc.
  const allowed = !!abilities?.canEdit && checklist
  const canEdit = !saving && allowed

  const [qtyText, setQtyText] = useState(() => String(line.quantity).replace('.', decimalSep))
  const exp = useExpiryField(line.expiryDate, formDate, false)
  const expiry = exp.expiry
  const [note, setNote] = useState(line.note ?? '')

  const qty = checkQuantity(qtyText)
  const base = line.base?.quantity ?? null
  const delta = qty.value !== null && base !== null ? round6(qty.value - base) : 0

  /** Dòng chưa kiểm kế tiếp SAU dòng này theo thứ tự trong phiếu, vòng về đầu; hết → null. */
  const nextUncheckedKey = (): string | null => {
    const lines = useReceiveDraft.getState().draft?.lines ?? []
    const at = lines.findIndex((l) => l.key === line.key)
    const after = [...lines.slice(at + 1), ...lines.slice(0, Math.max(at, 0))]
    return after.find((l) => !l.checked)?.key ?? null
  }
  const goNext = () => {
    const next = nextUncheckedKey()
    if (next) router.setParams({ key: next })
    else close()
  }

  const commit = (): boolean => {
    if (saving) return false
    if (!canEdit) {
      // Cờ tắt: không có gì để ghi, và tuyệt đối không đặt `checked`.
      if (RECEIVE_CHECKLIST_ENABLED) useReceiveDraft.getState().updateLine(line.key, {})
      return true
    }
    if (qty.value === null) return false
    useReceiveDraft.getState().updateLine(
      line.key,
      {
        quantity: qty.value,
        expiryDate: expiry,
        note: note.trim() === '' ? null : note,
      },
      // Cờ tắt ("Duyệt phiếu"): chỉ lưu số, không đánh dấu đã kiểm.
      { check: RECEIVE_CHECKLIST_ENABLED },
    )
    return true
  }
  const saveNext = () => {
    if (!RECEIVE_CHECKLIST_ENABLED) return saveClose()
    if (commit()) goNext()
  }
  const saveClose = () => {
    if (commit()) close()
  }

  const zero = qty.value === 0
  const short = !zero && delta < 0
  const over = delta > 0
  const tint = zero ? colors.destructiveSoft : short || over ? colors.warningSoft : undefined
  const hint = zero
    ? { text: t('importForms:receive.line.zero'), color: colors.destructiveText }
    : short
      ? {
          text: t('importForms:receive.line.short', {
            n: formatQty(-delta, locale),
            unit: line.unitName,
          }),
          color: colors.warningText,
        }
      : over
        ? {
            text: t('importForms:receive.line.over', {
              n: formatQty(delta, locale),
              unit: line.unitName,
            }),
            color: colors.warningText,
          }
        : null

  const planText = base === null ? t('importForms:receive.line.noPlan') : formatQty(base, locale)
  const price = formatMoney(line.unitPrice, locale)

  return (
    <SheetScaffold
      testID="receive-line-sheet"
      title={line.materialName}
      cancelLabel={t('common:close')}
      onCancel={close}
      doneLabel={canEdit ? t('common:save') : undefined}
      onDone={canEdit ? saveClose : undefined}
      footer={
        saving
          ? t('importForms:receive.line.savingNote')
          : !canEdit && checklist && RECEIVE_CHECKLIST_ENABLED
            ? t('importForms:receive.line.readOnlyNote')
            : undefined
      }
    >
      <View style={{ gap: 16 }}>
        <Text muted size={13} numberOfLines={1}>
          <Text code muted size={13}>
            {line.materialCode}
          </Text>
          {` · ${t('importForms:receive.line.unitPrice', { price, unit: line.unitName })}`}
        </Text>
        {waiting ? (
          <ActivityIndicator color={colors.mutedForeground} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text
                  weight="semibold"
                  size={12.5}
                  style={{ marginLeft: 2, color: colors.fieldLabel }}
                >
                  {t('importForms:receive.line.plan')}
                </Text>
                <ReadOnlyBox
                  numeric
                  label={t('importForms:receive.line.plan')}
                  value={`${planText} ${line.unitName}`}
                />
              </View>
              <View style={{ flex: 1 }}>
                {canEdit ? (
                  <View style={{ borderRadius: 14, backgroundColor: tint }}>
                    <FormField
                      label={t('importForms:receive.line.actual')}
                      value={qtyText}
                      onChangeText={setQtyText}
                      error={qty.error ? t(`importForms:receive.line.${qty.error}`) : undefined}
                      keyboardType="decimal-pad"
                      autoFocus
                      selectTextOnFocus
                      onSubmitEditing={saveNext}
                      style={numericStyle()}
                    />
                  </View>
                ) : (
                  <View style={{ gap: 6 }}>
                    <Text
                      weight="semibold"
                      size={12.5}
                      style={{ marginLeft: 2, color: colors.fieldLabel }}
                    >
                      {t('importForms:receive.line.actual')}
                    </Text>
                    <ReadOnlyBox
                      numeric
                      label={t('importForms:receive.line.actual')}
                      value={`${formatQty(line.quantity, locale)} ${line.unitName}`}
                    />
                  </View>
                )}
              </View>
            </View>
            {hint && canEdit ? (
              <Text weight="medium" size={13} style={{ color: hint.color }}>
                {hint.text}
              </Text>
            ) : null}

            <View style={{ gap: 6 }}>
              <Text
                weight="semibold"
                size={12.5}
                style={{ marginLeft: 2, color: colors.fieldLabel }}
              >
                {t('importForms:receive.line.expiry')}
              </Text>
              {canEdit ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('importForms:receive.line.expiryA11y', {
                      value: expiry
                        ? formatFullDate(expiry)
                        : t('importForms:receive.line.expiryEmpty'),
                    })}
                    accessibilityHint={t('importForms:receive.line.expiryPickHint')}
                    onPress={exp.openPicker}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      justifyContent: 'center',
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: exp.expiryError ? colors.destructive : colors.input,
                    }}
                  >
                    <Text numeric={!!expiry} muted={!expiry}>
                      {expiry ? formatFullDate(expiry) : t('importForms:receive.line.expiryPick')}
                    </Text>
                  </Pressable>
                  {expiry ? (
                    <Button variant="ghost" onPress={exp.clear}>
                      {t('importForms:receive.line.expiryClear')}
                    </Button>
                  ) : null}
                </View>
              ) : (
                <ReadOnlyBox
                  numeric
                  label={t('importForms:receive.line.expiry')}
                  value={line.expiryDate ? formatFullDate(line.expiryDate) : '—'}
                />
              )}
              {exp.picking && canEdit && Platform.OS !== 'android' ? (
                <DateTimePicker
                  testID="date-picker"
                  mode="date"
                  display="inline"
                  value={exp.pickerValue}
                  minimumDate={exp.minimumDate}
                  onValueChange={(_e, date) => exp.applyExpiry(date)}
                />
              ) : null}
              {exp.expiryError ? (
                <Text size={13} accessibilityRole="alert" style={{ color: colors.destructive }}>
                  {t('importForms:expiryBeforeDate')}
                </Text>
              ) : null}
              {canEdit ? (
                <Text muted size={12.5} style={{ marginLeft: 2 }}>
                  {t('importForms:receive.line.expiryHint')}
                </Text>
              ) : null}
            </View>

            {canEdit ? (
              <FormField
                label={t('importForms:receive.line.note')}
                value={note}
                onChangeText={setNote}
                placeholder={t('importForms:receive.line.notePlaceholder')}
                maxLength={NOTE_MAX_LENGTH}
                returnKeyType="done"
              />
            ) : line.note ? (
              <View style={{ gap: 6 }}>
                <Text
                  weight="semibold"
                  size={12.5}
                  style={{ marginLeft: 2, color: colors.fieldLabel }}
                >
                  {t('importForms:receive.line.note')}
                </Text>
                <ReadOnlyBox label={t('importForms:receive.line.note')} value={line.note} />
              </View>
            ) : null}

            {!checklist || !RECEIVE_CHECKLIST_ENABLED ? null : canEdit ? (
              <Button onPress={saveNext}>{t('importForms:receive.line.saveNext')}</Button>
            ) : (
              <Button disabled={saving} onPress={saveNext}>
                {t('importForms:receive.line.markChecked')}
              </Button>
            )}
          </>
        )}
      </View>
    </SheetScaffold>
  )
}

function ReadOnlyBox({
  label,
  value,
  numeric,
}: {
  label: string
  value: string
  /** Số / ngày → chữ số bằng nhau; ghi chú tự do thì không. */
  numeric?: boolean
}) {
  const { t } = useTranslation('importForms')
  const { colors } = useTheme()
  return (
    <View
      accessible
      accessibilityLabel={t('receive.line.boxA11y', { label, value })}
      style={{
        minHeight: 50,
        justifyContent: 'center',
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: colors.muted,
      }}
    >
      <Text numeric={numeric} weight="semibold" numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}
