import { NotebookPenIcon, PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useId, useState, type ComponentType } from 'react'
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toCodeOrNameQuery } from '@/shared/lib/code'
import { translateFormMessage } from '@/shared/lib/form-message'
import { formatCurrency, formatQuantity } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Combobox, type ComboboxOption } from '@/shared/ui/Combobox'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { NumberInput } from '@/shared/ui/NumberInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { useAvailableMaterialSearch, type AvailableMaterial } from '@/entities/import-form'
import {
  NO_MATERIAL_ADD,
  type AddedMaterial,
  type AddMaterialDialogProps,
  type MaterialAddAbilities,
} from '@/entities/inventory'
import {
  EMPTY_ITEM,
  IMPORT_FORM_ITEMS_MAX,
  baseUnitOf,
  effectiveSupplier,
  lineAmount,
  type ImportFormValues,
} from '../model/import-form-editor.schema'

type Props = {
  /** Báo lên sheet vật tư vừa chọn từ kết quả tìm — hộp Kiểm tra cần chúng dù nằm ngoài 100 bản ghi đầu. */
  onMaterialPicked?: (material: AvailableMaterial) => void
  /** Báo lên sheet vật tư vừa thêm từ hộp "Thêm vật tư vào kho" — hộp Kiểm tra lấy nhãn của nó làm tên dự phòng. */
  onMaterialAdded?: (material: AddedMaterial) => void
  form: UseFormReturn<ImportFormValues>
  materials: AvailableMaterial[]
  /** Vật tư của dòng cũ không còn trong danh sách (bị gỡ khỏi kho / ngoài 100 bản ghi đầu): slug → "mã · tên". */
  fallbackLabels: Record<string, string>
  /** Đơn vị đã lưu của dòng cũ có vật tư không còn trong danh sách: unitSlug → "mã · tên". */
  fallbackUnits?: Record<string, string>
  warehouseSlug: string
  warehouseName: string
  /** Quyền của luồng "thêm vật tư vào kho"; mặc định không có quyền nào (ẩn điểm vào). */
  materialAbilities?: MaterialAddAbilities
  /** Hộp "Thêm vật tư vào kho" do page truyền vào (feature không import feature). Không có → không có dòng "＋ Thêm vật tư vào kho…". */
  AddMaterialDialog?: ComponentType<AddMaterialDialogProps>
  /** Tải vật tư khả dụng của kho lỗi: báo ngay dưới tiêu đề "Chi tiết vật tư" (kèm Thử lại) và trong danh sách của ô chọn. */
  loadError?: { message: string; onRetry: () => void }
  /** Người dùng được chọn bên bán (có quyền đọc NCC): bật nút "đổi bên bán" theo dòng. */
  canPickSupplier?: boolean
  /** Danh sách NCC để chọn cho dòng và để lấy tên cho tiêu đề nhóm / nhãn "Bên bán: …". */
  suppliers?: { slug: string; code: string; name: string }[]
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/**
 * Lưới 7 cột khi KHUNG (container query `@3xl` = 48rem, không phải cửa sổ) đủ rộng — sheet hẹp hơn cửa sổ nên `md:` từng
 * dựng lưới ~50rem trong khung ~46rem, đẩy nút ghi chú / xoá ra ngoài card. Hẹp hơn: mỗi dòng là một thẻ xếp dọc, nhãn ô hiện ra.
 */
const ROW_GRID =
  'grid gap-3 rounded-lg border p-3 @3xl:grid-cols-[1.5rem_minmax(11rem,2.2fr)_minmax(5.5rem,0.9fr)_minmax(5rem,0.8fr)_minmax(7.5rem,1.2fr)_minmax(6.5rem,1fr)_auto] @3xl:items-start @3xl:rounded-none @3xl:border-0 @3xl:border-b @3xl:px-0'

export function ImportFormItemsField({
  onMaterialPicked,
  onMaterialAdded: reportMaterialAdded,
  form,
  materials,
  fallbackLabels,
  fallbackUnits = {},
  warehouseSlug,
  warehouseName,
  materialAbilities = NO_MATERIAL_ADD,
  AddMaterialDialog,
  loadError,
  canPickSupplier = false,
  suppliers = [],
}: Props) {
  const { t } = useTranslation(['importForms', 'common'])
  const hintId = useId()
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const items = useWatch({ control: form.control, name: 'items' })
  // Chỉ khởi tạo một lần từ ghi chú có sẵn; sau đó người dùng toàn quyền đóng/mở (xoá hết chữ không làm ô biến mất).
  const [openNotes, setOpenNotes] = useState<ReadonlySet<string>>(
    () => new Set(fields.filter((_, i) => (items[i]?.note ?? '') !== '').map((f) => f.id)),
  )

  const headerSupplier = useWatch({ control: form.control, name: 'supplierSlug' })
  // Ô tìm đang gõ (một ô mở tại một thời điểm) → tìm phía BE sau 300 ms.
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const searching = search.trim() !== ''
  const searchResult = useAvailableMaterialSearch(
    warehouseSlug,
    toCodeOrNameQuery(debouncedSearch),
    { enabled: searching && debouncedSearch !== '' },
  )
  const found = searching ? (searchResult.data?.items ?? []) : []
  // Vật tư chọn từ kết quả tìm có thể nằm ngoài 100 bản ghi đầu của `materials` → giữ lại để nhãn / đơn vị / tồn còn.
  const [picked, setPicked] = useState<ReadonlyMap<string, AvailableMaterial>>(new Map())
  const bySlug = new Map<string, AvailableMaterial>([
    ...picked,
    ...materials.map((m): [string, AvailableMaterial] => [m.slug, m]),
  ])
  const supplierName = (slug: string) =>
    suppliers.find((x) => x.slug === slug)?.name ??
    [...bySlug.values()].flatMap((m) => m.suppliers).find((x) => x.slug === slug)?.name ??
    slug
  const supplierOptions: ComboboxOption[] = suppliers.map((x) => ({
    value: x.slug,
    label: `${x.code} · ${x.name}`,
  }))
  const [pickingSupplier, setPickingSupplier] = useState<ReadonlySet<string>>(new Set())
  const baseSlugOf = (slug: string | undefined, chosen?: AvailableMaterial) => {
    const m = chosen ?? (slug ? bySlug.get(slug) : undefined)
    return m ? (baseUnitOf(m)?.unitSlug ?? '') : ''
  }
  const [adding, setAdding] = useState<{ index: number; search: string } | null>(null)
  // Vật tư vừa thêm từ hộp có thể nằm ngoài 100 bản ghi đầu của `materials` → giữ nhãn / đơn vị tại chỗ cho dòng đã chọn.
  const [addedLabels, setAddedLabels] = useState<Record<string, string>>({})
  const [addedUnits, setAddedUnits] = useState<Record<string, string>>({})
  const labels = { ...fallbackLabels, ...addedLabels }
  const unitLabels = { ...fallbackUnits, ...addedUnits }
  const onMaterialAdded = (added: AddedMaterial) => {
    if (!adding) return
    reportMaterialAdded?.(added)
    setAddedLabels((prev) => ({ ...prev, [added.slug]: added.label }))
    if (added.baseUnit) {
      const { slug, label } = added.baseUnit
      setAddedUnits((prev) => ({ ...prev, [slug]: label }))
    }
    const opts = { shouldDirty: true, shouldValidate: form.formState.isSubmitted }
    form.setValue(`items.${adding.index}.materialSlug`, added.slug, opts)
    form.setValue(`items.${adding.index}.unitSlug`, added.baseUnit?.slug ?? '', opts)
  }
  const toOption = (m: AvailableMaterial): ComboboxOption => ({
    value: m.slug,
    label: `${m.code} · ${m.name}`,
  })
  // Bảng tra nhãn của ô chọn: mọi vật tư đã biết (kể cả vật tư chọn từ kết quả tìm), không phụ thuộc cái đang vẽ.
  const fallbackOptions = Object.entries(labels)
    .filter(([slug]) => !bySlug.has(slug))
    .map(([value, label]) => ({ value, label }))
  const options: ComboboxOption[] = [...fallbackOptions, ...[...bySlug.values()].map(toOption)]
  /** Danh sách vẽ của dòng: có NCC hiệu lực → nhóm "hàng thường mua" trước, còn lại sau; không có → một nhóm. */
  const groupsFor = (supplierSlug: string) => {
    const source = searching ? found : materials
    const extra = searching ? [] : fallbackOptions
    if (!supplierSlug) return [{ heading: '', options: [...extra, ...source.map(toOption)] }]
    const usual = source.filter((m) => m.suppliers.some((x) => x.slug === supplierSlug))
    const rest = source.filter((m) => !usual.includes(m))
    return [
      {
        heading: t('importForms:groupSupplierMaterials', { name: supplierName(supplierSlug) }),
        options: usual.map(toOption),
      },
      { heading: t('importForms:groupOtherMaterials'), options: [...extra, ...rest.map(toOption)] },
    ].filter((g) => g.options.length > 0)
  }
  const full = fields.length >= IMPORT_FORM_ITEMS_MAX
  const rootError =
    form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message

  // Bọc chung một <span>: FormLabel là flex container, khoảng trắng ngăn cách đặt ở text node của chính
  // <span> này (không phải đầu span sr-only, nơi nó bị bỏ) → tên khả truy cập là "Vật tư dòng 1".
  const lineLabel = (text: string, index: number) => (
    <span>
      {text} <span className="sr-only">{t('importForms:lineLabel', { line: index + 1 })}</span>
    </span>
  )

  return (
    <section className="@container space-y-3" aria-labelledby={`${hintId}-title`}>
      <h2 id={`${hintId}-title`} className="font-heading text-base font-semibold">
        {t('importForms:items')}
      </h2>

      {loadError && (
        <div
          role="alert"
          className="text-destructive flex flex-wrap items-center justify-between gap-2 text-sm"
        >
          <span>{t('importForms:materialLoadFailed', { message: loadError.message })}</span>
          <Button type="button" variant="outline" size="sm" onClick={loadError.onRetry}>
            {t('common:retry')}
          </Button>
        </div>
      )}

      <div
        aria-hidden
        className="text-muted-foreground hidden border-b pb-2 text-sm @3xl:grid @3xl:grid-cols-[1.5rem_minmax(11rem,2.2fr)_minmax(5.5rem,0.9fr)_minmax(5rem,0.8fr)_minmax(7.5rem,1.2fr)_minmax(6.5rem,1fr)_auto] @3xl:gap-3"
      >
        <span>{t('importForms:lineNo')}</span>
        <span>{t('importForms:fieldMaterial')}</span>
        <span>{t('importForms:fieldUnit')}</span>
        <span>{t('importForms:fieldQuantity')}</span>
        <span>{t('importForms:fieldUnitPrice')}</span>
        <span className="text-right">{t('importForms:fieldAmount')}</span>
        <span className="w-18" />
      </div>

      {fields.map((field, index) => {
        const row = items[index] ?? EMPTY_ITEM
        const material = bySlug.get(row.materialSlug)
        const base = material ? baseUnitOf(material) : undefined
        const unit = material?.units.find((u) => u.unitSlug === row.unitSlug)
        const unitFullLabel = unit
          ? `${unit.unitCode} · ${unit.unitName}`
          : row.unitSlug
            ? unitLabels[row.unitSlug]
            : undefined
        const amount = lineAmount(row.quantity, row.unitPrice)
        const noteOpen = openNotes.has(field.id)
        const lineSupplier = effectiveSupplier(
          { ...form.getValues(), supplierSlug: headerSupplier ?? '', items },
          index,
        )
        const overridden = row.supplierOverride !== ''
        const picking = pickingSupplier.has(field.id)
        const setPicking = (on: boolean) =>
          setPickingSupplier((prev) => {
            const next = new Set(prev)
            if (on) next.add(field.id)
            else next.delete(field.id)
            return next
          })

        return (
          <div key={field.id} data-testid={`line-${index}`} className={ROW_GRID}>
            <span className="text-muted-foreground pt-2 text-sm tabular-nums">{index + 1}</span>

            <FormField
              control={form.control}
              name={`items.${index}.materialSlug`}
              render={({ field: f }) => (
                <FormItem required>
                  <FormLabel className="@3xl:sr-only">
                    {lineLabel(t('importForms:fieldMaterial'), index)}
                  </FormLabel>
                  <FormControl>
                    <Combobox
                      options={options}
                      groups={groupsFor(lineSupplier)}
                      serverFiltered={searching}
                      onSearchChange={setSearch}
                      isLoading={
                        searching && (searchResult.isFetching || debouncedSearch !== search.trim())
                      }
                      loadingText={t('importForms:searching')}
                      value={f.value || undefined}
                      onChange={(next) => {
                        const chosen = next ? found.find((m) => m.slug === next) : undefined
                        if (chosen) {
                          setPicked((prev) => new Map(prev).set(chosen.slug, chosen))
                          onMaterialPicked?.(chosen)
                        }
                        f.onChange(next ?? '')
                        // Đơn vị của vật tư cũ không áp dụng cho vật tư mới (backend 101326) → về đơn vị gốc.
                        form.setValue(`items.${index}.unitSlug`, baseSlugOf(next, chosen), {
                          shouldDirty: true,
                          shouldValidate: form.formState.isSubmitted,
                        })
                      }}
                      placeholder={t('importForms:materialPlaceholder')}
                      searchPlaceholder={t('importForms:materialSearch')}
                      emptyText={
                        // Tìm phía BE lỗi cũng là "không tải được" — đừng nói kho không có vật tư phù hợp.
                        loadError || (searching && searchResult.isError)
                          ? t('importForms:materialLoadFailedShort')
                          : t('importForms:materialEmpty')
                      }
                      footer={
                        materialAbilities.search && AddMaterialDialog
                          ? (search, close) => (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                // Thẳng lề chữ với các mục của danh sách (CommandItem `px-2`).
                                className="w-full justify-start px-2"
                                onClick={() => {
                                  close()
                                  setAdding({ index, search })
                                }}
                              >
                                <PlusIcon aria-hidden />
                                {t('importForms:addMaterialEntry')}
                              </Button>
                            )
                          : undefined
                      }
                    />
                  </FormControl>
                  {material && (
                    <p className="text-muted-foreground text-xs">
                      {t('importForms:stock', {
                        value:
                          `${formatQuantity(material.quantity)} ${base?.unitCode ?? ''}`.trim(),
                      })}
                    </p>
                  )}
                  {canPickSupplier && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      {overridden && (
                        <span className="text-muted-foreground">
                          {t('importForms:lineSupplier', {
                            name: supplierName(row.supplierOverride),
                          })}
                        </span>
                      )}
                      {picking && (
                        <Combobox
                          defaultOpen
                          // Đóng mà không chọn (Esc, bấm ra ngoài) → bỏ ô chọn, dòng về như trước.
                          onOpenChange={(isOpen) => !isOpen && setPicking(false)}
                          className="min-w-48"
                          aria-label={`${t('importForms:supplier')} ${t('importForms:lineLabel', { line: index + 1 })}`}
                          options={supplierOptions}
                          value={row.supplierOverride || undefined}
                          placeholder={t('importForms:supplierPlaceholder')}
                          onChange={(next) => {
                            form.setValue(
                              `items.${index}.supplierOverride`,
                              !next || next === headerSupplier ? '' : next,
                              { shouldDirty: true },
                            )
                            setPicking(false)
                          }}
                        />
                      )}
                      {!picking && (
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          className="h-auto p-0 text-xs"
                          onClick={() => setPicking(true)}
                        >
                          {t('importForms:changeLineSupplier')}
                        </Button>
                      )}
                      {(overridden || picking) && (
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          className="h-auto p-0 text-xs"
                          onClick={() => {
                            form.setValue(`items.${index}.supplierOverride`, '', {
                              shouldDirty: true,
                            })
                            setPicking(false)
                          }}
                        >
                          {t('importForms:followHeaderSupplier')}
                        </Button>
                      )}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`items.${index}.unitSlug`}
              render={({ field: f }) => (
                <FormItem required>
                  <FormLabel className="@3xl:sr-only">
                    {lineLabel(t('importForms:fieldUnit'), index)}
                  </FormLabel>
                  <Select
                    value={f.value}
                    onValueChange={(next) => {
                      // Radix bắn onValueChange('') khi danh sách SelectItem đổi theo vật tư — không có thao tác xoá đơn vị.
                      if (next) f.onChange(next)
                    }}
                    disabled={!material}
                  >
                    <FormControl>
                      <SelectTrigger
                        className="w-full"
                        title={unitFullLabel}
                        aria-label={`${t('importForms:fieldUnit')} ${t('importForms:lineLabel', { line: index + 1 })}`}
                      >
                        {/* Ô hẹp: chỉ hiện MÃ đơn vị (khớp "Tồn: 120 KG"), tên đầy đủ ở danh sách thả xuống và `title`. */}
                        <SelectValue placeholder={t('importForms:unitPlaceholder')}>
                          {unitFullLabel?.split(' · ')[0]}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {!material && f.value && unitLabels[f.value] && (
                        <SelectItem value={f.value}>{unitLabels[f.value]}</SelectItem>
                      )}
                      {(material?.units ?? []).map((u) => (
                        <SelectItem key={u.unitSlug} value={u.unitSlug}>
                          {`${u.unitCode} · ${u.unitName}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`items.${index}.quantity`}
              render={({ field: f }) => (
                <FormItem required>
                  <FormLabel className="@3xl:sr-only">
                    {lineLabel(t('importForms:fieldQuantity'), index)}
                  </FormLabel>
                  <FormControl>
                    <NumberInput
                      ref={f.ref}
                      value={f.value}
                      onChange={f.onChange}
                      onBlur={f.onBlur}
                    />
                  </FormControl>
                  {unit && !unit.isBaseUnit && row.quantity !== undefined && base && (
                    <p className="text-muted-foreground text-xs">
                      {t('importForms:converted', {
                        value: `${formatQuantity(row.quantity * unit.conversionRate)} ${base.unitCode}`,
                      })}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`items.${index}.unitPrice`}
              render={({ field: f }) => (
                <FormItem required>
                  <FormLabel className="@3xl:sr-only">
                    {lineLabel(t('importForms:fieldUnitPrice'), index)}
                  </FormLabel>
                  <FormControl>
                    <MoneyInput
                      ref={f.ref}
                      value={f.value}
                      onChange={f.onChange}
                      onBlur={f.onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between gap-2 @3xl:block @3xl:pt-2 @3xl:text-right">
              <span className="text-muted-foreground text-sm @3xl:sr-only">
                {t('importForms:fieldAmount')}
              </span>
              <span
                data-testid={`line-amount-${index}`}
                className="text-sm font-medium tabular-nums"
              >
                {formatCurrency(amount, { maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex gap-1 @3xl:pt-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-pressed={noteOpen}
                aria-label={t('importForms:toggleLineNote', { line: index + 1 })}
                onClick={() =>
                  setOpenNotes((prev) => {
                    const next = new Set(prev)
                    if (next.has(field.id)) next.delete(field.id)
                    else next.add(field.id)
                    return next
                  })
                }
              >
                <NotebookPenIcon aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={fields.length <= 1}
                aria-label={t('importForms:removeLine', { line: index + 1 })}
                onClick={() => remove(index)}
              >
                <XIcon aria-hidden />
              </Button>
            </div>

            {noteOpen && (
              <FormField
                control={form.control}
                name={`items.${index}.note`}
                render={({ field: f }) => (
                  <FormItem className="@3xl:col-start-2 @3xl:col-end-7">
                    <FormLabel>{lineLabel(t('importForms:fieldLineNote'), index)}</FormLabel>
                    <FormControl>
                      <Input {...f} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        )
      })}

      {rootError && (
        <p role="alert" className="text-destructive text-sm">
          {translateFormMessage(rootError)}
        </p>
      )}

      <div className="space-y-1">
        <Button
          type="button"
          variant="outline"
          disabled={full}
          aria-describedby={full ? `${hintId}-full` : undefined}
          onClick={() => append({ ...EMPTY_ITEM })}
        >
          <PlusIcon aria-hidden />
          {t('importForms:addLine')}
        </Button>
        {full && (
          <p id={`${hintId}-full`} className="text-muted-foreground text-xs">
            {t('importForms:itemsMaxReached')}
          </p>
        )}
      </div>

      {AddMaterialDialog && (
        <AddMaterialDialog
          open={adding !== null}
          onOpenChange={(open) => !open && setAdding(null)}
          warehouseSlug={warehouseSlug}
          initialSearch={adding?.search ?? ''}
          description={t('importForms:addMaterialDescription', { warehouse: warehouseName })}
          abilities={materialAbilities}
          defaultSupplierSlug={
            adding
              ? effectiveSupplier(
                  { ...form.getValues(), supplierSlug: headerSupplier ?? '', items },
                  adding.index,
                ) || undefined
              : undefined
          }
          onAdded={onMaterialAdded}
        />
      )}
    </section>
  )
}
