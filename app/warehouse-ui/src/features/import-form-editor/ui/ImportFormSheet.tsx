import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
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
import { Combobox } from '@/shared/ui/Combobox'
import {
  importFormKeys,
  isStaleImportFormError,
  useAvailableMaterials,
  useConfirmImportForm,
  useCreateImportForm,
  useImportForm,
  useUpdateImportForm,
  type AvailableMaterial,
  type ImportForm,
} from '@/entities/import-form'
import {
  NO_MATERIAL_ADD,
  type AddMaterialDialogProps,
  type MaterialAddAbilities,
} from '@/entities/inventory'
import { useSuppliers } from '@/entities/supplier'
import { ImportFormFileField } from './ImportFormFileField'
import { ImportFormItemsField } from './ImportFormItemsField'
import { ImportFormReviewDialog } from './ImportFormReviewDialog'
import { ImportFormStepper } from './ImportFormStepper'
import {
  buildImportFormSchema,
  effectiveSupplier,
  emptyFormValues,
  formTotal,
  toCreateInput,
  toFormValues,
  toUpdateInput,
  type ImportFormValues,
} from '../model/import-form-editor.schema'
import { importFormStepStatus } from '../model/steps'
import { countFollowingLines } from '../model/supplier'
import { useActiveSection } from './useActiveSection'

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

