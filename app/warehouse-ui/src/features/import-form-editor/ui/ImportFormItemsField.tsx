import { ListChecksIcon, NotebookPenIcon, PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ComponentType } from 'react'
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
import { addPickedLines, isBlankLine } from '../model/add-picked-lines'
import { splitBySupplier } from '../model/material-groups'
import { ImportFormMaterialPicker } from './ImportFormMaterialPicker'
import { useDebouncedValue } from './useDebouncedValue'

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
  // Neo bề rộng của ô xổ vật tư: mọi dòng (lưới hay thẻ) đều rộng bằng khung này.
  const sectionRef = useRef<HTMLElement | null>(null)
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  // Đích focus khi hộp "Chọn vật tư" đóng mà không thêm dòng: nút mở hộp, nút đó đã ẩn thì tiêu đề.
  const pickButtonRef = useRef<HTMLButtonElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
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
  // `index: null` = mở từ hộp "Chọn vật tư": vật tư vừa thêm thành dòng mới (lấp dòng trống đầu tiên trước).
  const [adding, setAdding] = useState<{ index: number | null; search: string } | null>(null)
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
    if (adding.index === null) {
      addLines([{ slug: added.slug, baseUnitSlug: added.baseUnit?.slug ?? '' }])
      return
    }
    const opts = { shouldDirty: true, shouldValidate: form.formState.isSubmitted }
    form.setValue(`items.${adding.index}.materialSlug`, added.slug, opts)
    form.setValue(`items.${adding.index}.unitSlug`, added.baseUnit?.slug ?? '', opts)
  }
  /** Vật tư → dòng (lấp dòng trống hẳn trước, rồi nối cuối, tối đa 200). Chỉ đụng dòng đổi để giữ id / ghi chú đang mở của dòng khác. */
  const addLines = (picks: { slug: string; baseUnitSlug: string }[]): number | null => {
    const currentItems = form.getValues('items')
    const { items: next, firstIndex } = addPickedLines(currentItems, picks)
    const opts = { shouldDirty: true, shouldValidate: form.formState.isSubmitted }
    const filledIds = new Set<string>()
    next.slice(0, currentItems.length).forEach((item, i) => {
      if (item === currentItems[i]) return
      form.setValue(`items.${i}`, item, opts)
      const id = fields[i]?.id
      if (id) filledIds.add(id)
    })
    // Dòng được lấp là dòng mới hoàn toàn: ô ghi chú (trống) / ô đổi bên bán đang mở của nó không còn nghĩa.
    if (filledIds.size > 0) {
      const without = (prev: ReadonlySet<string>) => {
        const kept = new Set([...prev].filter((id) => !filledIds.has(id)))
        return kept.size === prev.size ? prev : kept
      }
      setOpenNotes(without)
      setPickingSupplier(without)
    }
    if (next.length > currentItems.length)
      append(next.slice(currentItems.length), { shouldFocus: false })
    return firstIndex
  }

  // Hộp "Chọn vật tư": số chỗ còn = 200 − số dòng KHÔNG trống hẳn (chỉ dòng trống hẳn được lấp). Đếm dòng, không đếm
  // vật tư (một vật tư có thể ở nhiều dòng khác đơn vị).
  const [pickerOpen, setPickerOpen] = useState(false)
  const existingSlugs = new Set(items.map((i) => i.materialSlug).filter((slug) => slug !== ''))
  const capacity = IMPORT_FORM_ITEMS_MAX - items.filter((i) => !isBlankLine(i)).length
  // Hộp không có DialogTrigger nên Radix không trả focus khi đóng: thêm xong → ô Số lượng dòng mới đầu tiên; không thêm
  // gì → nút mở hộp; nút đó đã ẩn (hết chỗ, vd vừa thêm qua footer của hộp) thì tiêu đề — không để focus rơi về body.
  // Không lùi về "Thêm dòng": hết chỗ nghĩa là đủ 200 dòng nên nút đó luôn đang khoá.
  const focusAfterPick = useRef<`items.${number}.quantity` | null>(null)
  const pickerWasOpen = useRef(false)
  const pickerFooterRef = useRef<HTMLButtonElement | null>(null)
  const pickerContentRef = useRef<HTMLDivElement | null>(null)
  // Hộp thêm vật tư mở từ footer của hộp chọn đóng lại → Radix trả focus về nút footer; nút đó có thể đã ẩn (hết chỗ)
  // thì focus rơi về <body>, ngoài hộp chọn. Trả vào footer, không có thì vào chính hộp. Chạy sau timeout của Radix.
  const addingFromPicker = adding !== null && adding.index === null
  const wasAddingFromPicker = useRef(false)
  useEffect(() => {
    if (addingFromPicker) {
      wasAddingFromPicker.current = true
      return
    }
    if (!wasAddingFromPicker.current) return
    wasAddingFromPicker.current = false
    const timer = setTimeout(() => {
      const content = pickerContentRef.current
      if (!content || content.contains(document.activeElement)) return
      const footer = pickerFooterRef.current
      ;(footer && content.contains(footer) ? footer : content).focus()
    }, 0)
    return () => clearTimeout(timer)
  }, [addingFromPicker])
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
    const fallback = pickButtonRef.current ?? headingRef.current
    fallback?.focus()
  }, [pickerOpen, form])
  const onPicked = (chosen: AvailableMaterial[]) => {
    setPicked((prev) => {
      const next = new Map(prev)
      chosen.forEach((m) => next.set(m.slug, m))
      return next
    })
    chosen.forEach((m) => onMaterialPicked?.(m))
    const firstIndex = addLines(
      chosen.map((m) => ({ slug: m.slug, baseUnitSlug: baseUnitOf(m)?.unitSlug ?? '' })),
    )
    if (firstIndex !== null) focusAfterPick.current = `items.${firstIndex}.quantity`
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
    const { usual, rest } = splitBySupplier(source, supplierSlug)
    return [
      {
        heading: t('importForms:groupSupplierMaterials', { name: supplierName(supplierSlug) }),
        options: usual.map(toOption),
      },
      { heading: t('importForms:groupOtherMaterials'), options: [...extra, ...rest.map(toOption)] },
    ].filter((g) => g.options.length > 0)
  }
  /**
   * Mục của ô xổ vật tư: mã (đậm) · tên (xuống dòng) | tồn + đơn vị gốc | các mã đơn vị. Vật tư lạ (dự phòng) chỉ có nhãn.
   * Cột theo bề rộng thật của danh sách (`@container`, danh sách rộng bằng bảng dòng chứ không bằng cửa sổ) và có bề rộng
   * cố định — mỗi mục là một lưới riêng, cột `auto` sẽ lệch nhau giữa các mục và bóp tên khi tồn / đơn vị dài.
   */
  const renderMaterialOption = (option: ComboboxOption) => {
    const m = bySlug.get(option.value)
    if (!m) return <span className="min-w-0 break-words">{option.label}</span>
    const baseCode = baseUnitOf(m)?.unitCode ?? ''
    return (
      <span className="@container block w-full min-w-0">
        <span className="grid items-start gap-x-4 gap-y-0.5 @2xl:grid-cols-[minmax(0,1fr)_12rem_8rem]">
          <span className="min-w-0 break-words">
            <span className="font-semibold">{m.code}</span> · {m.name}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums @2xl:pt-0.5 @2xl:text-right">
            {t('importForms:stock', { value: `${formatQuantity(m.quantity)} ${baseCode}`.trim() })}
          </span>
          <span className="text-muted-foreground min-w-0 text-xs break-words @2xl:pt-0.5">
            {m.units.map((u) => u.unitCode).join(', ')}
          </span>
        </span>
      </span>
    )
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
    <section ref={sectionRef} className="@container space-y-3" aria-labelledby={`${hintId}-title`}>
      {/* `tabIndex={-1}`: sheet focus tiêu đề này khi chuyển sang bước ②. */}
      <h2
        ref={headingRef}
        id={`${hintId}-title`}
        tabIndex={-1}
        className="font-heading text-base font-semibold outline-none"
      >
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
                      ref={f.ref}
                      options={options}
                      groups={groupsFor(lineSupplier)}
                      serverFiltered={searching}
                      widthAnchor={sectionRef}
                      listClassName="max-h-[60vh]"
                      minListSpace={Math.round(window.innerHeight * 0.6)}
                      renderOption={renderMaterialOption}
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
                        ref={f.ref}
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
        <div className="flex flex-wrap gap-2">
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
          {capacity > 0 && (
            <Button
              ref={pickButtonRef}
              type="button"
              variant="outline"
              onClick={() => setPickerOpen(true)}
            >
              <ListChecksIcon aria-hidden />
              {t('importForms:pickManyMaterials')}
            </Button>
          )}
        </div>
        {full && (
          <p id={`${hintId}-full`} className="text-muted-foreground text-xs">
            {t('importForms:itemsMaxReached')}
          </p>
        )}
      </div>

      <ImportFormMaterialPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        warehouseSlug={warehouseSlug}
        materials={materials}
        headerSupplierSlug={headerSupplier ?? ''}
        supplierName={supplierName}
        existingSlugs={existingSlugs}
        capacity={capacity}
        onConfirm={onPicked}
        contentRef={pickerContentRef}
        addMaterialFooter={
          materialAbilities.search && AddMaterialDialog
            ? (search) => (
                <Button
                  ref={pickerFooterRef}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start px-3"
                  onClick={() => setAdding({ index: null, search })}
                >
                  <PlusIcon aria-hidden />
                  {t('importForms:addMaterialEntry')}
                </Button>
              )
            : undefined
        }
      />

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
              ? (adding.index === null
                  ? headerSupplier
                  : effectiveSupplier(
                      { ...form.getValues(), supplierSlug: headerSupplier ?? '', items },
                      adding.index,
                    )) || undefined
              : undefined
          }
          onAdded={onMaterialAdded}
        />
      )}
    </section>
  )
}
