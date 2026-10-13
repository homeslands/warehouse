import { zodResolver } from '@hookform/resolvers/zod'
import { ClipboardListIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { formatCurrency } from '@/shared/lib/format'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SummaryList } from '@/shared/ui/SummaryList'
import { Textarea } from '@/shared/ui/textarea'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import {
  isStaleImportFormError,
  useAvailableMaterials,
  useCreateImportForm,
  useUpdateImportForm,
  type ImportForm,
} from '@/entities/import-form'
import { ImportFormFileField } from './ImportFormFileField'
import { ImportFormItemsField } from './ImportFormItemsField'
import { LeaveGuard } from './LeaveGuard'
import {
  emptyFormValues,
  formTotal,
  importFormSchema,
  toCreateInput,
  toFormValues,
  toUpdateInput,
  type ImportFormValues,
} from '../model/import-form-editor.schema'

const FIELD_BY_CODE = {
  101302: 'code',
  101303: 'code',
  101304: 'code',
  101305: 'code',
  101306: 'purchaseOrder',
  101307: 'invoiceCode',
  101308: 'invoiceCode',
  101310: 'date',
  101312: 'file',
} as const

type ImportFormEditorProps = {
  warehouseSlug: string
  form?: ImportForm
  onSaved: (saved: ImportForm) => void
  onCancel: () => void
  onConflict: () => void
}

/**
 * Trang form phiếu nhập (tạo + sửa). Trang cha render component này SAU khi đã có dữ liệu và đặt
 * `key={slug:version}` để giá trị mặc định dựng lại khi phiếu đổi.
 */
export function ImportFormEditor({
  warehouseSlug,
  form: original,
  onSaved,
  onCancel,
  onConflict,
}: ImportFormEditorProps) {
  const { t } = useTranslation(['importForms', 'common'])
  const materials = useAvailableMaterials(warehouseSlug)
  const create = useCreateImportForm()
  const update = useUpdateImportForm()
  const isPending = create.isPending || update.isPending
  const [uploading, setUploading] = useState(false)
  const [toCreate, setToCreate] = useState<ImportFormValues | null>(null)
  // Nhả LeaveGuard ngay trước khi bên gọi tự điều hướng (lưu xong / xung đột).
  const leaving = useRef(false)

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    mode: 'onTouched',
    defaultValues: original ? toFormValues(original) : emptyFormValues(new Date()),
  })
  const items = useWatch({ control: form.control, name: 'items' })
  const total = formTotal(items)
  const isDirty = form.formState.isDirty

  const fallbackLabels = Object.fromEntries(
    (original?.items ?? []).map((i) => [i.materialSlug, `${i.materialCode} · ${i.materialName}`]),
  )

  const finish = (result: ImportForm) => {
    leaving.current = true
    onSaved(result)
  }

  const handleError = (error: unknown) => {
    if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
    toastApiError(error)
  }

  const confirmCreate = () => {
    if (!toCreate) return
    create.mutate(
      { warehouseSlug, input: toCreateInput(toCreate) },
      {
        onSuccess: (saved) => {
          setToCreate(null)
          finish(saved)
        },
        onError: (error) => {
          // Đóng hộp xác nhận để lỗi tại ô hiện ra.
          setToCreate(null)
          handleError(error)
        },
      },
    )
  }

  const onSubmit = (values: ImportFormValues) => {
    if (!original) {
      setToCreate(values)
      return
    }
    update.mutate(
      { warehouseSlug, slug: original.slug, input: toUpdateInput(values, original.version) },
      {
        onSuccess: finish,
        onError: (error) => {
          if (isStaleImportFormError(error)) {
            leaving.current = true
            onConflict()
            return
          }
          handleError(error)
        },
      },
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
        <section className="bg-card space-y-5 rounded-xl border p-5 sm:p-6">
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
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
                    <DatePicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
            <div className="sm:col-span-2">
              <ImportFormFileField form={form} onUploadingChange={setUploading} />
            </div>
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
          </div>
        </section>

        <section className="bg-card rounded-xl border p-5 sm:p-6">
          <ImportFormItemsField
            form={form}
            materials={materials.data?.items ?? []}
            fallbackLabels={fallbackLabels}
          />
        </section>

        <div className="bg-background/95 sticky bottom-0 z-20 border-t backdrop-blur print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="text-sm font-medium tabular-nums">
              {t('importForms:total', {
                value: formatCurrency(total, { maximumFractionDigits: 2 }),
              })}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
                {t('common:cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isPending || uploading || (original !== undefined && !isDirty)}
              >
                {isPending ? t('importForms:saving') : t('importForms:saveDraft')}
              </Button>
            </div>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={toCreate !== null}
        onOpenChange={(open) => !open && setToCreate(null)}
        tone="default"
        icon={<ClipboardListIcon />}
        title={t('importForms:createConfirmTitle')}
        description={t('importForms:createConfirmDescription')}
        details={
          toCreate && (
            <SummaryList
              items={[
                { label: t('importForms:fieldCode'), value: toCreate.code.trim().toUpperCase() },
                { label: t('importForms:fieldInvoiceCode'), value: toCreate.invoiceCode.trim() },
                { label: t('importForms:summaryLines'), value: String(toCreate.items.length) },
                {
                  label: t('importForms:fieldTotal'),
                  value: formatCurrency(formTotal(toCreate.items), { maximumFractionDigits: 2 }),
                },
              ]}
            />
          )
        }
        confirmLabel={
          create.isPending ? t('importForms:saving') : t('importForms:createConfirmAction')
        }
        isPending={create.isPending}
        onConfirm={confirmCreate}
      />

      <LeaveGuard when={isDirty} bypass={leaving} />
    </Form>
  )
}
