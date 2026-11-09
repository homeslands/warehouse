import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, View } from 'react-native'

import {
  importFormAbilities,
  useAvailableMaterials,
  useImportForm,
  useSuppliers,
  type AvailableMaterial,
  type ImportFormAccess,
} from '@/entities/import-form'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { lineKey, MAX_ITEMS, newLocalLine, useReceiveDraft } from '@/features/receive-checklist'
import { formatQuantity, parseDecimalInput, type FormatLocale } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { numericStyle } from '@/shared/theme/fonts'
import { useTheme } from '@/shared/theme/useTheme'
import {
  Button,
  ChoiceCard,
  FormField,
  ROW_PRESS_DELAY_MS,
  SearchField,
  SheetScaffold,
  Text,
} from '@/shared/ui'

import { baseUnitOf } from './import-units'

const SEARCH_DEBOUNCE_MS = 300
/** Giới hạn cột DECIMAL(18,6) / DECIMAL(18,2) của backend (như web `shared/lib/number`). */
const QUANTITY_LIMIT = 1e12
const PRICE_LIMIT = 1e16

/** Từ khoá trễ 300ms (đã trim); ô trống áp dụng ngay. */
function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), value.trim() === '' ? 0 : SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [value])
  return value.trim() === '' ? '' : debounced.trim()
}

type QtyError = 'quantityInvalid' | 'quantityTooLarge'
type PriceError = 'unitPriceInvalid' | 'unitPriceTooLarge'

function checkQuantity(text: string): { value: number } | { error: QtyError } {
  const v = parseDecimalInput(text, 6)
  if (v === null || v <= 0) return { error: 'quantityInvalid' }
  if (v >= QUANTITY_LIMIT) return { error: 'quantityTooLarge' }
  return { value: v }
}

/** Đơn giá tuỳ chọn: để trống = 0 đ (kế toán bổ sung trên web), tối đa 2 chữ số lẻ. */
function checkPrice(text: string): { value: number } | { error: PriceError } {
  if (text.trim() === '') return { value: 0 }
  const v = parseDecimalInput(text, 2)
  if (v === null) return { error: 'unitPriceInvalid' }
  if (v >= PRICE_LIMIT) return { error: 'unitPriceTooLarge' }
  return { value: v }
}

/**
 * Route `/import-add-line` — thêm một dòng vật tư vào phiếu đang kiểm (spec §5.4). Tìm vật tư của kho
 * (`available-materials`, tìm theo tên và mã) → chọn đơn vị (mặc định đơn vị gốc), số lượng, đơn giá
 * tuỳ chọn → ✓. Cặp vật tư + đơn vị đã có trên phiếu: không thêm, mở bảng sửa của dòng sẵn có. Dòng
 * mới coi như đã kiểm, rồi mở bảng sửa của nó (`/import-line`) để ghi hạn dùng / ghi chú.
 */
