import { ListChecksIcon, NotebookPenIcon, PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { translateFormMessage } from '@/shared/lib/form-message'
import { formatCurrency, formatQuantity } from '@/shared/lib/format'
import { roundMoney } from '@/shared/lib/number'
import { Button } from '@/shared/ui/button'
import { Combobox, type ComboboxOption } from '@/shared/ui/Combobox'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { NumberInput } from '@/shared/ui/NumberInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { InventoryItem } from '@/entities/inventory'
import type { MaterialBatch } from '@/entities/material-batch'
import type { Shortage } from '../model/availability'
import {
  EMPTY_EXPORT_ITEM,
  EXPORT_FORM_ITEMS_MAX,
  type ExportFormValues,
} from '../model/export-form-editor.schema'
import type { FallbackMaterial } from '../model/fallback'
import { EXPORT_STOCK_SIZE, baseUnitSlugOf } from '../model/material-search'
import { addPickedExportLines, isBlankExportLine } from '../model/pick-lines'
import { BatchSelect } from './BatchSelect'
import { ExportFormMaterialPicker } from './ExportFormMaterialPicker'

type Props = {
  form: UseFormReturn<ExportFormValues>
  warehouseSlug: string
  /** Vật tư của kho (trang đầu, `EXPORT_STOCK_SIZE`) — nguồn của ô chọn vật tư và số khả dụng. */
  stock: InventoryItem[]
  /** Tổng số vật tư của kho; lớn hơn `EXPORT_STOCK_SIZE` thì ô chọn ghi chú "Chỉ tìm trong … vật tư đầu". */
  stockTotal: number
  /** Dòng vượt khả dụng (`findShortages`) — hiện câu đỏ dưới dòng. */
  shortages: Shortage[]
  /** Có MATERIAL_READ + WAREHOUSE_READ → chọn được lô; không → dòng chỉ ghi "Tự chọn". */
  canPickBatch: boolean
  /** Lô đã biết theo slug (để ghi HSD / còn bao nhiêu trên nút lô của dòng đã lưu). */
  batchesBySlug: ReadonlyMap<string, MaterialBatch>
  /** Báo lên sheet lô vừa chọn tay — luật vượt khả dụng cần số khả dụng của lô đó. */
  onBatchPicked?: (batch: MaterialBatch) => void
  /**
   * Vật tư của dòng nháp không có trong `stock` (ngoài `EXPORT_STOCK_SIZE` đầu, hoặc đã gỡ khỏi kho): mã / tên và đơn vị
   * đã lưu — dòng vẫn hiện đúng và sửa được số lượng (không biết khả dụng nên không báo vượt).
   */
  fallbackMaterials?: ReadonlyMap<string, FallbackMaterial>
}

const NO_FALLBACK: ReadonlyMap<string, FallbackMaterial> = new Map()

/**
 * Lưới khi KHUNG (container query, không phải cửa sổ) đủ rộng: # · Vật tư · Lô · Số lượng · Đơn vị ·
 * [Đơn giá · Thành tiền khi Bán] · nút. Hẹp hơn: mỗi dòng là một thẻ xếp dọc, nhãn ô hiện ra. Lưới Bán + khe ≈ 55.75rem
 * nên chỉ bật từ `@4xl` (56rem) — ở `@3xl` (48rem) nó tràn khung, đẩy nút ghi chú / xoá ra ngoài; lưới không-Bán
 * ≈ 39.75rem vừa khung `@3xl`. Thêm / nới cột thì soát lại. Mỗi biến thể một bộ chuỗi class viết nguyên văn (Tailwind
 * quét mã nguồn, không nội suy được).
 */
const BP_SALE = {
  row: 'grid gap-3 rounded-lg border p-3 @4xl:items-start @4xl:rounded-none @4xl:border-0 @4xl:border-b @4xl:px-0',
  head: 'text-muted-foreground hidden border-b pb-2 text-sm @4xl:grid @4xl:gap-3',
  grid: '@4xl:grid-cols-[1.5rem_minmax(10.5rem,2.2fr)_minmax(8rem,1.5fr)_minmax(5.5rem,0.9fr)_minmax(5rem,0.8fr)_minmax(7.5rem,1.2fr)_minmax(8rem,1fr)_auto]',
  label: '@4xl:sr-only',
  actions: 'flex gap-1 @4xl:pt-0.5',
  span: '@4xl:col-start-2 @4xl:col-end-[-1]',
  shortage: 'text-destructive text-sm @4xl:col-start-2 @4xl:col-end-[-1]',
}
const BP_PLAIN = {
  row: 'grid gap-3 rounded-lg border p-3 @3xl:items-start @3xl:rounded-none @3xl:border-0 @3xl:border-b @3xl:px-0',
  head: 'text-muted-foreground hidden border-b pb-2 text-sm @3xl:grid @3xl:gap-3',
  grid: '@3xl:grid-cols-[1.5rem_minmax(11rem,2.2fr)_minmax(8.5rem,1.5fr)_minmax(5.5rem,0.9fr)_minmax(5rem,0.8fr)_auto]',
  label: '@3xl:sr-only',
  actions: 'flex gap-1 @3xl:pt-0.5',
  span: '@3xl:col-start-2 @3xl:col-end-[-1]',
  shortage: 'text-destructive text-sm @3xl:col-start-2 @3xl:col-end-[-1]',
}

export function ExportFormItemsField({
  form,
  warehouseSlug,
  stock,
  stockTotal,
  shortages,
  canPickBatch,
  batchesBySlug,
  onBatchPicked,
  fallbackMaterials = NO_FALLBACK,
}: Props) {
  const { t } = useTranslation(['exportForms', 'common'])
  const hintId = useId()
  // Neo bề rộng của ô xổ vật tư: mọi dòng (lưới hay thẻ) đều rộng bằng khung này.
  const sectionRef = useRef<HTMLElement | null>(null)
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const pickButtonRef = useRef<HTMLButtonElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const items = useWatch({ control: form.control, name: 'items' })
  const sale = useWatch({ control: form.control, name: 'type' }) === 'SALE'
  const bp = sale ? BP_SALE : BP_PLAIN
  const [openNotes, setOpenNotes] = useState<ReadonlySet<string>>(
    () => new Set(fields.filter((_, i) => (items[i]?.note ?? '') !== '').map((f) => f.id)),
  )
  // Lô chọn tay trong phiên này: ghi nhãn trên nút ngay cả khi trang cha chưa nạp vào `batchesBySlug`.
  const [pickedBatches, setPickedBatches] = useState<ReadonlyMap<string, MaterialBatch>>(new Map())

  const stockBySlug = new Map(stock.map((i) => [i.materialSlug, i]))
  const shortageByIndex = new Map(shortages.map((s) => [s.index, s]))
  const options: ComboboxOption[] = [
    ...stock.map((i) => ({
      value: i.materialSlug,
      label: `${i.materialCode} · ${i.materialName}`,
      disabled: i.availableQuantity <= 0,
    })),
    // Chỉ để ô hiện nhãn của dòng đã lưu — không chọn mới được (không biết khả dụng / đơn vị quy đổi).
    ...[...fallbackMaterials]
      .filter(([slug]) => !stockBySlug.has(slug))
      .map(([slug, m]) => ({ value: slug, label: `${m.code} · ${m.name}`, disabled: true })),
  ]

  /** Mục của ô xổ vật tư: mã (đậm) · tên | khả dụng + đơn vị gốc (hoặc "Hết hàng") | các mã đơn vị. */
  const renderMaterialOption = (option: ComboboxOption) => {
    const m = stockBySlug.get(option.value)
    if (!m) return <span className="min-w-0 break-words">{option.label}</span>
    return (
      <span className="@container block w-full min-w-0">
        <span className="grid items-start gap-x-4 gap-y-0.5 @2xl:grid-cols-[minmax(0,1fr)_12rem_8rem]">
          <span className="min-w-0 break-words">
            <span className="font-semibold">{m.materialCode}</span> · {m.materialName}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums @2xl:pt-0.5 @2xl:text-right">
            {m.availableQuantity <= 0
              ? t('exportForms:outOfStock')
              : t('exportForms:available', {
                  value: `${formatQuantity(m.availableQuantity)} ${m.baseUnit?.code ?? ''}`.trim(),
                })}
          </span>
          <span className="text-muted-foreground min-w-0 text-xs break-words @2xl:pt-0.5">
            {m.units.map((u) => u.unitCode).join(', ')}
          </span>
        </span>
      </span>
    )
  }

  /** Vật tư → dòng (lấp dòng trống hẳn trước, rồi nối cuối, tối đa 200). Chỉ đụng dòng đổi để giữ ghi chú đang mở của dòng khác. */
  const addLines = (picked: InventoryItem[]): number | null => {
    const current = form.getValues('items')
    const { items: next, firstIndex } = addPickedExportLines(current, picked)
    const opts = { shouldDirty: true, shouldValidate: form.formState.isSubmitted }
    const filledIds = new Set<string>()
    next.slice(0, current.length).forEach((item, i) => {
      if (item === current[i]) return
      form.setValue(`items.${i}`, item, opts)
      const id = fields[i]?.id
      if (id) filledIds.add(id)
    })
    // Dòng được lấp là dòng mới hoàn toàn: ô ghi chú (trống) đang mở của nó không còn nghĩa.
    if (filledIds.size > 0)
      setOpenNotes((prev) => {
        const kept = new Set([...prev].filter((id) => !filledIds.has(id)))
        return kept.size === prev.size ? prev : kept
      })
    if (next.length > current.length) append(next.slice(current.length), { shouldFocus: false })
    return firstIndex
  }

  // Hộp "Chọn nhiều vật tư": số chỗ còn = 200 − số dòng KHÔNG trống hẳn. "Đã có" = vật tư đã có dòng lô tự chọn.
  const [pickerOpen, setPickerOpen] = useState(false)
  const autoSlugs = new Set(
    items.filter((i) => i.materialSlug !== '' && i.batchSlug === '').map((i) => i.materialSlug),
  )
  const capacity = EXPORT_FORM_ITEMS_MAX - items.filter((i) => !isBlankExportLine(i)).length
  // Hộp không có DialogTrigger nên Radix không trả focus khi đóng: thêm xong → ô Số lượng dòng mới đầu tiên; không thêm
  // gì → nút mở hộp, nút đó đã ẩn (hết chỗ) thì tiêu đề — không để focus rơi về body.
  const focusAfterPick = useRef<`items.${number}.quantity` | null>(null)
  const pickerWasOpen = useRef(false)
  useEffect(() => {
    if (pickerOpen) {
      pickerWasOpen.current = true
      return
    }
    if (!pickerWasOpen.current) return
    pickerWasOpen.current = false
    const target = focusAfterPick.current
    focusAfterPick.current = null
    if (target) {
      form.setFocus(target)
      return
    }
    ;(pickButtonRef.current ?? headingRef.current)?.focus()
  }, [pickerOpen, form])
  const onPicked = (picked: InventoryItem[]) => {
    const firstIndex = addLines(picked)
    if (firstIndex !== null) focusAfterPick.current = `items.${firstIndex}.quantity`
  }

  const full = fields.length >= EXPORT_FORM_ITEMS_MAX
  const rootError =
    form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message
  const stockNote = stockTotal > EXPORT_STOCK_SIZE

  // Bọc chung một <span>: FormLabel là flex container, khoảng trắng ngăn cách đặt ở text node của chính
  // <span> này → tên khả truy cập là "Vật tư dòng 1".
  const lineLabel = (text: string, index: number) => (
    <span>
      {text} <span className="sr-only">{t('exportForms:lineLabel', { line: index + 1 })}</span>
    </span>
  )

  return (
    <section ref={sectionRef} className="@container space-y-3" aria-labelledby={`${hintId}-title`}>
      {/* `tabIndex={-1}`: sheet focus tiêu đề này khi chuyển sang bước ②. */}
      <h2
        ref={headingRef}
        id={`${hintId}-title`}
        tabIndex={-1}
        className="font-heading text-base font-semibold outline-none"
      >
        {t('exportForms:items')}
      </h2>

      <div aria-hidden className={`${bp.head} ${bp.grid}`}>
        <span>{t('exportForms:lineNo')}</span>
        <span>{t('exportForms:fieldMaterial')}</span>
        <span>{t('exportForms:fieldBatch')}</span>
        <span>{t('exportForms:fieldQuantity')}</span>
        <span>{t('exportForms:fieldUnit')}</span>
        {sale && <span>{t('exportForms:fieldUnitPrice')}</span>}
        {sale && <span className="text-right">{t('exportForms:fieldAmount')}</span>}
        <span className="w-18" />
      </div>

      {fields.map((field, index) => {
        const row = items[index] ?? EMPTY_EXPORT_ITEM
        const material = stockBySlug.get(row.materialSlug)
        const unit = material?.units.find((u) => u.unitSlug === row.unitSlug)
        // Vật tư ngoài `stock`: đơn vị đã lưu của dòng (ô Đơn vị vẫn khoá — không có tỉ lệ quy đổi).
        const unitChoices = material?.units ?? fallbackMaterials.get(row.materialSlug)?.units ?? []
        const shownUnit = unitChoices.find((u) => u.unitSlug === row.unitSlug)
        const unitCode = shownUnit?.unitCode
        const amount =
          typeof row.quantity === 'number' && typeof row.unitPrice === 'number'
            ? roundMoney(row.quantity * row.unitPrice)
            : undefined
        const noteOpen = openNotes.has(field.id)
        const shortage = shortageByIndex.get(index)
        const shortageId = `${hintId}-short-${field.id}`
        const batch = row.batchSlug
          ? (pickedBatches.get(row.batchSlug) ?? batchesBySlug.get(row.batchSlug))
          : undefined

        return (
          <div key={field.id} data-testid={`line-${index}`} className={`${bp.row} ${bp.grid}`}>
            <span className="text-muted-foreground pt-2 text-sm tabular-nums">{index + 1}</span>

            <FormField
              control={form.control}
              name={`items.${index}.materialSlug`}
              render={({ field: f }) => (
                <FormItem required>
                  <FormLabel className={bp.label}>
                    {lineLabel(t('exportForms:fieldMaterial'), index)}
                  </FormLabel>
                  <FormControl>
                    <Combobox
                      ref={f.ref}
                      options={options}
                      widthAnchor={sectionRef}
                      listClassName="max-h-[60vh]"
                      minListSpace={Math.round(window.innerHeight * 0.6)}
                      renderOption={renderMaterialOption}
                      value={f.value || undefined}
                      onChange={(next) => {
                        f.onChange(next ?? '')
                        // Đơn vị và lô của vật tư cũ không áp dụng cho vật tư mới → đơn vị gốc, lô tự chọn.
                        const opts = {
                          shouldDirty: true,
                          shouldValidate: form.formState.isSubmitted,
                        }
                        const chosen = next ? stockBySlug.get(next) : undefined
                        form.setValue(
                          `items.${index}.unitSlug`,
                          chosen ? baseUnitSlugOf(chosen) : '',
                          opts,
                        )
                        form.setValue(`items.${index}.batchSlug`, '', opts)
                      }}
                      placeholder={t('exportForms:materialPlaceholder')}
                      searchPlaceholder={t('exportForms:materialSearch')}
                      emptyText={t('exportForms:materialEmpty')}
                      footer={
                        stockNote
                          ? () => (
                              <p className="text-muted-foreground px-2 py-1.5 text-xs">
                                {t('exportForms:stockLimitNote', { count: EXPORT_STOCK_SIZE })}
                              </p>
                            )
                          : undefined
                      }
                    />
                  </FormControl>
                  {material && (
                    <p className="text-muted-foreground text-xs">
                      {t('exportForms:available', {
                        value:
                          `${formatQuantity(material.availableQuantity)} ${material.baseUnit?.code ?? ''}`.trim(),
                      })}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`items.${index}.batchSlug`}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel className={bp.label}>
                    {lineLabel(t('exportForms:fieldBatch'), index)}
                  </FormLabel>
                  <FormControl>
                    <BatchSelect
                      ref={f.ref}
                      value={f.value}
                      selected={batch}
                      warehouseSlug={warehouseSlug}
                      materialSlug={row.materialSlug}
                      baseUnitCode={material?.baseUnit?.code ?? ''}
                      canPickBatch={canPickBatch}
                      disabled={!material}
                      onChange={(next, picked) => {
                        if (picked) {
                          setPickedBatches((prev) => new Map(prev).set(picked.slug, picked))
                          onBatchPicked?.(picked)
                        }
                        f.onChange(next)
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`items.${index}.quantity`}
              render={({ field: f }) => (
                <FormItem required className="min-w-0">
                  <FormLabel className={bp.label}>
                    {lineLabel(t('exportForms:fieldQuantity'), index)}
                  </FormLabel>
                  <FormControl>
                    <NumberInput
                      ref={f.ref}
                      value={f.value}
                      onChange={f.onChange}
                      onBlur={f.onBlur}
                      aria-describedby={shortage ? shortageId : undefined}
                    />
                  </FormControl>
                  {unit && !unit.isBaseUnit && row.quantity !== undefined && material?.baseUnit && (
                    <p className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
                      {t('exportForms:converted', {
                        value: `${formatQuantity(row.quantity * unit.conversionRate)} ${material.baseUnit.code}`,
                      })}
                    </p>
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
                  <FormLabel className={bp.label}>
                    {lineLabel(t('exportForms:fieldUnit'), index)}
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
                        ref={f.ref}
                        className="w-full"
                        title={
                          shownUnit ? `${shownUnit.unitCode} · ${shownUnit.unitName}` : undefined
                        }
                        aria-label={`${t('exportForms:fieldUnit')} ${t('exportForms:lineLabel', { line: index + 1 })}`}
                      >
                        {/* Ô hẹp: chỉ hiện MÃ đơn vị, tên đầy đủ ở danh sách thả xuống và `title`. */}
                        <SelectValue placeholder={t('exportForms:unitPlaceholder')}>
                          {unitCode}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {unitChoices.map((u) => (
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

            {/* Controller giá luôn được gắn (cột ẩn thì không vẽ gì): gỡ rồi gắn lại làm RHF đặt lại giá MẶC ĐỊNH của
                form (nháp đã tải có giá) vào giá trị — giá đã xoá "hồi sinh" trong dữ liệu dù ô trống. */}
            <FormField
              control={form.control}
              name={`items.${index}.unitPrice`}
              render={({ field: f }) =>
                sale ? (
                  <FormItem required>
                    <FormLabel className={bp.label}>
                      {lineLabel(t('exportForms:fieldUnitPrice'), index)}
                    </FormLabel>
                    <FormControl>
                      <MoneyInput
                        ref={f.ref}
                        // Đọc từ `items` đang theo dõi, không từ `f.value`: giá đã xoá là undefined thì Controller / useWatch
                        // theo tên lấy lại giá trị MẶC ĐỊNH của form — giá cũ "hồi sinh" trên màn hình.
                        value={row.unitPrice}
                        onChange={f.onChange}
                        onBlur={f.onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                ) : (
                  <></>
                )
              }
            />

            {sale && (
              <div className="flex min-w-0 items-center justify-between gap-2 @4xl:block @4xl:pt-2 @4xl:text-right">
                <span className="text-muted-foreground text-sm @4xl:sr-only">
                  {t('exportForms:fieldAmount')}
                </span>
                {/* Số tiền rất lớn xuống dòng trong cột thay vì đè lên nút ghi chú / xoá (cột có bề rộng tối thiểu cố định). */}
                <span
                  data-testid={`line-amount-${index}`}
                  className="min-w-0 text-right text-sm font-medium tabular-nums [overflow-wrap:anywhere]"
                >
                  {formatCurrency(amount, { maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className={bp.actions}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-pressed={noteOpen}
                aria-label={t('exportForms:toggleLineNote', { line: index + 1 })}
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
                aria-label={t('exportForms:removeLine', { line: index + 1 })}
                onClick={() => remove(index)}
              >
                <XIcon aria-hidden />
              </Button>
            </div>

            {shortage && (
              <p id={shortageId} className={bp.shortage}>
                {t('exportForms:shortage', {
                  available: formatQuantity(shortage.available),
                  unit: shortage.baseUnitCode ?? '',
                })}
              </p>
            )}

            {noteOpen && (
              <FormField
                control={form.control}
                name={`items.${index}.note`}
                render={({ field: f }) => (
                  <FormItem className={bp.span}>
                    <FormLabel>{lineLabel(t('exportForms:fieldLineNote'), index)}</FormLabel>
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
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={full}
            aria-describedby={full ? `${hintId}-full` : undefined}
            onClick={() => append({ ...EMPTY_EXPORT_ITEM })}
          >
            <PlusIcon aria-hidden />
            {t('exportForms:addLine')}
          </Button>
          {capacity > 0 && (
            <Button
              ref={pickButtonRef}
              type="button"
              variant="outline"
              onClick={() => setPickerOpen(true)}
            >
              <ListChecksIcon aria-hidden />
              {t('exportForms:pickManyMaterials')}
            </Button>
          )}
        </div>
        {full && (
          <p id={`${hintId}-full`} className="text-muted-foreground text-xs">
            {t('exportForms:itemsMaxReached')}
          </p>
        )}
      </div>

      <ExportFormMaterialPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        stock={stock}
        stockTotal={stockTotal}
        autoSlugs={autoSlugs}
        capacity={capacity}
        onConfirm={onPicked}
      />
    </section>
  )
}
