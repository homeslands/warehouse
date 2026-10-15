import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { ClipboardListIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { formatCurrency } from '@/shared/lib/format'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FormSheet } from '@/shared/ui/FormSheet'
import { Skeleton } from '@/shared/ui/skeleton'
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
  importFormKeys,
  isStaleImportFormError,
  useAvailableMaterials,
  useCreateImportForm,
  useImportForm,
  useUpdateImportForm,
  type ImportForm,
} from '@/entities/import-form'
import { ImportFormFileField } from './ImportFormFileField'
import { ImportFormItemsField } from './ImportFormItemsField'
import { NO_MATERIAL_ADD, type MaterialAddAbilities } from '../model/material-add'
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

type ImportFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouseSlug: string
  warehouseName: string
  /** Có = sửa phiếu này (sheet tự tải chi tiết); không có = tạo mới. */
  formSlug?: string
  /** Mã phiếu đang sửa nếu trang cha đã biết — để tiêu đề có mã ngay khi chi tiết còn đang tải. */
  formCode?: string
  /** Gọi sau khi tạo / lưu thành công (sheet đã tự đóng). */
  onSaved?: (saved: ImportForm) => void
  /** Quyền của luồng "thêm vật tư vào kho" trong dòng vật tư. */
  materialAbilities?: MaterialAddAbilities
}

/**
 * Form phiếu nhập (tạo + sửa) trong `FormSheet` rộng. Sheet luôn mount, trang cha điều khiển `open`;
 * dữ liệu chỉ tải khi mở. Trang cha chỉ truyền `formSlug` sau khi đã kiểm quyền sửa — sheet chỉ kiểm
 * trạng thái `DRAFT`.
 */
