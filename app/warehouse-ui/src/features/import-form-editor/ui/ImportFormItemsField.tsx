import { NotebookPenIcon, PlusIcon, XIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { translateFormMessage } from '@/shared/lib/form-message'
import { formatCurrency, formatQuantity } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Combobox, type ComboboxOption } from '@/shared/ui/Combobox'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { NumberInput } from '@/shared/ui/NumberInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { AvailableMaterial } from '@/entities/import-form'
import {
  EMPTY_ITEM,
  IMPORT_FORM_ITEMS_MAX,
  baseUnitOf,
  lineAmount,
  type ImportFormValues,
} from '../model/import-form-editor.schema'

type Props = {
  form: UseFormReturn<ImportFormValues>
  materials: AvailableMaterial[]
  /** Vật tư của dòng cũ không còn trong danh sách (bị gỡ khỏi kho / ngoài 100 bản ghi đầu): slug → "mã · tên". */
  fallbackLabels: Record<string, string>
}

/** Lưới 7 cột từ `md`; dưới `md` mỗi dòng là một thẻ xếp dọc, nhãn ô hiện ra. */
const ROW_GRID =
  'grid gap-3 rounded-lg border p-3 md:grid-cols-[2rem_minmax(12rem,2fr)_minmax(7rem,1fr)_minmax(6rem,1fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_auto] md:items-start md:rounded-none md:border-0 md:border-b md:px-0'

export function ImportFormItemsField({ form, materials, fallbackLabels }: Props) {
  const { t } = useTranslation(['importForms', 'common'])
  const hintId = useId()
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const items = useWatch({ control: form.control, name: 'items' })
  const [openNotes, setOpenNotes] = useState<ReadonlySet<string>>(new Set())

  const bySlug = new Map(materials.map((m) => [m.slug, m]))
  const baseSlugOf = (slug: string | undefined) => {
    const m = slug ? bySlug.get(slug) : undefined
    return m ? (baseUnitOf(m)?.unitSlug ?? '') : ''
  }
  const options: ComboboxOption[] = [
    ...Object.entries(fallbackLabels)
      .filter(([slug]) => !bySlug.has(slug))
      .map(([value, label]) => ({ value, label })),
    ...materials.map((m) => ({ value: m.slug, label: `${m.code} · ${m.name}` })),
  ]
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
    <section className="space-y-3" aria-labelledby={`${hintId}-title`}>
      <h2 id={`${hintId}-title`} className="font-heading text-base font-semibold">
        {t('importForms:items')}
      </h2>

      <div
        aria-hidden
        className="text-muted-foreground hidden border-b pb-2 text-sm md:grid md:grid-cols-[2rem_minmax(12rem,2fr)_minmax(7rem,1fr)_minmax(6rem,1fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_auto] md:gap-3"
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
        const amount = lineAmount(row.quantity, row.unitPrice)
        const noteOpen = openNotes.has(field.id) || row.note !== ''

        return (
          <div key={field.id} data-testid={`line-${index}`} className={ROW_GRID}>
            <span className="text-muted-foreground pt-2 text-sm tabular-nums">{index + 1}</span>

            <FormField
              control={form.control}
              name={`items.${index}.materialSlug`}
              render={({ field: f }) => (
                <FormItem required>
                  <FormLabel className="md:sr-only">
                    {lineLabel(t('importForms:fieldMaterial'), index)}
                  </FormLabel>
                  <FormControl>
                    <Combobox
                      options={options}
                      value={f.value || undefined}
                      onChange={(next) => {
                        f.onChange(next ?? '')
                        // Đơn vị của vật tư cũ không áp dụng cho vật tư mới (backend 101326) → về đơn vị gốc.
                        form.setValue(`items.${index}.unitSlug`, baseSlugOf(next), {
                          shouldDirty: true,
                          shouldValidate: form.formState.isSubmitted,
                        })
                      }}
                      placeholder={t('importForms:materialPlaceholder')}
                      searchPlaceholder={t('importForms:materialSearch')}
                      emptyText={t('importForms:materialEmpty')}
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`items.${index}.unitSlug`}
              render={({ field: f }) => (
                <FormItem required>
                  <FormLabel className="md:sr-only">
                    {lineLabel(t('importForms:fieldUnit'), index)}
                  </FormLabel>
                  <Select value={f.value} onValueChange={f.onChange} disabled={!material}>
                    <FormControl>
                      <SelectTrigger
                        className="w-full"
                        aria-label={`${t('importForms:fieldUnit')} ${t('importForms:lineLabel', { line: index + 1 })}`}
                      >
                        <SelectValue placeholder={t('importForms:unitPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
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
                  <FormLabel className="md:sr-only">
                    {lineLabel(t('importForms:fieldQuantity'), index)}
                  </FormLabel>
                  <FormControl>
                    <NumberInput value={f.value} onChange={f.onChange} onBlur={f.onBlur} />
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
                  <FormLabel className="md:sr-only">
                    {lineLabel(t('importForms:fieldUnitPrice'), index)}
                  </FormLabel>
                  <FormControl>
                    <NumberInput value={f.value} onChange={f.onChange} onBlur={f.onBlur} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between gap-2 md:block md:pt-2 md:text-right">
              <span className="text-muted-foreground text-sm md:sr-only">
                {t('importForms:fieldAmount')}
              </span>
              <span
                data-testid={`line-amount-${index}`}
                className="text-sm font-medium tabular-nums"
              >
                {formatCurrency(amount, { maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex gap-1 md:pt-0.5">
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
                  <FormItem className="md:col-start-2 md:col-end-7">
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
    </section>
  )
}
