import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import {
  canCreateExportForm,
  exportFormAbilities,
  useExportForm,
  type ExportFormAccess,
} from '@/entities/export-form'
import { useInventory, type InventoryItem } from '@/entities/inventory'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { MAX_ITEMS, useExportDraft } from '@/features/export-draft'
import { formatQuantity, type FormatLocale } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { normalizeForSearch } from '@/shared/lib/search'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useTheme } from '@/shared/theme/useTheme'
import {
  Button,
  MaterialPickList,
  SearchField,
  SheetScaffold,
  Text,
  type PickItem,
} from '@/shared/ui'

import { addMaterialLines } from './add-material-lines'
import { baseUnitOf } from './line-fields'

/** Số dòng tối đa hiện ra (tồn đã tải đủ về máy, lọc trên máy) — gõ để thu hẹp. */
const MAX_RESULTS = 50

/**
 * Route `/export-add-line` — bộ chọn NHIỀU vật tư (như hộp chọn vật tư của web): tìm trong TỒN KHO của
 * kho (tên / mã, bỏ dấu; ô trống = cả kho, tối đa 50 dòng), mỗi dòng: tên, mã, "còn n <đv gốc>" (hoặc
 * "Hết hàng" — vẫn chọn được), ô tick. Vật tư đã có trên phiếu (bất kỳ đơn vị / lô) ghi "đã có" và không
 * tick được; vật tư chưa khai đơn vị cũng vậy. Sức chứa = 200 − số dòng. Nút đáy "Thêm n vật tư" (khoá
 * khi chưa tick) → mỗi vật tư một dòng (`addMaterialLines`: đơn vị gốc, lô tự động, số lượng chưa nhập,
 * chưa có đơn giá) theo thứ tự danh sách tồn, đóng sheet, bước 2 tự mở sheet sửa dòng `/export-line` của
 * dòng ĐẦU (ô số focus sẵn — `useLineFocus` → `useComposeLineOpen`), nơi nhập số / giá / đơn vị / lô.
 */