export function ImportFormSheet({
  open,
  onOpenChange,
  warehouseSlug,
  warehouseName,
  formSlug,
  formCode,
  onSaved,
  materialAbilities = NO_MATERIAL_ADD,
}: ImportFormSheetProps) {
  const { t } = useTranslation(['importForms', 'common'])
  const qc = useQueryClient()
  const editing = formSlug !== undefined
  const materials = useAvailableMaterials(warehouseSlug, { enabled: open })
  const detail = useImportForm(warehouseSlug, formSlug ?? '', { enabled: open && editing })
  const original = editing ? detail.data : undefined
  const editable = original?.status === 'DRAFT'
  const create = useCreateImportForm()
  const update = useUpdateImportForm()
  const isPending = create.isPending || update.isPending
  const [uploading, setUploading] = useState(false)
  const [toCreate, setToCreate] = useState<ImportFormValues | null>(null)
  // Đóng sheet thì bỏ luôn hộp xác nhận tạo và cờ đang upload (ô file đã unmount cùng sheet).
  if (!open && toCreate) setToCreate(null)
  if (!open && uploading) setUploading(false)

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    mode: 'onTouched',
    defaultValues: emptyFormValues(new Date()),
  })
  // Mỗi lần mở: tạo → form trống; sửa → điền khi chi tiết về.
  useEffect(() => {
    if (!open) return
    if (!editing) form.reset(emptyFormValues(new Date()))
    else if (original) form.reset(toFormValues(original))
  }, [open, editing, original, form])

  const items = useWatch({ control: form.control, name: 'items' })
  const total = formTotal(items)
  const isDirty = form.formState.isDirty

  // Đóng tab khi đang sửa dở → hộp hỏi gốc của trình duyệt.
  useEffect(() => {
    if (!open || !isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Trình duyệt cũ chỉ hiện hộp hỏi khi returnValue được gán.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [open, isDirty])

  const fallbackLabels = Object.fromEntries(
    (original?.items ?? []).map((i) => [i.materialSlug, `${i.materialCode} · ${i.materialName}`]),
  )

  const fallbackUnits = Object.fromEntries(
    (original?.items ?? []).map((i) => [i.unitSlug, `${i.unitCode} · ${i.unitName}`]),
  )

  const finish = (result: ImportForm) => {
    onOpenChange(false)
    onSaved?.(result)
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
    if (!editing) {
      setToCreate(values)
      return
    }
    if (!original) return
    update.mutate(
      { warehouseSlug, slug: original.slug, input: toUpdateInput(values, original.version) },
      {
        onSuccess: finish,
        onError: (error) => {
          if (isStaleImportFormError(error)) {
            onOpenChange(false)
            toast.error(t('importForms:conflict'))
            void qc.invalidateQueries({ queryKey: importFormKeys.warehouse(warehouseSlug) })
            return
          }
          handleError(error)
        },
      },
    )
  }

  const loadingBlock = (
    <div className="space-y-3" role="status" aria-label={t('common:loading')}>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )

  let body: ReactNode
  if (editing && detail.isPending) {
    body = loadingBlock
  } else if (editing && !original) {
    body = (
      <div
        role="alert"
        className="text-destructive flex flex-wrap items-center justify-between gap-2 text-sm"
      >
        <span>{resolveApiErrorMessage(detail.error)}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void detail.refetch()}>
          {t('common:retry')}
        </Button>
      </div>
    )
  } else if (editing && !editable) {
    body = (
      <p role="alert" className="text-sm">
        {t('importForms:notEditable')}
      </p>
    )
  } else {
    body = null
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      title={
        editing
          ? t('importForms:editTitle', { code: original?.code ?? formCode ?? '' })
          : t('importForms:createTitle', { warehouse: warehouseName })
      }
      submitLabel={t('importForms:saveDraft')}
      isPending={isPending}
      submitDisabled={uploading || (editing && (!editable || !isDirty))}
      isDirty={isDirty}
      footerStart={
        body === null
          ? t('importForms:total', { value: formatCurrency(total, { maximumFractionDigits: 2 }) })
          : undefined
      }
      confirmation={
        editing
          ? undefined
          : {
              open: toCreate !== null,
              onOpenChange: (next) => {
                if (!next) setToCreate(null)
              },
              icon: <ClipboardListIcon />,
              title: t('importForms:createConfirmTitle'),
              description: t('importForms:createConfirmDescription'),
              details: toCreate && (
                <SummaryList
                  items={[
                    {
                      label: t('importForms:fieldCode'),
                      value: toCreate.code.trim().toUpperCase(),
                    },
                    {
                      label: t('importForms:fieldInvoiceCode'),
                      value: toCreate.invoiceCode.trim(),
                    },
                    { label: t('importForms:summaryLines'), value: String(toCreate.items.length) },
                    {
                      label: t('importForms:fieldTotal'),
                      value: formatCurrency(formTotal(toCreate.items), {
                        maximumFractionDigits: 2,
                      }),
                    },
                  ]}
                />
              ),
              confirmLabel: create.isPending
                ? t('importForms:saving')
                : t('importForms:createConfirmAction'),
              onConfirm: confirmCreate,
            }
      }
      onSubmit={form.handleSubmit(onSubmit)}
    >
      {body ?? (
        <Form {...form}>
          <div className="space-y-6">
            <section className="bg-card space-y-5 rounded-xl border p-5 sm:p-6">
              {/* `items-start`: FormItem là grid — bị kéo giãn theo ô cao nhất hàng (Mã phiếu có dòng gợi ý) thì
                  nhãn và ô nhập của các ô bên cạnh bị đẩy lệch xuống. */}
              <div className="grid items-start gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
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
              {materials.isPending ? (
                <div className="space-y-3" role="status" aria-label={t('common:loading')}>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <ImportFormItemsField
                  form={form}
                  materials={materials.data?.items ?? []}
                  fallbackLabels={fallbackLabels}
                  fallbackUnits={fallbackUnits}
                  warehouseSlug={warehouseSlug}
                  warehouseName={warehouseName}
                  materialAbilities={materialAbilities}
                  loadError={
                    materials.isError
                      ? {
                          message: resolveApiErrorMessage(materials.error),
                          onRetry: () => void materials.refetch(),
                        }
                      : undefined
                  }
                />
              )}
            </section>
          </div>
        </Form>
      )}
    </FormSheet>
  )
}
