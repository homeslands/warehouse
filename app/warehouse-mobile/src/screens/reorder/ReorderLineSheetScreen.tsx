import { useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { useAllAvailableMaterials } from '@/entities/import-form'
import { formatQuantity, useInventory, type InventoryItem } from '@/entities/inventory'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { buildReorderGroups, useReorderStore, type ReorderRow } from '@/features/reorder'
import { haptics } from '@/shared/lib/haptics'
import { parseDecimalInput } from '@/shared/lib/format'
import { round6 } from '@/shared/lib/round'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { baseOfUnits, unitConversionNote, unitOptionHint } from '@/shared/lib/unit-conversion'
import { useDiscardGuard } from '@/shared/lib/useDiscardGuard'
import { useTheme } from '@/shared/theme/useTheme'
import { ChoiceCard, FormField, ROW_PRESS_DELAY_MS, SheetScaffold, Text } from '@/shared/ui'
import { UnitChip, type UnitOption } from '@/shared/ui/compose'

import { dayMonth, reorderUnitName } from './ReorderRow'

/**
 * Route `/reorder-line?materialSlug=…`: sửa số cần đặt / đơn vị / nơi đặt của MỘT vật tư trong "Đề xuất đặt
 * hàng". Kho được ghim lúc mở (đổi kho thì đóng). Ghi chỉ trên máy (`useReorderStore`) nên ✓ không hỏi lại
 * (ngoại lệ có chủ đích của quy tắc "ghi = xác nhận"); ✕ đóng không ghi, có sửa chưa ✓ thì hỏi "Bỏ thay
 * đổi?" (`useDiscardGuard`). Chưa nạp xong phần lưu trên máy của ĐÚNG người + kho (kể cả mở thẳng bằng
 * deep link: sheet tự nạp) hoặc chưa có danh sách bên bán → spinner, không ✓ (store bỏ qua lệnh ghi khi
 * chưa nạp; thân chỉ dựng khi đã biết bên bán để tick nơi đặt đã lưu hiện đúng).
 */
export function ReorderLineSheetScreen() {
  const { t } = useTranslation(['inventory', 'common'])
  const close = useCloseSheet()
  const { colors } = useTheme()
  const { materialSlug } = useLocalSearchParams<{ materialSlug: string }>()
  const currentSlug = useWarehouseStore((s) => s.current?.slug)
  const [warehouseSlug] = useState(currentSlug)
  const warehouseChanged = currentSlug !== warehouseSlug
  useEffect(() => {
    if (warehouseChanged) close()
    // `close` đổi định danh mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseChanged])

  const user = useAuthStore((s) => s.user)
  const canPick = !!user && can(user, 'IMPORT_FORM_CREATE')
  const inventory = useInventory(warehouseSlug)
  const available = useAllAvailableMaterials(canPick ? warehouseSlug : undefined)
  // Danh sách bên bán bị cắt (chạm trần trang) → coi như không có dữ liệu bên bán.
  const materials = canPick && !available.data?.truncated ? (available.data?.items ?? null) : null
  const suppliersKnown = !canPick || !available.isPending
  const storeLocal = useReorderStore((s) => s.local)
  const loaded = useReorderStore((s) => s.loaded)
  const scope = useReorderStore((s) => s.scope)
  const userKey = user?.userSlug ?? user?.userName
  const scopeNow = userKey && warehouseSlug ? `${userKey}|${warehouseSlug}` : null
  const ready = loaded && scope === scopeNow
  const local = useMemo(() => (ready ? storeLocal : {}), [ready, storeLocal])

  // Mở thẳng (deep link) khi store chưa nạp đúng khoá người dùng + kho → tự nạp.
  useEffect(() => {
    if (userKey && warehouseSlug && scope !== scopeNow) {
      void useReorderStore.getState().load(userKey, warehouseSlug)
    }
  }, [userKey, warehouseSlug, scope, scopeNow])

  const found = inventory.data?.find((i) => i.materialSlug === materialSlug)
  const row = useMemo(
    () =>
      found
        ? buildReorderGroups({ items: [found], materials, local, includeYellow: true })
            .flatMap((g) => g.rows)
            .find((r) => r.item.materialSlug === materialSlug)
        : undefined,
    [found, materials, local, materialSlug],
  )

  // Vật tư không còn trong danh sách tồn / không còn cần đặt → đóng.
  const gone = inventory.data !== undefined && !row
  useEffect(() => {
    if (gone) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone])

  if (warehouseChanged || gone) return null
  if (!row || !ready || !suppliersKnown) {
    return (
      <SheetScaffold title="" cancelLabel={t('common:cancel')} onCancel={close}>
        <View style={{ paddingTop: 24 }}>
          <ActivityIndicator
            accessibilityLabel={t('inventory:reorder.sheet.loading')}
            color={colors.mutedForeground}
          />
        </View>
      </SheetScaffold>
    )
  }
  const suppliers = materials?.find((m) => m.slug === materialSlug)?.suppliers ?? []
  return (
    <LineBody
      key={`${warehouseSlug}:${materialSlug}`}
      row={row}
      suppliers={suppliers}
      savedSupplier={local[row.item.materialSlug]?.supplierSlug ?? null}
      onClose={close}
    />
  )
}

function LineBody({
  row,
  suppliers,
  savedSupplier,
  onClose,
}: {
  row: ReorderRow
  suppliers: { slug: string; code: string; name: string }[]
  savedSupplier: string | null
  onClose: () => void
}) {
  const { t, i18n } = useTranslation(['inventory', 'common'])
  const { colors } = useTheme()
  const locale = i18n.language === 'en' ? 'en' : 'vi'
  const item: InventoryItem = row.item
  const base = item.baseUnit
  const fmt = (n: number) => formatQuantity(n, locale, 6)

  const [qtyText, setQtyText] = useState(() =>
    // Không ngăn nghìn; dấu thập phân theo locale — `parseDecimalInput` đọc được cả `,` lẫn `.`.
    row.qty ? String(round6(row.qty.value)).replace('.', locale === 'vi' ? ',' : '.') : '',
  )
  const [unitSlug, setUnitSlug] = useState(row.qty?.unitSlug ?? base?.slug ?? '')
  const [supplier, setSupplier] = useState<string | null>(() =>
    savedSupplier && suppliers.some((s) => s.slug === savedSupplier) ? savedSupplier : null,
  )
  const [unitListOpen, setUnitListOpen] = useState(false)
  const [initial] = useState({ qtyText, unitSlug, supplier })
  const [leaving, setLeaving] = useState(false)
  const dirty =
    !leaving &&
    (qtyText !== initial.qtyText || unitSlug !== initial.unitSlug || supplier !== initial.supplier)
  const { confirmLeave } = useDiscardGuard({ dirty })
  const cancel = async () => {
    if (await confirmLeave()) onClose()
  }

  const trimmed = qtyText.trim()
  const parsed = trimmed === '' ? null : parseDecimalInput(trimmed)
  const invalid = trimmed !== '' && (parsed === null || parsed <= 0)

  const units = item.units
  const baseUnit = baseOfUnits(units)
  const options: UnitOption[] =
    units.length > 0
      ? units.map((u) => ({
          slug: u.unitSlug,
          name: u.unitName,
          hint: unitOptionHint(u, baseUnit, locale),
        }))
      : base
        ? [{ slug: base.slug, name: base.name }]
        : []
  const unitName = reorderUnitName(item, unitSlug)
  const note = unitConversionNote({
    units,
    unitSlug,
    quantity: parsed,
    locale,
    t: (k, o) => String(t(k as never, o as never)),
  })
  const suggested =
    row.suggestedBase != null && base
      ? t('inventory:reorder.sheet.suggested', { qty: `${fmt(row.suggestedBase)} ${base.name}` })
      : null

  const store = useReorderStore.getState
  const done = () => {
    if (invalid) return
    const s = store()
    if (parsed === null) s.setQty(item.materialSlug, null)
    else if (unitSlug === base?.slug && parsed === row.suggestedBase)
      s.setQty(item.materialSlug, null)
    else s.setQty(item.materialSlug, { value: parsed, unitSlug })
    if (supplier && supplier !== savedSupplier) s.setSupplier(item.materialSlug, supplier)
    setLeaving(true)
    onClose()
  }

  const pickUnit = (slug: string) => {
    setUnitListOpen(false)
    setUnitSlug(slug)
  }

  return (
    <SheetScaffold
      testID="reorder-line-sheet"
      title={item.materialName}
      cancelLabel={t('common:cancel')}
      doneLabel={t('common:done')}
      onCancel={() => void cancel()}
      onDone={done}
      doneDisabled={invalid}
    >
      <View style={{ gap: 16, paddingTop: 4 }}>
        <View style={{ gap: 4 }}>
          <FormField
            label={t('inventory:reorder.sheet.qtyLabel')}
            value={qtyText}
            onChangeText={setQtyText}
            error={invalid ? t('inventory:reorder.sheet.qtyInvalid') : undefined}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
          />
          {suggested || note ? (
            <Text muted numeric size={12.5} style={{ marginLeft: 2 }}>
              {[suggested, note].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
        <View
          style={{
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 2,
          }}
        >
          <Text weight="semibold" size={14} style={{ color: colors.fieldLabel }}>
            {t('inventory:reorder.sheet.unitLabel')}
          </Text>
          <UnitChip
            variant="value"
            title={item.materialName}
            current={{ slug: unitSlug, name: unitName }}
            units={options}
            disabled={false}
            onPick={pickUnit}
            onAndroidOverflow={() => setUnitListOpen(true)}
          />
        </View>
        {unitListOpen ? (
          <View style={{ gap: 8 }}>
            {options.map((u) => (
              <ChoiceCard
                key={u.slug}
                title={u.hint ? `${u.name} (${u.hint})` : u.name}
                selected={u.slug === unitSlug}
                onPress={() => pickUnit(u.slug)}
              />
            ))}
          </View>
        ) : null}
        {suppliers.length > 1 ? (
          <View style={{ gap: 8 }}>
            <Text weight="semibold" size={12.5} style={{ marginLeft: 2, color: colors.fieldLabel }}>
              {t('inventory:reorder.sheet.supplierGroup')}
            </Text>
            {suppliers.map((s) => (
              <ChoiceCard
                key={s.slug}
                title={s.name}
                subtitle={
                  <Text numeric muted size={13} numberOfLines={1}>
                    {s.code}
                  </Text>
                }
                selected={supplier === s.slug}
                onPress={() => {
                  if (supplier === s.slug) return
                  haptics.selection()
                  setSupplier(s.slug)
                }}
              />
            ))}
          </View>
        ) : null}
        {row.orderedAt ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('inventory:reorder.sheet.unmark', {
              date: dayMonth(row.orderedAt),
            })}
            onPress={() => {
              useReorderStore.getState().unmarkOrdered(item.materialSlug)
              haptics.selection()
            }}
            unstable_pressDelay={ROW_PRESS_DELAY_MS}
            style={({ pressed }) => ({
              minHeight: 44,
              alignSelf: 'flex-start',
              justifyContent: 'center',
              paddingHorizontal: 2,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text weight="medium" size={14} style={{ color: colors.destructiveText }}>
              {t('inventory:reorder.sheet.unmark', { date: dayMonth(row.orderedAt) })}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SheetScaffold>
  )
}