export function ExportAddLineSheetScreen() {
  const { t, i18n } = useTranslation(['exportForms', 'common'])
  const close = useCloseSheet()
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'

  const draft = useExportDraft((s) => s.draft)
  const formSlug = useExportDraft((s) => s.ctx?.formSlug)
  const saving = useExportDraft((s) => s.saving)
  const user = useAuthStore((s) => s.user)
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const isNew = formSlug === 'new'
  const formQuery = useExportForm(warehouseSlug, formSlug && !isNew ? formSlug : undefined)
  const access = useMemo<ExportFormAccess | null>(
    () => (user ? { can: (c) => can(user, c), userSlug: user.userSlug ?? null } : null),
    [user],
  )
  // Phiếu mới: cần EXPORT_FORM_CREATE; phiếu đã có: sửa được phiếu đó (chưa tải xong thì chưa biết).
  const denied =
    !!access &&
    (isNew
      ? !canCreateExportForm(access)
      : !!formQuery.data && !exportFormAbilities(access, formQuery.data).canEdit)

  // Không còn bản nháp (phiên đổi, mở thẳng) hoặc không được sửa phiếu → không có gì để làm.
  const gone = !draft || denied
  useEffect(() => {
    if (gone) close()
    // `close` đổi định danh mỗi lần render; chỉ phản ứng khi điều kiện đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone])

  const inventory = useInventory(warehouseSlug)
  const [text, setText] = useState('')
  const term = normalizeForSearch(useDebounced(text))
  // Vật tư đã tick (slug), giữ qua lần đổi từ khoá.
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())

  const matching = useMemo(() => {
    const all = inventory.data ?? []
    if (term === '') return all
    return all.filter(
      (i) =>
        normalizeForSearch(i.materialName).includes(term) ||
        normalizeForSearch(i.materialCode).includes(term),
    )
  }, [inventory.data, term])
  const results = matching.slice(0, MAX_RESULTS)

  const lines = draft?.lines
  const onForm = useMemo(() => new Set((lines ?? []).map((l) => l.materialSlug)), [lines])
  const capacity = Math.max(0, MAX_ITEMS - (lines?.length ?? 0))
  // Tick còn hiệu lực: vật tư đã tick mà vừa thành "đã có" (vd quét thêm) không tính.
  const pickedCount = useMemo(
    () => [...checked].filter((slug) => !onForm.has(slug)).length,
    [checked, onForm],
  )

  const toggle = (slug: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else if ([...next].filter((slug) => !onForm.has(slug)).length < capacity) next.add(slug)
      else return prev
      return next
    })
    haptics.selection()
  }

  const selectMany = (ids: string[], select: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (!select) {
        for (const id of ids) next.delete(id)
        return next
      }
      for (const id of ids) {
        if (next.has(id)) continue
        if ([...next].filter((slug) => !onForm.has(slug)).length >= capacity) break
        next.add(id)
      }
      return next
    })
  }

  const confirm = () => {
    if (useExportDraft.getState().saving || pickedCount === 0) return
    // Theo thứ tự danh sách tồn (không theo thứ tự tick, không theo từ khoá đang gõ).
    const picked = (inventory.data ?? []).filter(
      (m) => checked.has(m.materialSlug) && !onForm.has(m.materialSlug),
    )
    const added = addMaterialLines(picked.slice(0, capacity))
    if (added.length === 0) {
      haptics.error()
      return
    }
    haptics.success()
    close()
  }

  if (!draft) return null

  const stockText = (m: InventoryItem) =>
    m.availableQuantity > 0
      ? t('exportForms:lot.available', {
          n: formatQuantity(m.availableQuantity, locale, 6),
          unit: m.baseUnit?.name ?? '',
        }).trim()
      : t('exportForms:addLine.outOfStock')

  const items: PickItem[] = results.map((m) => ({
    id: m.materialSlug,
    name: m.materialName,
    code: m.materialCode,
    detail: stockText(m),
    detailTone: m.availableQuantity > 0 ? 'muted' : 'warning',
    state: onForm.has(m.materialSlug) ? 'exists' : baseUnitOf(m) ? 'pickable' : 'locked',
    lockedLabel: baseUnitOf(m) ? undefined : t('exportForms:addLine.noBaseUnit'),
    accessibilityLabel: [
      t('exportForms:addLine.materialA11y', {
        name: m.materialName,
        code: m.materialCode,
        stock: stockText(m),
      }),
      ...(onForm.has(m.materialSlug)
        ? [t('exportForms:addLine.already')]
        : baseUnitOf(m)
          ? []
          : [t('exportForms:addLine.noBaseUnit')]),
    ].join(', '),
  }))
  // Đang lưu: khoá mọi dòng (không nhãn).
  if (saving) for (const it of items) if (it.state === 'pickable') it.state = 'locked'

  const searchHeader = (
    <>
      <SearchField
        value={text}
        onChangeText={setText}
        placeholder={t('exportForms:addLine.search')}
        shape="pill"
      />
      {inventory.data && matching.length > results.length ? (
        <Text muted size={13} style={{ textAlign: 'center' }}>
          {t('exportForms:addLine.more', { shown: results.length, total: matching.length })}
        </Text>
      ) : null}
    </>
  )

  return (
    <SheetScaffold
      testID="export-add-line-sheet"
      title={t('exportForms:addLine.title')}
      cancelLabel={t('common:close')}
      onCancel={close}
      footer={saving ? t('exportForms:line.savingNote') : undefined}
      bottom={
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
          <Button variant="accent" capsule disabled={pickedCount === 0 || saving} onPress={confirm}>
            {t('exportForms:addLine.addCount', { count: pickedCount })}
          </Button>
        </View>
      }
    >
      <MaterialPickList
        items={items}
        checked={checked}
        onToggle={toggle}
        onSelectMany={selectMany}
        selectedCount={pickedCount}
        capacityLeft={capacity - pickedCount}
        capacityLabel={t('exportForms:edit.bar.blocked.tooMany', { max: MAX_ITEMS })}
        header={searchHeader}
        empty={
          inventory.data ? (
            <Text muted style={{ textAlign: 'center', paddingTop: 16 }}>
              {t('exportForms:addLine.empty')}
            </Text>
          ) : (
            <InventoryState
              failed={inventory.isError}
              fetching={inventory.isFetching}
              onRetry={() => void inventory.refetch({ cancelRefetch: false })}
            />
          )
        }
      />
    </SheetScaffold>
  )
}

function InventoryState({
  failed,
  fetching,
  onRetry,
}: {
  failed: boolean
  fetching: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation(['exportForms', 'common'])
  const { colors } = useTheme()
  return failed ? (
    <View style={{ gap: 12, alignItems: 'center', paddingTop: 16 }}>
      <Text muted>{t('exportForms:addLine.loadError')}</Text>
      <Button variant="outline" loading={fetching} onPress={onRetry}>
        {t('common:retry')}
      </Button>
    </View>
  ) : (
    <ActivityIndicator
      accessibilityLabel={t('exportForms:addLine.loading')}
      color={colors.mutedForeground}
      style={{ paddingTop: 16 }}
    />
  )
}
