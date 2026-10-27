import { useId, useRef, type KeyboardEvent } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
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
import { EXPORT_FORM_TYPES, type ExportFormType } from '@/entities/export-form'
import { ExportFormFileField } from './ExportFormFileField'
import { ReceiverField } from './ReceiverField'
import type { ExportFormValues } from '../model/export-form-editor.schema'

type ExportFormInfoStepProps = {
  form: UseFormReturn<ExportFormValues>
  warehouseSlug: string
  /** Có `WAREHOUSE_READ`: Chuyển kho được chọn kho đích từ danh sách. */
  canReadWarehouses: boolean
  onUploadingChange: (uploading: boolean) => void
  /**
   * Gọi TRƯỚC khi đổi lý do xuất; trả `false` để huỷ việc đổi (sheet hỏi xác nhận khi rời Bán). Chỉ gọi khi `next`
   * khác lý do hiện tại.
   */
  onTypeChange: (next: ExportFormType, prev: ExportFormType | undefined) => boolean
}

/**
 * Bước ① của sheet phiếu xuất: tiêu đề bước (`tabIndex={-1}` để sheet focus khi đổi bước) + các ô đầu phiếu. Khối
 * `<section>` bao ngoài (và `hidden`) thuộc về sheet.
 */
export function ExportFormInfoStep({
  form,
  warehouseSlug,
  canReadWarehouses,
  onUploadingChange,
  onTypeChange,
}: ExportFormInfoStepProps) {
  const { t } = useTranslation(['exportForms'])
  const labelId = useId()
  const radios = useRef<(HTMLButtonElement | null)[]>([])
  const type = form.watch('type')

  return (
    <>
      <h2 tabIndex={-1} className="font-heading text-base font-semibold outline-none">
        {t('exportForms:stepInfo')}
      </h2>
      {/* `items-start`: FormItem là grid — bị kéo giãn theo ô cao nhất hàng thì nhãn và ô nhập bên cạnh bị lệch. */}
      <div className="grid items-start gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => {
            const select = (next: ExportFormType, focus = false) => {
              if (next !== field.value && onTypeChange(next, field.value) === false) return
              field.onChange(next)
              if (focus) radios.current[EXPORT_FORM_TYPES.indexOf(next)]?.focus()
            }
            const onKeyDown = (e: KeyboardEvent) => {
              const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
              if (step === undefined) return
              e.preventDefault()
              const at = field.value ? EXPORT_FORM_TYPES.indexOf(field.value) : -1
              const count = EXPORT_FORM_TYPES.length
              select(EXPORT_FORM_TYPES[(at + step + count) % count], true)
            }
            // Roving tabindex: chỉ nút đang chọn (hoặc nút đầu khi chưa chọn) nằm trong thứ tự Tab — và nhận `field.ref`
            // để focus lỗi đúng chỗ.
            const tabbable = field.value ? EXPORT_FORM_TYPES.indexOf(field.value) : 0
            return (
              <FormItem required className="sm:col-span-full">
                <FormLabel id={labelId}>{t('exportForms:fieldType')}</FormLabel>
                <FormControl>
                  <div
                    role="radiogroup"
                    aria-labelledby={labelId}
                    className="flex flex-wrap gap-2"
                    onKeyDown={onKeyDown}
                  >
                    {EXPORT_FORM_TYPES.map((value, i) => {
                      const checked = field.value === value
                      return (
                        <Button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          variant={checked ? 'default' : 'outline'}
                          tabIndex={i === tabbable ? 0 : -1}
                          ref={(node) => {
                            radios.current[i] = node
                            if (i === tabbable) field.ref(node)
                          }}
                          className={cn(!checked && 'font-normal')}
                          onClick={() => select(value)}
                          onBlur={field.onBlur}
                        >
                          {t(`exportForms:type.${value}`)}
                        </Button>
                      )
                    })}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )
          }}
        />
        {/* Gắn `key` theo lý do: đổi lý do thì ô người nhận bỏ trạng thái "nhập tay" cũ. */}
        <ReceiverField
          key={type ?? 'none'}
          form={form}
          warehouseSlug={warehouseSlug}
          canReadWarehouses={canReadWarehouses}
        />
        <FormField
          control={form.control}
          name="purchaseOrder"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('exportForms:fieldPurchaseOrder')}</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="invoiceCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('exportForms:fieldInvoiceCode')}</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="sm:col-span-2">
          <ExportFormFileField
            form={form}
            warehouseSlug={warehouseSlug}
            onUploadingChange={onUploadingChange}
          />
        </div>
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem className="sm:col-span-full">
              <FormLabel>{t('exportForms:fieldNote')}</FormLabel>
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
              <FormLabel>{t('exportForms:fieldCode')}</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" />
              </FormControl>
              <FormDescription>{t('exportForms:fieldCodeHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  )
}