export function AddLineSheetScreen() {
  const { t, i18n } = useTranslation(['importForms', 'common'])
  const { colors } = useTheme()
  const router = useRouter()
  const close = useCloseSheet()
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'

  const draft = useReceiveDraft((s) => s.draft)
  const formSlug = useReceiveDraft((s) => s.ctx?.formSlug)
  const saving = useReceiveDraft((s) => s.saving)
  const user = useAuthStore((s) => s.user)
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const isNew = formSlug === 'new'
  const formQuery = useImportForm(warehouseSlug, formSlug && !isNew ? formSlug : undefined)
  // Phiếu tạo trên máy: tên bên bán đầu phiếu (bản nháp chỉ giữ slug) — cache từ màn tạo.
  const suppliers = useSuppliers(isNew && !!user && can(user, 'SUPPLIER_READ'))
  const access = useMemo<ImportFormAccess | null>(
    () => (user ? { can: (c) => can(user, c), userSlug: user.userSlug ?? null } : null),
    [user],
  )
  const denied =
    !!access &&
    (isNew
      ? !importFormAbilities(access, 'new').canAddLine
      : !!formQuery.data && !importFormAbilities(access, formQuery.data).canAddLine)

  // Không còn bản nháp (phiên đổi, mở thẳng) hoặc không được thêm dòng → không có gì để làm.
  const gone = !draft || denied
  useEffect(() => {
    if (gone) close()
    // `close` đổi định danh mỗi lần render; chỉ phản ứng khi điều kiện đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone])

  const [text, setText] = useState('')
  const term = useDebounced(text)
  const search = useAvailableMaterials(warehouseSlug, term)

  const [picked, setPicked] = useState<AvailableMaterial | null>(null)
  const [unitSlug, setUnitSlug] = useState<string | null>(null)
  const [qtyText, setQtyText] = useState('')
  const [priceText, setPriceText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const lines = draft?.lines ?? []
  const full = lines.length >= MAX_ITEMS
  const unit = picked?.units.find((u) => u.unitSlug === unitSlug) ?? null
  const existingKey =
    picked && unit ? lineKey({ materialSlug: picked.slug, unitSlug: unit.unitSlug }) : null
  const exists = !!existingKey && lines.some((l) => l.key === existingKey)
  const qty = checkQuantity(qtyText)
  const price = checkPrice(priceText)
  const qtyError =
    submitted && !exists && 'error' in qty ? t(`importForms:${qty.error}`) : undefined
  const priceError =
    submitted && !exists && 'error' in price ? t(`importForms:${price.error}`) : undefined

  const pickMaterial = (m: AvailableMaterial) => {
    haptics.selection()
    setPicked(m)
    setUnitSlug(baseUnitOf(m)?.unitSlug ?? m.units[0]?.unitSlug ?? null)
    setQtyText('')
    setPriceText('')
    setSubmitted(false)
  }
  const pickUnit = (slug: string) => {
    if (slug === unitSlug) return
    haptics.selection()
    setUnitSlug(slug)
  }

  const openLine = (key: string) => {
    close()
    router.navigate({ pathname: '/import-line', params: { key } })
  }

  const add = () => {
    if (!picked || !unit || !existingKey || useReceiveDraft.getState().saving) return
    if (exists) {
      openLine(existingKey)
      return
    }
    setSubmitted(true)
    if (full || 'error' in qty || 'error' in price) {
      haptics.error()
      return
    }
    const store = useReceiveDraft.getState()
    const headerSupplier = store.draft?.header.supplierSlug ?? null
    // Phiếu tạo trên máy đã chọn bên bán: mọi dòng mang bên bán đó (spec §5.4).
    const fixedSupplier =
      isNew && headerSupplier
        ? {
            slug: headerSupplier,
            name:
              suppliers.data?.find((s) => s.slug === headerSupplier)?.name ??
              picked.suppliers.find((s) => s.slug === headerSupplier)?.name ??
              null,
          }
        : undefined
    const line = newLocalLine({
      material: picked,
      unit,
      quantity: qty.value,
      unitPrice: price.value,
      headerSupplier,
      fixedSupplier,
    })
    store.addLine(line)
    // Store bỏ qua khi đang gửi (khoá Lưu) → chỉ mở dòng khi đã thật sự thêm.
    if (!useReceiveDraft.getState().draft?.lines.some((l) => l.key === line.key)) return
    haptics.success()
    openLine(line.key)
  }

  if (!draft) return null

  const stockText = (m: AvailableMaterial) =>
    t('importForms:stock', {
      value: `${formatQuantity(m.quantity, locale)} ${baseUnitOf(m)?.unitName ?? ''}`.trim(),
    })

  const results = search.data?.items ?? []
  const body = picked ? (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text weight="semibold" size={16} numberOfLines={2}>
            {picked.name}
          </Text>
          <Text muted size={13} numberOfLines={1}>
            <Text code muted size={13}>
              {picked.code}
            </Text>
            {` · ${stockText(picked)}`}
          </Text>
        </View>
        <Button variant="ghost" disabled={saving} onPress={() => setPicked(null)}>
          {t('importForms:addLine.change')}
        </Button>
      </View>

      <View style={{ gap: 8 }}>
        <Text weight="semibold" size={12.5} style={{ marginLeft: 2, color: colors.fieldLabel }}>
          {t('importForms:fieldUnit')}
        </Text>
        {picked.units.map((u) => {
          const base = baseUnitOf(picked)
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
        {exists ? (
          <Text size={13} accessibilityRole="alert" style={{ color: colors.warningText }}>
            {t('importForms:addLine.exists')}
          </Text>
        ) : null}
      </View>

      {exists ? null : (
        <>
          <FormField
            label={t('importForms:fieldQuantity')}
            value={qtyText}
            onChangeText={setQtyText}
            error={qtyError}
            keyboardType="decimal-pad"
            returnKeyType="done"
            style={numericStyle()}
          />
          <View style={{ gap: 6 }}>
            <FormField
              label={t('importForms:fieldUnitPrice')}
              value={priceText}
              onChangeText={setPriceText}
              error={priceError}
              placeholder={t('importForms:create.optional')}
              keyboardType="decimal-pad"
              returnKeyType="done"
              style={numericStyle()}
            />
            <Text muted size={12.5} style={{ marginLeft: 2 }}>
              {t('importForms:addLine.unitPriceHint')}
            </Text>
          </View>
        </>
      )}
    </View>
  ) : (
    <View style={{ gap: 12 }}>
      <SearchField
        value={text}
        onChangeText={setText}
        placeholder={t('importForms:materialSearch')}
        shape="pill"
      />
      {term === '' ? (
        <Text muted style={{ textAlign: 'center', paddingTop: 16 }}>
          {t('importForms:addLine.searchHint')}
        </Text>
      ) : search.isError && !search.data ? (
        <View style={{ gap: 12, alignItems: 'center', paddingTop: 16 }}>
          <Text muted>{t('importForms:materialLoadFailedShort')}</Text>
          <Button
            variant="outline"
            loading={search.isFetching}
            onPress={() => void search.refetch({ cancelRefetch: false })}
          >
            {t('common:retry')}
          </Button>
        </View>
      ) : !search.data ? (
        <ActivityIndicator
          accessibilityLabel={t('importForms:addLine.loading')}
          color={colors.mutedForeground}
          style={{ paddingTop: 16 }}
        />
      ) : results.length === 0 ? (
        <Text muted style={{ textAlign: 'center', paddingTop: 16 }}>
          {t('importForms:materialEmpty')}
        </Text>
      ) : (
        <View style={{ borderRadius: 20, backgroundColor: colors.card, overflow: 'hidden' }}>
          {results.map((m, i) => (
            <Pressable
              key={m.slug}
              accessibilityRole="button"
              accessibilityLabel={t('importForms:addLine.materialA11y', {
                name: m.name,
                code: m.code,
                stock: stockText(m),
              })}
              onPress={() => pickMaterial(m)}
              unstable_pressDelay={ROW_PRESS_DELAY_MS}
              style={({ pressed }) => ({
                minHeight: 56,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 10,
                backgroundColor: pressed ? colors.cellPressed : undefined,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              })}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text weight="medium" numberOfLines={2}>
                  {m.name}
                </Text>
                <Text code muted size={13} numberOfLines={1}>
                  {m.code}
                </Text>
              </View>
              <Text numeric muted size={13} numberOfLines={1} style={{ maxWidth: '40%' }}>
                {stockText(m)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )

  return (
    <SheetScaffold
      testID="add-line-sheet"
      title={t('importForms:addLine.title')}
      cancelLabel={t('common:close')}
      onCancel={close}
      doneLabel={t('importForms:addLine.add')}
      onDone={picked && !saving ? add : undefined}
      footer={saving ? t('importForms:receive.line.savingNote') : undefined}
    >
      <View style={{ gap: 16 }}>
        {full ? (
          <Text size={13} accessibilityRole="alert" style={{ color: colors.destructive }}>
            {t('importForms:itemsMaxReached')}
          </Text>
        ) : null}
        {body}
      </View>
    </SheetScaffold>
  )
}
