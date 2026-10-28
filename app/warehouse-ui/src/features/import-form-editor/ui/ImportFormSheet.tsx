import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheckIcon, FilePenLineIcon, FilePlus2Icon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import { useForm, useWatch, type Control, type FieldErrors, type FieldPath } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { changedFieldLabels } from '@/shared/lib/changed-fields'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { formatCurrency } from '@/shared/lib/format'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { FormSheet, type FormSheetActionsContext } from '@/shared/ui/FormSheet'
import { Skeleton } from '@/shared/ui/skeleton'
import { Form } from '@/shared/ui/form'
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
  inventoryKeys,
  type AddMaterialDialogProps,
  type AddedMaterial,
  type MaterialAddAbilities,
} from '@/entities/inventory'
import { materialBatchKeys } from '@/entities/material-batch'
import { useSuppliers } from '@/entities/supplier'
import { ImportFormInfoStep } from './ImportFormInfoStep'
import { ImportFormInfoSummary } from './ImportFormInfoSummary'
import { ImportFormItemsField } from './ImportFormItemsField'
import { ImportFormReviewStep } from './ImportFormReviewStep'
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
import { importSaveConfirmCopy, type ImportSaveAction } from '../model/save-confirm'
import { importFormStepStatus } from '../model/steps'
import {
  WIZARD_STEPS,
  firstErrorField,
  firstStepWithError,
  stepFields,
  stepIndex,
  type WizardStep,
} from '../model/wizard'

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
  101329: 'file',
} as const

/** Lỗi của cả danh sách dòng: tổng (101311), số dòng (101317 / 101318). */
const ITEMS_LIST_ERROR_CODES: ReadonlySet<number> = new Set([101311, 101317, 101318])

/**
 * Lỗi thuộc bước ② mà không gắn được vào ô: lỗi theo dòng (101319–101328, 101330 bên bán của dòng và 101333 hạn dùng của dòng — backend không
 * trả chỉ số dòng) và lỗi của cả danh sách dòng (`ITEMS_LIST_ERROR_CODES`).
 */
const isItemsError = (error: unknown) =>
  isApiError(error) &&
  error.code !== undefined &&
  ((error.code >= 101319 && error.code <= 101328) ||
    error.code === 101330 ||
    error.code === 101333 ||
    ITEMS_LIST_ERROR_CODES.has(error.code))

/**
 * Cú bấm thứ hai trở đi của một lần bấm đúp (`detail > 1`). Chân sheet đổi nút ngay khi đổi bước, nên cú bấm thứ hai
 * rơi vào nút mới ở cùng chỗ (vd "Tiếp tục" ② → "Lưu & xác nhận" ③) — phải bỏ qua. Bàn phím có `detail === 0`.
 */
const isRepeatClick = (event: MouseEvent<HTMLButtonElement>) => event.detail > 1

/** Icon của hộp hỏi trước khi lưu, theo hành động. */
const SAVE_CONFIRM_ICON: Record<ImportSaveAction, ReactNode> = {
  createDraft: <FilePlus2Icon />,
  saveConfirm: <CircleCheckIcon />,
  saveEdit: <FilePenLineIcon />,
}

/** Lần lưu đang chờ hỏi: hành động, giá trị đã hợp lệ, nhãn các ô đã sửa (chốt lúc bấm). */
type SaveRequest = { action: ImportSaveAction; values: ImportFormValues; changed: string[] }

/**
 * Bước ③ tự theo dõi giá trị form (`useWatch` toàn form) — chỉ khung nhỏ này vẽ lại theo từng phím gõ, không phải cả
 * sheet. Vẫn mount khi ẩn như hai bước kia.
 */
function ReviewStepWatcher({
  control,
  ...rest
}: Omit<ComponentProps<typeof ImportFormReviewStep>, 'values'> & {
  control: Control<ImportFormValues>
}) {
  // Không truyền `name` → RHF trả toàn bộ giá trị form (kiểu khai là DeepPartial, giá trị thật là đủ).
  const values = useWatch({ control }) as ImportFormValues
  return <ImportFormReviewStep values={values} {...rest} />
}

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
  /** Có IMPORT_FORM_CONFIRM: hiện "Lưu & xác nhận" (bước ③ khi tạo, chân sheet khi sửa). */
  canConfirm?: boolean
}