/** Kết quả lưu gửi cho trang cha (trang tự báo toast): đã xác nhận hay mới chỉ là nháp, và vì sao chưa xác nhận được. */
export type ImportFormSaveOutcome = {
  form: ImportForm
  confirmed: boolean
  confirmError?: unknown
}

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
  onSaved?: (outcome: ImportFormSaveOutcome) => void
  /** Quyền của luồng "thêm vật tư vào kho" trong dòng vật tư. */
  materialAbilities?: MaterialAddAbilities
  /** Hộp "Thêm vật tư vào kho" (page truyền vào — feature không import feature). */
  AddMaterialDialog?: ComponentType<AddMaterialDialogProps>
  /** Có SUPPLIER_READ: hiện ô Bên bán (bắt buộc) ở đầu phiếu. */
  canPickSupplier?: boolean
  /** Có IMPORT_FORM_CONFIRM: hiện "Lưu & xác nhận" (hộp Kiểm tra khi tạo, chân sheet khi sửa). */
  canConfirm?: boolean
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
  AddMaterialDialog,
  canPickSupplier = false,
  canConfirm = false,
}: ImportFormSheetProps) {
  const { t } = useTranslation(['importForms', 'common'])
  const qc = useQueryClient()
  const editing = formSlug !== undefined
  const materials = useAvailableMaterials(warehouseSlug, { enabled: open })
  const detail = useImportForm(warehouseSlug, formSlug ?? '', { enabled: open && editing })
  const original = editing ? detail.data : undefined
  const editable = original?.status === 'DRAFT'
  // Toast thành công của luồng tạo / xác nhận thuộc về trang (có nút "Xem"), nên hook không tự báo.
  const create = useCreateImportForm({ successToast: false })
  const confirm = useConfirmImportForm({ successToast: false })
  const update = useUpdateImportForm({ successToast: false })
  // `saving` phủ cả khoảng giữa hai request của "Lưu & xác nhận", nơi cả hai mutation đều không pending.
  const [saving, setSaving] = useState(false)
  const isPending = saving || create.isPending || update.isPending || confirm.isPending
  const [uploading, setUploading] = useState(false)
  const suppliers = useSuppliers({ page: 1, size: 100 }, { enabled: open && canPickSupplier })
  const [changedLines, setChangedLines] = useState<number | null>(null)
  const sellerRef = useRef<HTMLElement>(null)
  const itemsRef = useRef<HTMLElement>(null)
  // Giá trị giữ lại khi hộp đóng: hộp còn cần chúng lúc mờ dần và để nhảy tới dòng sau khi đóng.
  const [toReview, setToReview] = useState<ImportFormValues | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  // Vật tư chọn từ kết quả tìm có thể nằm ngoài 100 bản ghi đầu — hộp Kiểm tra vẫn cần tồn / đơn vị của chúng.
  const [pickedMaterials, setPickedMaterials] = useState<ReadonlyMap<string, AvailableMaterial>>(
    new Map(),
  )
  // Vật tư vừa thêm từ hộp: slug → nhãn đang hiển thị, làm tên dự phòng cho cảnh báo của hộp Kiểm tra.
  const [addedLabels, setAddedLabels] = useState<ReadonlyMap<string, string>>(new Map())
  // Đóng sheet thì bỏ luôn hộp Kiểm tra và cờ đang upload (ô file đã unmount cùng sheet).
  if (!open && reviewOpen) setReviewOpen(false)
  if (!open && pickedMaterials.size > 0) setPickedMaterials(new Map())
  if (!open && addedLabels.size > 0) setAddedLabels(new Map())
  if (!open && uploading) setUploading(false)

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(buildImportFormSchema({ requireSupplier: canPickSupplier })),
    mode: 'onTouched',
    defaultValues: emptyFormValues(new Date()),
  })
  // Mỗi lần mở: tạo → form trống; sửa → điền khi chi tiết về.
  useEffect(() => {
    if (!open) return
    if (!editing) form.reset(emptyFormValues(new Date()))
    else if (original) form.reset(toFormValues(original, { canPickSupplier }))
  }, [open, editing, original, form, canPickSupplier])

  // Dòng "Đã đổi bên bán…" mất khi sửa ô khác (hoặc form được reset).
  useEffect(() => {
    const sub = form.watch((_, { name }) => {
      if (name !== 'supplierSlug') setChangedLines(null)
    })
    return () => sub.unsubscribe()
  }, [form])

  const supplierOptions = (suppliers.data?.items ?? []).map((x) => ({
    value: x.slug,
    label: `${x.code} · ${x.name}`,
  }))

  const items = useWatch({ control: form.control, name: 'items' })
  const headerSupplier = useWatch({ control: form.control, name: 'supplierSlug' })
  const invoiceCode = useWatch({ control: form.control, name: 'invoiceCode' })
  const total = formTotal(items)
  const isDirty = form.formState.isDirty
  /**
   * Nháp cũ có dòng chưa lưu bên bán hiện "theo đầu phiếu" (bên bán suy ra) mà form không dirty — vẫn phải PATCH để lưu
   * nó. Chỉ khi chọn được NCC: thiếu quyền thì giữ nguyên bên bán cũ của từng dòng nên không có gì để lưu thêm.
   */
  const sellerUnsaved = (values: ImportFormValues) =>
    canPickSupplier &&
    original !== undefined &&
    values.items.some(
      (_, i) =>
        (effectiveSupplier(values, i) || null) !== (original.items?.[i]?.supplierSlug ?? null),
    )
  const needsPatch =
    isDirty || sellerUnsaved({ ...form.getValues(), supplierSlug: headerSupplier ?? '', items })

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

  const finish = (outcome: ImportFormSaveOutcome) => {
    setReviewOpen(false)
    onOpenChange(false)
    onSaved?.(outcome)
  }

  const knownMaterials = new Map<string, AvailableMaterial>([
    ...pickedMaterials,
    ...(materials.data?.items ?? []).map((m): [string, AvailableMaterial] => [m.slug, m]),
  ])
  const supplierName = (slug: string) =>
    suppliers.data?.items.find((x) => x.slug === slug)?.name ??
    [...knownMaterials.values()].flatMap((m) => m.suppliers).find((x) => x.slug === slug)?.name ??
    slug

  /** Từ hộp Kiểm tra: tới ô liên quan của dòng — đơn giá nếu đang 0, còn lại là số lượng. */
  const jumpToLine = (index: number) => {
    const zeroPrice = form.getValues(`items.${index}.unitPrice`) === 0
    form.setFocus(zeroPrice ? `items.${index}.unitPrice` : `items.${index}.quantity`)
  }

  const handleError = (error: unknown) => {
    if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
    toastApiError(error)
  }

  const handleStale = () => {
    onOpenChange(false)
    toast.error(t('importForms:conflict'))
    void qc.invalidateQueries({ queryKey: importFormKeys.warehouse(warehouseSlug) })
  }

  const saveNew = async (values: ImportFormValues, andConfirm: boolean) => {
    setSaving(true)
    try {
      let saved: ImportForm
      try {
        saved = await create.mutateAsync({ warehouseSlug, input: toCreateInput(values) })
      } catch (error) {
        // Đóng hộp để lỗi tại ô hiện ra.
        setReviewOpen(false)
        handleError(error)
        return
      }
      if (!andConfirm) {
        finish({ form: saved, confirmed: false })
        return
      }
      try {
        const confirmed = await confirm.mutateAsync({
          warehouseSlug,
          slug: saved.slug,
          version: saved.version,
        })
        finish({ form: confirmed, confirmed: true })
      } catch (confirmError) {
        // Phiếu nháp đã tạo xong — chỉ bước xác nhận lỗi; trang cha báo "đã lưu nhưng chưa xác nhận".
        finish({ form: saved, confirmed: false, confirmError })
      }
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = (values: ImportFormValues) => {
    if (!original) return
    update.mutate(
      { warehouseSlug, slug: original.slug, input: toUpdateInput(values, original.version) },
      {
        onSuccess: (saved) => finish({ form: saved, confirmed: false }),
        onError: (error) => {
          if (isStaleImportFormError(error)) return handleStale()
          handleError(error)
        },
      },
    )
  }

  /**
   * Sửa + "Lưu & xác nhận": chưa đổi → chỉ xác nhận với version hiện có; đã đổi (hoặc còn bên bán suy ra chưa
   * lưu) → PATCH rồi xác nhận với version mới.
   */
  const saveEditAndConfirm = async (values: ImportFormValues) => {
    if (!original) return
    setSaving(true)
    try {
      let current = original
      const patching = isDirty || sellerUnsaved(values)
      if (patching) {
        try {
          current = await update.mutateAsync({
            warehouseSlug,
            slug: original.slug,
            input: toUpdateInput(values, original.version),
          })
        } catch (error) {
          if (isStaleImportFormError(error)) return handleStale()
          handleError(error)
          return
        }
      }
      try {
        const confirmed = await confirm.mutateAsync({
          warehouseSlug,
          slug: current.slug,
          version: current.version,
        })
        finish({ form: confirmed, confirmed: true })
      } catch (confirmError) {
        if (patching) {
          // Đã lưu xong — chỉ bước xác nhận lỗi; trang cha báo "đã lưu nhưng chưa xác nhận".
          finish({ form: current, confirmed: false, confirmError })
          return
        }
        // Chưa lưu gì thì không được báo "Đã lưu…". Phiếu đã cũ → như PATCH bị 409; lỗi khác → báo, giữ sheet.
        if (isStaleImportFormError(confirmError)) return handleStale()
        toastApiError(confirmError)
      }
    } finally {
      setSaving(false)
    }
  }

  /**
   * Sửa không có hộp Kiểm tra: bước ③ chỉ đưa chân sheet vào tầm nhìn và focus nút "Lưu" — KHÔNG gửi form (gửi là
   * lưu thẳng rồi đóng sheet, quá tay với một nút trên dải bước). Nút Lưu nằm trong cùng `<form>` với dải bước.
   */
  const focusSave = () => {
    const save = sellerRef.current
      ?.closest('form')
      ?.querySelector<HTMLButtonElement>('button[type="submit"]')
    save?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    save?.focus()
  }

  const onSubmit = (values: ImportFormValues) => {
    if (editing) saveEdit(values)
    else {
      setToReview(values)
      setReviewOpen(true)
    }
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
  const activeStep = useActiveSection(
    [
      { key: 'seller', ref: sellerRef },
      { key: 'items', ref: itemsRef },
    ],
    open && body === null,
  )
  const steps = importFormStepStatus(
    { supplierSlug: headerSupplier ?? '', invoiceCode: invoiceCode ?? '', items },
    { requireSupplier: canPickSupplier },
  )

  return (
    <>
      <FormSheet
        open={open}
        onOpenChange={onOpenChange}
        size="wide"
        title={
          editing
            ? t('importForms:editTitle', { code: original?.code ?? formCode ?? '' })
            : t('importForms:createTitle', { warehouse: warehouseName })
        }
        submitLabel={editing ? t('common:save') : t('importForms:reviewAndSave')}
        isPending={isPending}
        submitDisabled={uploading || (editing && (!editable || !needsPatch))}
        isDirty={isDirty}
        footerStart={
          body === null
            ? t('importForms:total', { value: formatCurrency(total, { maximumFractionDigits: 2 }) })
            : undefined
        }
        secondaryAction={
          editing && canConfirm && body === null ? (
            <Button
              type="button"
              variant="outline"
              disabled={isPending || uploading}
              onClick={() => void form.handleSubmit(saveEditAndConfirm)()}
            >
              {t('importForms:saveAndConfirm')}
            </Button>
          ) : undefined
        }
        onSubmit={form.handleSubmit(onSubmit)}
      >
        {body ?? (
          <Form {...form}>
            <div className="space-y-6">
              <ImportFormStepper
                active={activeStep}
                sellerDone={steps.sellerDone}
                itemsDone={steps.itemsDone}
                lineCount={steps.lineCount}
                onSeller={() =>
                  sellerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                onItems={() =>
                  itemsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                onReview={editing ? focusSave : () => void form.handleSubmit(onSubmit)()}
                reviewDisabled={isPending || uploading || (editing && (!editable || !needsPatch))}
              />
              <section ref={sellerRef} className="bg-card space-y-5 rounded-xl border p-5 sm:p-6">
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
                          <DatePicker value={field.value} onChange={field.onChange} />
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
              </section>

              <section ref={itemsRef} className="bg-card rounded-xl border p-5 sm:p-6">
                {materials.isPending ? (
                  <div className="space-y-3" role="status" aria-label={t('common:loading')}>
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <ImportFormItemsField
                    onMaterialPicked={(m) =>
                      setPickedMaterials((prev) => new Map(prev).set(m.slug, m))
                    }
                    onMaterialAdded={(m) =>
                      setAddedLabels((prev) => new Map(prev).set(m.slug, m.label))
                    }
                    form={form}
                    materials={materials.data?.items ?? []}
                    fallbackLabels={fallbackLabels}
                    fallbackUnits={fallbackUnits}
                    warehouseSlug={warehouseSlug}
                    warehouseName={warehouseName}
                    materialAbilities={materialAbilities}
                    AddMaterialDialog={AddMaterialDialog}
                    canPickSupplier={canPickSupplier}
                    suppliers={suppliers.data?.items}
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
      {toReview && (
        <ImportFormReviewDialog
          open={open && reviewOpen}
          onOpenChange={setReviewOpen}
          values={toReview}
          materials={knownMaterials}
          supplierName={supplierName}
          materialLabel={(slug) => addedLabels.get(slug) ?? fallbackLabels[slug]}
          canConfirm={canConfirm}
          isPending={isPending}
          onSaveDraft={() => void saveNew(toReview, false)}
          onSaveAndConfirm={() => void saveNew(toReview, true)}
          onJumpToLine={jumpToLine}
        />
      )}
    </>
  )
}
