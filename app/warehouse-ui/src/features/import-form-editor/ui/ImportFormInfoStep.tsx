import { useEffect, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Combobox, type ComboboxOption } from '@/shared/ui/Combobox'
import { DatePicker } from '@/shared/ui/DatePicker'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { ImportFormFileField } from './ImportFormFileField'
import type { ImportFormValues } from '../model/import-form-editor.schema'
import { countFollowingLines } from '../model/supplier'

type ImportFormInfoStepProps = {
  form: UseFormReturn<ImportFormValues>
  /** Có SUPPLIER_READ: hiện ô Bên bán (bắt buộc). */
  canPickSupplier: boolean
  supplierOptions: ComboboxOption[]
  onUploadingChange: (uploading: boolean) => void
}

/**
 * Bước ① của sheet phiếu nhập: tiêu đề bước (`tabIndex={-1}` để sheet focus khi đổi bước) + các ô đầu phiếu. Khối
 * `<section>` bao ngoài (và `hidden`) thuộc về sheet.
 */
export function ImportFormInfoStep({
  form,
  canPickSupplier,
  supplierOptions,
  onUploadingChange,
}: ImportFormInfoStepProps) {
  const { t } = useTranslation(['importForms'])
  const [changedLines, setChangedLines] = useState<number | null>(null)

  // Dòng "Đã đổi bên bán…" mất khi sửa ô khác (hoặc form được reset).
  useEffect(() => {
    const sub = form.watch((_, { name }) => {
      if (name !== 'supplierSlug') setChangedLines(null)
    })
    return () => sub.unsubscribe()
  }, [form])

  return (
    <>
      <h2 tabIndex={-1} className="font-heading text-base font-semibold outline-none">
        {t('importForms:stepSeller')}
      </h2>
      {/* `items-start`: FormItem là grid — bị kéo giãn theo ô cao nhất hàng (Mã phiếu có dòng gợi ý) thì
          nhãn và ô nhập của các ô bên cạnh bị đẩy lệch xuống. */}
      <div className="grid items-start gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {canPickSupplier && (
          <FormField
            control={form.control}
            name="supplierSlug"
            render={({ field }) => (
              <FormItem required>
                <FormLabel>{t('importForms:supplier')}</FormLabel>
                <FormControl>
                  <Combobox
                    ref={field.ref}
                    options={supplierOptions}
                    value={field.value || undefined}
                    onChange={(next) => {
                      const value = next ?? ''
                      if (value === field.value) return
                      field.onChange(value)
                      const count = countFollowingLines(form.getValues())
                      setChangedLines(count > 0 ? count : null)
                    }}
                    placeholder={t('importForms:supplierPlaceholder')}
                  />
                </FormControl>
                {changedLines !== null && (
                  <FormDescription>
                    {t('importForms:supplierChangedLines', { count: changedLines })}
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="invoiceCode"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('importForms:fieldInvoiceCode')}</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('importForms:fieldDate')}</FormLabel>
              <FormControl>
                <DatePicker ref={field.ref} value={field.value} onChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="sm:col-span-2">
          <ImportFormFileField form={form} onUploadingChange={onUploadingChange} />
        </div>
        <FormField
          control={form.control}
          name="purchaseOrder"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('importForms:fieldPurchaseOrder')}</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem className="sm:col-span-full">
              <FormLabel>{t('importForms:fieldNote')}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('importForms:fieldCode')}</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" />
              </FormControl>
              <FormDescription>{t('importForms:fieldCodeHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  )
}