/**
 * Form phiếu nhập (tạo + sửa) trong `FormSheet` rộng, dạng wizard 3 bước (① Thông tin phiếu → ② Chi tiết vật tư →
 * ③ Kiểm tra & lưu). Ba bước luôn mount, bước không hiện có `hidden` — giữ trạng thái upload / dòng và để
 * `trigger` / `setFocus` với tới ô ở bước khác. Tạo chỉ lưu được ở ③; sửa lưu ở mọi bước. Sheet luôn mount, trang cha
 * điều khiển `open`; dữ liệu chỉ tải khi mở. Trang cha chỉ truyền `formSlug` sau khi đã kiểm quyền sửa — sheet chỉ
 * kiểm trạng thái `DRAFT`.
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
  const confirmMutation = useConfirmImportForm({ successToast: false })
  // Xác nhận cộng tồn / tạo lô → làm mới tồn + lô của kho (phiếu xuất không báo thiếu giả).
  const confirm = {
    isPending: confirmMutation.isPending,
    mutateAsync: async (...args: Parameters<typeof confirmMutation.mutateAsync>) => {
      const result = await confirmMutation.mutateAsync(...args)
      void qc.invalidateQueries({ queryKey: inventoryKeys.all })
      void qc.invalidateQueries({ queryKey: materialBatchKeys.warehouse(warehouseSlug) })
      return result
    },
  }
  const update = useUpdateImportForm({ successToast: false })
  // `saving` phủ cả khoảng giữa hai request của "Lưu & xác nhận", nơi cả hai mutation đều không pending.
  const [saving, setSaving] = useState(false)
  // Nút nào đang lưu (tạo: Lưu nháp / Lưu & xác nhận; sửa: Lưu / Lưu & xác nhận) — chỉ nút đó đổi chữ thành
  // "Đang lưu...".
  const [pendingAction, setPendingAction] = useState<'draft' | 'confirm' | 'save' | null>(null)
  const isPending = saving || create.isPending || update.isPending || confirm.isPending
  // Mọi nút lưu hỏi lại trước khi gửi (`ConfirmDialog`). `saveRequest` giữ nguyên khi hộp đóng để nội dung không
  // biến mất lúc hộp đang mờ dần; `saveConfirmOpen` mới là trạng thái mở.
  const [saveRequest, setSaveRequest] = useState<SaveRequest | null>(null)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  // Phần tử đã mở hộp (nút lưu / ô vừa nhấn Enter) — "Quay lại" / Esc trả focus về đó. Radix chỉ trả focus về
  // `Dialog.Trigger`, hộp này không có trigger.
  const saveTriggerRef = useRef<HTMLElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const suppliers = useSuppliers({ page: 1, size: 100 }, { enabled: open && canPickSupplier })
  // Mở sheet → bắt đầu lại: tạo ở ①, sửa ở ② (phần hay sửa nhất).
  const initialStep: WizardStep = editing ? 'items' : 'info'
  const [step, setStep] = useState<WizardStep>(initialStep)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setStep(initialStep)
  }
  const contentRef = useRef<HTMLDivElement>(null)
  const sectionRefs = {
    info: useRef<HTMLElement>(null),
    items: useRef<HTMLElement>(null),
    review: useRef<HTMLElement>(null),
  }
  // Vật tư chọn từ kết quả tìm có thể nằm ngoài 100 bản ghi đầu — bước Kiểm tra vẫn cần tồn / đơn vị của chúng.
  const [pickedMaterials, setPickedMaterials] = useState<ReadonlyMap<string, AvailableMaterial>>(
    new Map(),
  )
  // Vật tư vừa thêm từ hộp (slug → nhãn + đơn vị gốc hộp trả về): tên / đơn vị dự phòng cho bước Kiểm tra.
  const [addedMaterials, setAddedMaterials] = useState<ReadonlyMap<string, AddedMaterial>>(
    new Map(),
  )
  // Đóng sheet thì bỏ vật tư đã chọn / vừa thêm và cờ đang upload (ô file đã unmount cùng sheet).
  if (!open && pickedMaterials.size > 0) setPickedMaterials(new Map())
  if (!open && addedMaterials.size > 0) setAddedMaterials(new Map())
  if (!open && uploading) setUploading(false)
  if (!open && saveConfirmOpen) setSaveConfirmOpen(false)

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

  // Hạn dùng của dòng phụ thuộc ngày phiếu (≥ ngày phiếu): đổi ngày thì kiểm lại các hạn đã chạm / đang lỗi / sau khi
  // submit — RHF chỉ kiểm lại ĐÚNG ô đang đổi. Ô chưa chạm thì để yên, không la lỗi ở chỗ người dùng chưa tới.
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name !== 'date') return
      const paths = (values.items ?? []).flatMap((item, i) => {
        if (!item?.expiryDate) return []
        const path = `items.${i}.expiryDate` as const
        const state = form.getFieldState(path)
        return state.isTouched || state.invalid || form.formState.isSubmitted ? [path] : []
      })
      if (paths.length > 0) void form.trigger(paths)
    })
    return () => subscription.unsubscribe()
  }, [form])

  const supplierOptions = (suppliers.data?.items ?? []).map((x) => ({
    value: x.slug,
    label: `${x.code} · ${x.name}`,
  }))

  const items = useWatch({ control: form.control, name: 'items' })
  const headerSupplier = useWatch({ control: form.control, name: 'supplierSlug' })
  const invoiceCode = useWatch({ control: form.control, name: 'invoiceCode' })
  const date = useWatch({ control: form.control, name: 'date' })
  const purchaseOrder = useWatch({ control: form.control, name: 'purchaseOrder' })
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
  // Đọc trong lúc render để RHF theo dõi `dirtyFields` (proxy của formState chỉ cập nhật trường đã được đọc).
  const dirtyFields = form.formState.dirtyFields

  /**
   * Nhãn "Đã sửa" của hộp hỏi khi sửa: các ô bước ① theo nhãn trên màn hình, "Dòng vật tư" nếu dòng đổi. Bên bán
   * dòng suy ra chưa lưu (`needsPatch` dù dòng không dirty) cũng là một lần ghi → "Bên bán của dòng".
   */
  const changedLabels = (values: ImportFormValues) => {
    const itemsLabel = t('importForms:changedItems')
    const labels = changedFieldLabels(dirtyFields, {
      supplierSlug: t('importForms:supplier'),
      invoiceCode: t('importForms:fieldInvoiceCode'),
      date: t('importForms:fieldDate'),
      file: t('importForms:fieldFile'),
      purchaseOrder: t('importForms:fieldPurchaseOrder'),
      note: t('importForms:fieldNote'),
      code: t('importForms:fieldCode'),
      items: itemsLabel,
    })
    if (sellerUnsaved(values) && !labels.includes(itemsLabel)) {
      labels.push(t('importForms:changedLineSuppliers'))
    }
    return labels
  }

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

  /**
   * Hộp hỏi lưu đang mở thì giữ focus trong nó — phải đóng NGAY (`flushSync`) trước khi chuyển bước / focus ô lỗi.
   */
  const dismissSaveConfirm = () => {
    saveTriggerRef.current = null
    flushSync(() => setSaveConfirmOpen(false))
  }

  const finish = (outcome: ImportFormSaveOutcome) => {
    dismissSaveConfirm()
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

  /** Nhãn vật tư như bước ② đang hiện: danh sách khả dụng + vật tư vừa chọn / vừa thêm, rồi tới nhãn đã lưu. */
  const materialLabel = (slug: string) => {
    const m = knownMaterials.get(slug)
    return m ? `${m.code} · ${m.name}` : (addedMaterials.get(slug)?.label ?? fallbackLabels[slug])
  }
  const unitLabel = (materialSlug: string, unitSlug: string) => {
    const unit = knownMaterials.get(materialSlug)?.units.find((u) => u.unitSlug === unitSlug)
    if (unit) return `${unit.unitCode} · ${unit.unitName}`
    // Vật tư vừa thêm chưa có trong `available-materials` → đơn vị gốc hộp trả về.
    const added = addedMaterials.get(materialSlug)?.baseUnit
    return added?.slug === unitSlug ? added.label : fallbackUnits[unitSlug]
  }

  /**
   * Hiện bước `target` rồi mới focus — ô ở bước bị `hidden` không nhận focus. Có `field` → focus ô đó (ô lỗi, ô của
   * dòng); không có → cuộn vùng nội dung lên đầu và focus tiêu đề bước cho bàn phím / trình đọc màn hình.
   */
  const show = (target: WizardStep, field?: FieldPath<ImportFormValues> | null) => {
    flushSync(() => setStep(target))
    const section = sectionRefs[target].current
    const heading = () => section?.querySelector<HTMLElement>('h2[tabindex="-1"]')
    // `items` (lỗi cấp mảng) không phải một ô — focus tiêu đề bước.
    if (field && field !== 'items') {
      form.setFocus(field)
      // Dự phòng khi ô không nhận focus qua RHF (ô không chuyển tiếp `ref` — ô file đính kèm, lỗi cấp dòng…): ô
      // `aria-invalid` đầu tiên của bước, không có thì tiêu đề bước.
      if (section && !section.contains(document.activeElement)) {
        const invalid = section.querySelector<HTMLElement>('[aria-invalid="true"]')
        if (invalid) {
          invalid.scrollIntoView?.({ block: 'center' })
          invalid.focus()
        } else heading()?.focus()
      }
      return
    }
    const scroller = contentRef.current?.parentElement
    if (scroller) scroller.scrollTop = 0
    heading()?.focus()
  }

  /** Lỗi hiện tại của các bước, đọc qua `getFieldState` (luôn mới) — `formState` chỉ mới ở lần render sau. */
  const liveErrors = (steps: readonly WizardStep[] = WIZARD_STEPS) =>
    Object.fromEntries(
      steps.flatMap(stepFields).map((f) => [f, form.getFieldState(f).error]),
    ) as FieldErrors<ImportFormValues>

  /**
   * Lùi luôn được. Tiến: kiểm lần lượt các bước trước `target`, dừng ở bước sai đầu tiên (hiện lỗi, focus ô lỗi).
   * Đang upload chứng từ (bước ①) thì không tiến.
   */
  const goTo = async (target: WizardStep) => {
    if (target === step) return
    if (stepIndex(target) < stepIndex(step)) return show(target)
    if (uploading) return
    for (const s of WIZARD_STEPS.slice(0, stepIndex(target))) {
      if (await form.trigger(stepFields(s))) continue
      if (!form.formState.isSubmitted) {
        // `visibleError` giấu lỗi của ô trống chưa chạm cho tới lần gửi đầu: gửi "khan" (không lưu gì) để lỗi hiện
        // ra, rồi bỏ lỗi của các bước sau — người dùng chưa tới đó.
        await form.handleSubmit(
          () => {},
          () => {},
        )()
        form.clearErrors(WIZARD_STEPS.slice(stepIndex(s) + 1).flatMap(stepFields))
      }
      return show(s, firstErrorField(liveErrors([s]), s))
    }
    show(target)
  }

  /** Có lỗi (lưu toàn phiếu không qua, lỗi backend tại ô): sang bước chứa ô lỗi đầu tiên rồi focus ô đó. */
  const showFirstError = (errors: FieldErrors<ImportFormValues>) => {
    const s = firstStepWithError(errors)
    if (s) show(s, firstErrorField(errors, s))
  }

  /** Từ bước Kiểm tra: về ② và tới ô liên quan của dòng — đơn giá nếu đang 0, còn lại là số lượng. */
  const jumpToLine = (index: number) => {
    const zeroPrice = form.getValues(`items.${index}.unitPrice`) === 0
    show('items', zeroPrice ? `items.${index}.unitPrice` : `items.${index}.quantity`)
  }

  const handleError = (error: unknown) => {
    dismissSaveConfirm()
    // Ô lỗi có thể nằm ở bước đang ẩn (vd Mã phiếu khi đang ở ③) → sang bước đó rồi focus.
    if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return showFirstError(liveErrors())
    toastApiError(error)
    if (isItemsError(error)) show('items')
  }

  const handleStale = () => {
    dismissSaveConfirm()
    onOpenChange(false)
    toast.error(t('importForms:conflict'))
    void qc.invalidateQueries({ queryKey: importFormKeys.warehouse(warehouseSlug) })
  }

  const saveNew = async (values: ImportFormValues, andConfirm: boolean) => {
    setSaving(true)
    setPendingAction(andConfirm ? 'confirm' : 'draft')
    try {
      let saved: ImportForm
      try {
        saved = await create.mutateAsync({ warehouseSlug, input: toCreateInput(values) })
      } catch (error) {
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
      setPendingAction(null)
      setSaveConfirmOpen(false)
    }
  }

  const saveEdit = (values: ImportFormValues) => {
    if (!original) return
    setPendingAction('save')
    update.mutate(
      { warehouseSlug, slug: original.slug, input: toUpdateInput(values, original.version) },
      {
        onSuccess: (saved) => finish({ form: saved, confirmed: false }),
        onError: (error) => {
          if (isStaleImportFormError(error)) return handleStale()
          handleError(error)
        },
        onSettled: () => {
          setPendingAction(null)
          setSaveConfirmOpen(false)
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
    setPendingAction('confirm')
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
        dismissSaveConfirm()
        toastApiError(confirmError)
      }
    } finally {
      setSaving(false)
      setPendingAction(null)
      setSaveConfirmOpen(false)
    }
  }

  /**
   * Mọi nút lưu: kiểm toàn phiếu (`onInvalid` → sang bước có lỗi), hợp lệ thì mở hộp hỏi với giá trị đã hợp lệ —
   * chưa gửi gì. `trigger` = phần tử nhận lại focus khi người dùng lùi khỏi hộp.
   */
  const requestSave = (action: ImportSaveAction, trigger: Element | null) =>
    form.handleSubmit((values) => {
      saveTriggerRef.current = trigger instanceof HTMLElement ? trigger : null
      setSaveRequest({ action, values, changed: editing ? changedLabels(values) : [] })
      setSaveConfirmOpen(true)
    }, showFirstError)

  /** Bấm xác nhận trong hộp: chạy đúng luồng lưu cũ của hành động. Hộp mở tới khi gửi xong (khoá khi đang gửi). */
  const runSaveRequest = () => {
    if (!saveRequest || isPending || pendingAction !== null) return
    const { action, values } = saveRequest
    if (!editing) void saveNew(values, action === 'saveConfirm')
    else if (action === 'saveConfirm') void saveEditAndConfirm(values)
    else saveEdit(values)
  }

  /** "Quay lại" / Esc / bấm ra ngoài: đóng hộp, không gửi gì, focus về chỗ đã mở hộp. */
  const cancelSaveRequest = () => {
    const trigger = saveTriggerRef.current
    saveTriggerRef.current = null
    flushSync(() => setSaveConfirmOpen(false))
    trigger?.focus()
  }

  /**
   * Enter / nút gửi. Sửa: Lưu ở mọi bước (kiểm toàn phiếu, lỗi ở bước khác → sang bước đó), qua hộp hỏi; chưa đổi gì và không `needsPatch` thì không làm gì. Tạo: ① / ② =
   * Tiếp tục; ③ không làm gì — một phím Enter lỡ tay không được "Lưu & xác nhận" (cộng tồn ngay), lưu chỉ qua nút ở
   * chân sheet.
   */
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (editing) {
      // Chưa đổi gì và không cần PATCH: không có gì để hỏi (như nút Lưu đang khoá) — không dựa ngầm vào luật HTML.
      if (!needsPatch) {
        event.preventDefault()
        return
      }
      void requestSave('saveEdit', document.activeElement)(event)
      return
    }
    event.preventDefault()
    if (step === 'info') void goTo('items')
    else if (step === 'items') void goTo('review')
  }

  /** Nhãn nút lưu: "Đang lưu..." khi đang gửi (và `active` — tức chính nút này được bấm), như chân sheet mặc định. */
  const savingLabel = (label: string, active = true) =>
    isPending && active ? t('common:saving') : label

  /**
   * Chân sheet khi tạo: ① Huỷ · Tiếp tục; ② Quay lại · Tiếp tục; ③ Quay lại · Lưu nháp · Lưu & xác nhận. Mỗi nút một
   * `key` riêng — React không được dùng lại node của "Tiếp tục" cho nút lưu khi sang ③.
   */
  const createActions = ({ requestClose }: FormSheetActionsContext) => {
    const back = (
      <Button
        key={step === 'info' ? 'cancel' : 'back'}
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={
          step === 'info' ? requestClose : () => void goTo(step === 'review' ? 'items' : 'info')
        }
      >
        {step === 'info' ? t('common:cancel') : t('importForms:back')}
      </Button>
    )
    if (step !== 'review') {
      return (
        <>
          {back}
          <Button
            key="next"
            type="submit"
            disabled={isPending || uploading}
            onClick={(e) => {
              if (isRepeatClick(e)) e.preventDefault()
            }}
          >
            {t('importForms:next')}
          </Button>
        </>
      )
    }
    // Mọi nút ở ③ là `type="button"`: Enter trong form không được kích hoạt lưu.
    const save = (andConfirm: boolean) => (e: MouseEvent<HTMLButtonElement>) => {
      if (isRepeatClick(e)) return
      void requestSave(andConfirm ? 'saveConfirm' : 'createDraft', e.currentTarget)()
    }
    return (
      <>
        {back}
        <Button
          key="draft"
          type="button"
          variant={canConfirm ? 'outline' : 'default'}
          disabled={isPending}
          onClick={save(false)}
        >
          {savingLabel(t('importForms:saveDraft'), pendingAction === 'draft')}
        </Button>
        {canConfirm && (
          <Button key="confirm" type="button" disabled={isPending} onClick={save(true)}>
            {savingLabel(t('importForms:saveAndConfirm'), pendingAction === 'confirm')}
          </Button>
        )}
      </>
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

  /**
   * Chân sheet khi sửa, ở mọi bước: Huỷ · Lưu & xác nhận (`canConfirm`) · Lưu. Không có Quay lại / Tiếp tục — đi
   * giữa các bước qua dải bước và "sửa" của dòng tóm tắt. Cả hai nút lưu kiểm toàn phiếu; lỗi ở bước đang ẩn → sang
   * bước đó (`showFirstError`).
   */
  const editActions = ({ requestClose }: FormSheetActionsContext) => (
    <>
      <Button
        key="cancel"
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={requestClose}
      >
        {t('common:cancel')}
      </Button>
      {canConfirm && body === null && (
        <Button
          key="confirm"
          type="button"
          variant="outline"
          disabled={isPending || uploading}
          onClick={(e) => {
            if (isRepeatClick(e)) return
            void requestSave('saveConfirm', e.currentTarget)()
          }}
        >
          {savingLabel(t('importForms:saveAndConfirm'), pendingAction === 'confirm')}
        </Button>
      )}
      <Button
        key="save"
        type="submit"
        disabled={isPending || uploading || !editable || !needsPatch}
      >
        {savingLabel(t('common:save'), pendingAction === 'save')}
      </Button>
    </>
  )

  const steps = importFormStepStatus(
    { supplierSlug: headerSupplier ?? '', invoiceCode: invoiceCode ?? '', items },
    { requireSupplier: canPickSupplier },
  )

  // Mã trong câu hỏi: tạo → mã sẽ gửi (đã chuẩn hoá như payload); sửa → mã phiếu đang sửa.
  const saveCopy =
    saveRequest &&
    importSaveConfirmCopy(t, saveRequest.action, {
      code: editing ? (original?.code ?? formCode ?? '') : toCreateInput(saveRequest.values).code,
      changed: saveRequest.changed,
    })

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
        actions={editing ? editActions : createActions}
        isPending={isPending}
        isDirty={isDirty}
        footerStart={
          // Tạo: Tổng chỉ ở ② và ③ (bước ① chưa có dòng nào để cộng).
          body === null && (editing || step !== 'info')
            ? t('importForms:total', { value: formatCurrency(total, { maximumFractionDigits: 2 }) })
            : undefined
        }
        onSubmit={onSubmit}
      >
        {body ?? (
          <Form {...form}>
            <div ref={contentRef} className="space-y-6">
              <ImportFormStepper
                current={step}
                infoDone={steps.sellerDone}
                itemsDone={steps.itemsDone}
                lineCount={steps.lineCount}
                onSelect={(target) => void goTo(target)}
                disabled={isPending}
                lockForward={uploading}
              />
              <section
                ref={sectionRefs.info}
                hidden={step !== 'info'}
                className="bg-card space-y-5 rounded-xl border p-5 sm:p-6"
              >
                <ImportFormInfoStep
                  form={form}
                  canPickSupplier={canPickSupplier}
                  supplierOptions={supplierOptions}
                  onUploadingChange={setUploading}
                />
              </section>

              <section
                ref={sectionRefs.items}
                hidden={step !== 'items'}
                className="bg-card space-y-4 rounded-xl border p-5 sm:p-6"
              >
                <ImportFormInfoSummary
                  seller={
                    canPickSupplier && headerSupplier ? supplierName(headerSupplier) : undefined
                  }
                  invoiceCode={invoiceCode ?? ''}
                  date={date ?? ''}
                  purchaseOrder={purchaseOrder}
                  onEdit={() => void goTo('info')}
                  disabled={isPending}
                />
                {materials.isPending ? (
                  loadingBlock
                ) : (
                  <ImportFormItemsField
                    onMaterialPicked={(m) =>
                      setPickedMaterials((prev) => new Map(prev).set(m.slug, m))
                    }
                    onMaterialAdded={(m) =>
                      setAddedMaterials((prev) => new Map(prev).set(m.slug, m))
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

              <section
                ref={sectionRefs.review}
                hidden={step !== 'review'}
                className="bg-card rounded-xl border p-5 sm:p-6"
              >
                <ReviewStepWatcher
                  control={form.control}
                  materials={knownMaterials}
                  supplierName={supplierName}
                  materialLabel={materialLabel}
                  unitLabel={unitLabel}
                  canConfirm={canConfirm}
                  editing={editing}
                  disabled={isPending}
                  onJumpToLine={jumpToLine}
                  onEditStep={(target) => void goTo(target)}
                />
              </section>
            </div>
          </Form>
        )}
      </FormSheet>
      {saveRequest && saveCopy && (
        // Ngoài `FormSheet` (cả cây React lẫn DOM): Enter trong hộp không chạm `onSubmit` của form phiếu. Radix chỉ cho
        // lớp trên cùng nhận Esc / bấm ra ngoài → khi hộp mở, sheet không bật "Bỏ thay đổi chưa lưu?".
        <ConfirmDialog
          open={open && saveConfirmOpen}
          onOpenChange={(next) => {
            if (!next) cancelSaveRequest()
          }}
          icon={SAVE_CONFIRM_ICON[saveRequest.action]}
          tone={saveCopy.tone}
          title={saveCopy.title}
          description={saveCopy.description}
          confirmLabel={
            isPending || pendingAction !== null ? t('common:saving') : saveCopy.confirmLabel
          }
          cancelLabel={t('common:back')}
          isPending={isPending || pendingAction !== null}
          onConfirm={runSaveRequest}
        />
      )}
    </>
  )
}
