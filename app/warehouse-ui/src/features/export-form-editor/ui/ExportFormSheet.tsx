import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import {
  CircleCheckIcon,
  FilePenLineIcon,
  FilePlus2Icon,
  ReceiptTextIcon,
  SendIcon,
} from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import {
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type FieldPath,
  type Resolver,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { isApiError } from '@/shared/api/http'
import type { Paginated } from '@/shared/api/types'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { changedFieldLabels } from '@/shared/lib/changed-fields'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { formatCurrency } from '@/shared/lib/format'
import { roundMoney } from '@/shared/lib/number'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { Form } from '@/shared/ui/form'
import { FormSheet, type FormSheetActionsContext } from '@/shared/ui/FormSheet'
import { Skeleton } from '@/shared/ui/skeleton'
import { WizardStepper } from '@/shared/ui/WizardStepper'
import {
  exportFormKeys,
  isShortageError,
  useExportForm,
  type ExportForm,
  type ExportFormType,
} from '@/entities/export-form'
import { inventoryKeys, useWarehouseInventory, type InventoryItem } from '@/entities/inventory'
import {
  MATERIAL_BATCH_PICKER_SIZE,
  materialBatchKeys,
  useBatchesOfMaterials,
  type MaterialBatch,
} from '@/entities/material-batch'
import { ExportFormInfoStep } from './ExportFormInfoStep'
import { ExportFormInfoSummary } from './ExportFormInfoSummary'
import { ExportFormItemsField } from './ExportFormItemsField'
import { ExportFormReviewStep, type ReviewJumpField } from './ExportFormReviewStep'
import {
  useExportFormSave,
  type ExportFormSaveOutcome,
  type SubmitFailure,
} from './useExportFormSave'
import { findShortages } from '../model/availability'
import { knownBatches } from '../model/batch-availability'
import {
  buildExportFormSchema,
  emptyExportFormValues,
  toExportFormInput,
  toExportFormValues,
  type ExportFormItemValues,
  type ExportFormValues,
} from '../model/export-form-editor.schema'
import { fallbackMaterialsOf } from '../model/fallback'
import { EXPORT_STOCK_SIZE } from '../model/material-search'
import { clearLinePrices, pricedLinesCount } from '../model/pricing'
import { exportSaveConfirmCopy, type ExportSaveAction } from '../model/save-confirm'
import { exportFormStepStatus } from '../model/steps'
import {
  WIZARD_STEPS,
  firstErrorField,
  firstStepWithError,
  stepFields,
  stepIndex,
  type WizardStep,
} from '../model/wizard'

/** Một trang vật tư của kho — cùng tham số ở mọi nơi để đọc lại đúng cache sau khi tải lại. */
const STOCK_PARAMS = { page: 1, size: EXPORT_STOCK_SIZE }

const FIELD_BY_CODE = {
  101402: 'code',
  101403: 'code',
  101404: 'code',
  101405: 'code',
  101406: 'type',
  101407: 'purchaseOrder',
  101408: 'purchaseOrder',
  101409: 'invoiceCode',
  101410: 'receiver',
  101411: 'receiver',
  101413: 'file',
  101434: 'file',
} as const

/**
 * Lỗi thuộc bước ② mà không gắn được vào ô (backend không trả chỉ số dòng): tổng (101412), số dòng (101418 / 101419)
 * và lỗi theo dòng 101420–101433.
 */
const isItemsError = (error: unknown) =>
  isApiError(error) &&
  error.code !== undefined &&
  (error.code === 101412 || (error.code >= 101418 && error.code <= 101433))

/**
 * Cú bấm thứ hai trở đi của một lần bấm đúp (`detail > 1`). Chân sheet đổi nút ngay khi đổi bước, nên cú bấm thứ hai
 * rơi vào nút mới ở cùng chỗ (vd "Tiếp tục" ② → "Lưu & gửi duyệt" ③) — phải bỏ qua. Bàn phím có `detail === 0`.
 */
const isRepeatClick = (event: MouseEvent<HTMLButtonElement>) => event.detail > 1

/** Icon của hộp hỏi trước khi lưu, theo hành động (gửi duyệt / xác nhận giống hộp ở trang chi tiết). */
const SAVE_CONFIRM_ICON: Record<ExportSaveAction, ReactNode> = {
  createDraft: <FilePlus2Icon />,
  saveSubmit: <SendIcon />,
  submitConfirm: <CircleCheckIcon />,
  saveEdit: <FilePenLineIcon />,
}

/**
 * Lần lưu đang chờ hỏi, chốt lúc bấm: hành động, giá trị đã hợp lệ, form có đổi so với mốc không (nút gộp khi sửa:
 * chưa đổi → chỉ gửi duyệt), nhãn các ô đã sửa.
 */
type SaveRequest = {
  action: ExportSaveAction
  values: ExportFormValues
  dirty: boolean
  changed: string[]
}

/** Schema theo lý do xuất đang chọn: chỉ Bán mới bắt nhập đơn giá. */
const resolver: Resolver<ExportFormValues> = (values, context, options) =>
  zodResolver(buildExportFormSchema({ sale: values.type === 'SALE' }))(values, context, options)

const formTotal = (items: ExportFormItemValues[] | undefined) =>
  roundMoney(
    (items ?? []).reduce(
      (sum, i) =>
        typeof i.quantity === 'number' && typeof i.unitPrice === 'number'
          ? sum + i.quantity * i.unitPrice
          : sum,
      0,
    ),
  )

const NO_BATCHES: ReadonlyMap<string, MaterialBatch> = new Map()

/**
 * Bước ③ tự theo dõi giá trị form (`useWatch` toàn form) — chỉ khung nhỏ này vẽ lại theo từng phím gõ, không phải cả
 * sheet. Vẫn mount khi ẩn như hai bước kia.
 */
function ReviewStepWatcher({
  control,
  ...rest
}: Omit<ComponentProps<typeof ExportFormReviewStep>, 'values'> & {
  control: Control<ExportFormValues>
}) {
  // Không truyền `name` → RHF trả toàn bộ giá trị form (kiểu khai là DeepPartial, giá trị thật là đủ).
  const values = useWatch({ control }) as ExportFormValues
  return <ExportFormReviewStep values={values} {...rest} />
}

type ExportFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouseSlug: string
  /** Tên kho cho tiêu đề "Tạo phiếu xuất · <kho>". */
  warehouseName?: string
  /** Có = sửa phiếu này (sheet tự tải chi tiết); không có = tạo mới. Trang cha đã kiểm quyền sửa. */
  formSlug?: string
  /** Mã phiếu đang sửa nếu trang cha đã biết — tiêu đề có mã ngay khi chi tiết còn đang tải. */
  formCode?: string
  /** Quyền gửi duyệt (như quyền sửa): "Lưu & gửi duyệt". */
  canSubmit: boolean
  /** EXPORT_FORM_CONFIRM: cùng `canSubmit` mới có "Gửi & xác nhận" (khi tạo). */
  canConfirm: boolean
  /** EXPORT_FORM_APPROVE_DISPOSAL: Xuất huỷ mới được "Gửi & xác nhận". */
  canApproveDisposal: boolean
  /** WAREHOUSE_READ: Chuyển kho chọn được kho đích từ danh sách. */
  canReadWarehouses: boolean
  /** MATERIAL_READ + WAREHOUSE_READ: chọn lô tay. */
  canPickBatch: boolean
  /** Kết quả lưu — trang cha tự toast (sheet không bao giờ toast thành công). */
  onSaved?: (outcome: ExportFormSaveOutcome) => void
}

/**
 * Form phiếu xuất (tạo + sửa) trong `FormSheet` rộng, wizard 3 bước (① Thông tin phiếu → ② Chi tiết vật tư →
 * ③ Kiểm tra & gửi) — đi lại / focus / chặn bấm đúp / Enter / 409 giống hệt `ImportFormSheet`. Ba bước luôn mount,
 * bước không hiện có `hidden`. Tạo chỉ lưu được ở ③; sửa lưu ở mọi bước. Mọi nút lưu (và Enter khi sửa) mở hộp hỏi
 * (`ConfirmDialog`) trước khi gửi. Gửi duyệt lỗi sau khi đã tạo phiếu → sheet ở lại, thành sửa phiếu vừa tạo (lần sau
 * là PATCH + gửi, không tạo phiếu thứ hai).
 */
export function ExportFormSheet({
  open,
  onOpenChange,
  warehouseSlug,
  warehouseName,
  formSlug,
  formCode,
  canSubmit,
  canConfirm,
  canApproveDisposal,
  canReadWarehouses,
  canPickBatch,
  onSaved,
}: ExportFormSheetProps) {
  const { t } = useTranslation(['exportForms', 'common'])
  const qc = useQueryClient()
  const reasonId = useId()
  const detail = useExportForm(warehouseSlug, formSlug ?? '', {
    enabled: open && formSlug !== undefined,
  })
  /**
   * Phiếu sheet đang sửa sau một lần gửi duyệt lỗi (vừa tạo, hoặc vừa PATCH): giữ `slug` + `version` mới nhất để lần
   * bấm sau không tạo phiếu thứ hai, và để chi tiết tải lại không ghi đè form. Đóng sheet thì bỏ.
   */
  const [session, setSession] = useState<ExportForm | null>(null)
  const original = session ?? (formSlug !== undefined ? detail.data : undefined)
  const editing = formSlug !== undefined || session !== null
  const editable = original?.status === 'DRAFT'
  const inventory = useWarehouseInventory(warehouseSlug, STOCK_PARAMS, { enabled: open })
  const [uploading, setUploading] = useState(false)
  // Lô chọn tay trong phiên (khả dụng lúc chọn) — dự phòng khi danh sách lô của vật tư chưa tải.
  const [pickedBatches, setPickedBatches] = useState<ReadonlyMap<string, MaterialBatch>>(NO_BATCHES)
  // Hộp "Bỏ đơn giá của n dòng?" — giữ nội dung lần cuối để hộp mờ dần không đổi chữ.
  const [dropPrices, setDropPrices] = useState<{ next: ExportFormType; count: number } | null>(null)
  const [dropOpen, setDropOpen] = useState(false)
  // Giá trị thô lúc bấm gửi — gửi duyệt lỗi thì đặt làm mốc "chưa đổi" của phiếu đã lưu.
  const submittedRaw = useRef<ExportFormValues | null>(null)
  // Mọi nút lưu hỏi lại trước khi gửi (`ConfirmDialog`). `saveRequest` giữ nguyên khi hộp đóng để nội dung không
  // biến mất lúc hộp đang mờ dần; `saveConfirmOpen` mới là trạng thái mở.
  const [saveRequest, setSaveRequest] = useState<SaveRequest | null>(null)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  // Phần tử đã mở hộp (nút lưu / ô vừa nhấn Enter) — "Quay lại" / Esc trả focus về đó. Radix chỉ trả focus về
  // `Dialog.Trigger`, hộp này không có trigger.
  const saveTriggerRef = useRef<HTMLElement | null>(null)

  // Mở sheet → bắt đầu lại: tạo ở ①, sửa ở ② (phần hay sửa nhất).
  const initialStep: WizardStep = formSlug !== undefined ? 'items' : 'info'
  const [step, setStep] = useState<WizardStep>(initialStep)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setStep(initialStep)
  }
  if (!open && session) setSession(null)
  if (!open && pickedBatches.size > 0) setPickedBatches(NO_BATCHES)
  if (!open && uploading) setUploading(false)
  if (!open && saveConfirmOpen) setSaveConfirmOpen(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const sectionRefs = {
    info: useRef<HTMLElement>(null),
    items: useRef<HTMLElement>(null),
    review: useRef<HTMLElement>(null),
  }

  const form = useForm<ExportFormValues>({
    resolver,
    mode: 'onTouched',
    defaultValues: emptyExportFormValues(new Date()),
  })
  // Mỗi lần mở: tạo → form trống; sửa → điền khi chi tiết về. Đã thành phiếu của phiên (`session`) thì sheet tự giữ
  // form — chi tiết tải lại (sau PATCH / gửi duyệt) không được ghi đè.
  useEffect(() => {
    if (!open || session) return
    if (formSlug === undefined) form.reset(emptyExportFormValues(new Date()))
    else if (detail.data) form.reset(toExportFormValues(detail.data))
  }, [open, formSlug, detail.data, session, form])

  const items = useWatch({ control: form.control, name: 'items' })
  const type = useWatch({ control: form.control, name: 'type' })
  const receiver = useWatch({ control: form.control, name: 'receiver' })
  const purchaseOrder = useWatch({ control: form.control, name: 'purchaseOrder' })
  const sale = type === 'SALE'
  const isDirty = form.formState.isDirty
  // Đọc trong lúc render để RHF theo dõi `dirtyFields` (proxy của formState chỉ cập nhật trường đã được đọc).
  const dirtyFields = form.formState.dirtyFields

  /** Nhãn "Đã sửa" của hộp hỏi khi sửa: các ô bước ① theo nhãn trên màn hình, "Dòng vật tư" nếu dòng đổi. */
  const changedLabels = () =>
    changedFieldLabels(dirtyFields, {
      type: t('exportForms:fieldType'),
      // Cùng nhãn với `ReceiverField`: "Kho nhận" chỉ khi Chuyển kho chọn được kho từ danh sách.
      receiver:
        type === 'TRANSFER' && canReadWarehouses
          ? t('exportForms:fieldReceiverWarehouse')
          : t('exportForms:fieldReceiver'),
      purchaseOrder: t('exportForms:fieldPurchaseOrder'),
      invoiceCode: t('exportForms:fieldInvoiceCode'),
      file: t('exportForms:fieldFile'),
      note: t('exportForms:fieldNote'),
      code: t('exportForms:fieldCode'),
      items: t('exportForms:changedItems'),
    })

  // Đóng tab khi đang sửa dở → hộp hỏi gốc của trình duyệt.
  useEffect(() => {
    if (!open || !isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [open, isDirty])

  const stockItems = inventory.data?.items ?? []
  const stock = new Map(stockItems.map((i) => [i.materialSlug, i]))
  const fallbackMaterials = fallbackMaterialsOf(original?.items)
  // Lô của các vật tư có dòng chọn lô: query "đang chạy" để invalidate lô (sau gửi duyệt) tải lại số khả dụng.
  const batchMaterials = (items ?? []).filter((i) => i.batchSlug !== '').map((i) => i.materialSlug)
  const batchLists = useBatchesOfMaterials(warehouseSlug, batchMaterials, {
    enabled: open && canPickBatch,
  })
  // Lô đã chọn không còn trong danh sách mới → khả dụng 0 (lô đã hết): dòng bị đánh dấu, nút gửi khoá.
  const batches = knownBatches(items ?? [], pickedBatches, batchLists, MATERIAL_BATCH_PICKER_SIZE)
  const shortages = findShortages(items ?? [], stock, batches)
  const blocked = shortages.length > 0

  /** Vượt khả dụng theo số MỚI trong cache (sau khi tồn / lô đã tải lại) — chưa đợi sheet vẽ lại. */
  const freshShortages = () => {
    const values = form.getValues('items')
    const page = qc.getQueryData<Paginated<InventoryItem>>(
      inventoryKeys.list(warehouseSlug, STOCK_PARAMS),
    )
    const lists = new Map<string, MaterialBatch[]>()
    for (const m of new Set(values.filter((i) => i.batchSlug !== '').map((i) => i.materialSlug))) {
      const list = qc.getQueryData<MaterialBatch[]>(materialBatchKeys.material(warehouseSlug, m))
      if (list) lists.set(m, list)
    }
    return findShortages(
      values,
      new Map((page?.items ?? []).map((i) => [i.materialSlug, i])),
      knownBatches(values, pickedBatches, lists, MATERIAL_BATCH_PICKER_SIZE),
    )
  }

  /**
   * Hiện bước `target` rồi mới focus — ô ở bước bị `hidden` không nhận focus. Có `field` → focus ô đó (ô lỗi, ô của
   * dòng); không có → cuộn vùng nội dung lên đầu và focus tiêu đề bước cho bàn phím / trình đọc màn hình.
   */
  const show = (target: WizardStep, field?: FieldPath<ExportFormValues> | null) => {
    flushSync(() => setStep(target))
    const section = sectionRefs[target].current
    const heading = () => section?.querySelector<HTMLElement>('h2[tabindex="-1"]')
    // `items` (lỗi cấp mảng) không phải một ô — focus tiêu đề bước.
    if (field && field !== 'items') {
      form.setFocus(field)
      // Dự phòng khi ô không nhận focus qua RHF: ô `aria-invalid` đầu tiên của bước, không có thì tiêu đề bước.
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
    ) as FieldErrors<ExportFormValues>

  /** Lùi luôn được. Tiến: kiểm lần lượt các bước trước `target`, dừng ở bước sai đầu tiên. Đang upload thì không tiến. */
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
  const showFirstError = (errors: FieldErrors<ExportFormValues>) => {
    const s = firstStepWithError(errors)
    if (s) show(s, firstErrorField(errors, s))
  }

  const jumpToLine = (index: number, field: ReviewJumpField) =>
    show('items', `items.${index}.${field}`)

  /**
   * Hộp hỏi lưu đang mở thì giữ focus trong nó — phải đóng NGAY (`flushSync`) trước khi chuyển bước / focus ô lỗi.
   */
  const dismissSaveConfirm = () => {
    saveTriggerRef.current = null
    flushSync(() => setSaveConfirmOpen(false))
  }

  const finish = (outcome: ExportFormSaveOutcome) => {
    dismissSaveConfirm()
    onOpenChange(false)
    onSaved?.(outcome)
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
    toast.error(t('exportForms:conflict'))
    void qc.invalidateQueries({ queryKey: exportFormKeys.warehouse(warehouseSlug) })
  }

  /**
   * Gửi duyệt lỗi, phiếu vẫn Nháp: sheet thành sửa phiếu đó (giữ `slug` + `version`), mốc "chưa đổi" = giá trị vừa gửi
   * (giữ nguyên giá trị đang hiện — `keepValues` không dựng lại các dòng, focus không mất). Đã lưu được gì trong lần
   * bấm này → trang cha báo "đã lưu nháp nhưng chưa gửi duyệt"; chưa → chỉ báo lỗi. Về ②; thiếu hàng (tồn / lô đã tải
   * lại) → focus ô Số lượng của dòng thiếu đầu tiên.
   */
  const handleSubmitFailed = ({ form: draft, error, saved }: SubmitFailure) => {
    dismissSaveConfirm()
    setSession(draft)
    if (saved) {
      form.reset(submittedRaw.current ?? undefined, { keepValues: true })
      onSaved?.({ form: draft, stage: 'draft', error })
    } else toastApiError(error)
    const short = isShortageError(error) ? freshShortages() : []
    show('items', short.length > 0 ? `items.${short[0].index}.quantity` : null)
  }

  const save = useExportFormSave({
    warehouseSlug,
    onFinish: finish,
    onStale: handleStale,
    onSaveError: handleError,
    onSubmitFailed: handleSubmitFailed,
  })
  const { isPending, pendingAction } = save

  /** Đổi lý do: rời Bán khi có dòng đã nhập giá → hỏi trước; xoá giá (không đặt 0) để quay lại Bán thì phải nhập. */
  const onTypeChange = (next: ExportFormType, prev: ExportFormType | undefined) => {
    if (prev !== 'SALE' || next === 'SALE') return true
    const lines = form.getValues('items')
    const count = pricedLinesCount(lines)
    if (count > 0) {
      setDropPrices({ next, count })
      setDropOpen(true)
      return false
    }
    if (lines.some((i) => i.unitPrice !== undefined)) clearLinePrices(form)
    return true
  }
  const confirmDropPrices = () => {
    if (!dropPrices) return
    clearLinePrices(form)
    form.setValue('type', dropPrices.next, {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    })
    setDropOpen(false)
  }

  /**
   * Mọi nút lưu: kiểm toàn phiếu (`onInvalid` → sang bước có lỗi), hợp lệ thì mở hộp hỏi với giá trị đã hợp lệ —
   * chưa gửi gì. `trigger` = phần tử nhận lại focus khi người dùng lùi khỏi hộp.
   */
  const requestSave = (action: ExportSaveAction, trigger: Element | null) =>
    form.handleSubmit((values) => {
      saveTriggerRef.current = trigger instanceof HTMLElement ? trigger : null
      setSaveRequest({ action, values, dirty: isDirty, changed: editing ? changedLabels() : [] })
      setSaveConfirmOpen(true)
    }, showFirstError)

  /**
   * Bấm xác nhận trong hộp: chạy đúng luồng lưu cũ của hành động. Hộp mở tới khi gửi xong (khoá khi đang gửi); mọi
   * kết cục đi qua `finish` / `handleError` / `handleStale` / `handleSubmitFailed` (đóng hộp trước khi chuyển bước).
   */
  const runSaveRequest = () => {
    if (!saveRequest || isPending) return
    const { action, values, dirty } = saveRequest
    let run: Promise<void>
    if (action === 'createDraft') run = save.saveDraft(values)
    else if (action === 'saveEdit') {
      if (!original) return
      run = save.saveEdit(original, values)
    } else {
      submittedRaw.current = structuredClone(form.getValues())
      run = save.saveAndSubmit(values, { original, dirty, andConfirm: action === 'submitConfirm' })
    }
    void run.finally(() => setSaveConfirmOpen(false))
  }

  /** "Quay lại" / Esc / bấm ra ngoài: đóng hộp, không gửi gì, focus về chỗ đã mở hộp. */
  const cancelSaveRequest = () => {
    const trigger = saveTriggerRef.current
    saveTriggerRef.current = null
    flushSync(() => setSaveConfirmOpen(false))
    trigger?.focus()
  }

  /** Lưu & gửi duyệt / Gửi & xác nhận: kiểm toàn phiếu; lỗi ở bước khác → sang bước đó; hợp lệ → hộp hỏi. */
  const submitWith = (andConfirm: boolean) => (e: MouseEvent<HTMLButtonElement>) => {
    if (isRepeatClick(e)) return
    void requestSave(andConfirm ? 'submitConfirm' : 'saveSubmit', e.currentTarget)()
  }

  /**
   * Enter / nút gửi. Sửa: Lưu ở mọi bước, qua hộp hỏi — chưa đổi gì thì không làm gì (như nút Lưu đang khoá). Tạo:
   * ① / ② = Tiếp tục; ③ không làm gì — một phím Enter lỡ tay không được gửi duyệt (giữ chỗ tồn ngay), lưu chỉ qua nút
   * ở chân sheet.
   */
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (editing) {
      if (!isDirty) {
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

  /** Nhãn nút lưu: "Đang lưu..." chỉ trên nút vừa bấm. */
  const savingLabel = (label: string, active: boolean) =>
    isPending && active ? t('common:saving') : label

  const showConfirm = canSubmit && canConfirm && (type !== 'DISPOSAL' || canApproveDisposal)
  /** Lý do khoá hai nút gửi — dòng chữ dưới hàng nút, nối `aria-describedby`. */
  const blockedReason = blocked && canSubmit && (
    <p
      key="reason"
      id={reasonId}
      className="text-destructive order-last basis-full text-right text-xs"
    >
      {t('exportForms:submitBlockedShortage')}
    </p>
  )
  const submitButton = (key: string, andConfirm: boolean, label: string, primary: boolean) => (
    <Button
      key={key}
      type="button"
      variant={primary ? 'default' : 'outline'}
      disabled={isPending || uploading || blocked}
      aria-describedby={blocked ? reasonId : undefined}
      onClick={submitWith(andConfirm)}
    >
      {savingLabel(label, pendingAction === (andConfirm ? 'confirm' : 'submit'))}
    </Button>
  )

  /**
   * Chân sheet khi tạo: ① Huỷ · Tiếp tục; ② Quay lại · Tiếp tục; ③ Quay lại · Lưu nháp · Lưu & gửi duyệt · Gửi & xác
   * nhận. Mỗi nút một `key` riêng — React không được dùng lại node của "Tiếp tục" cho nút lưu khi sang ③.
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
        {step === 'info' ? t('common:cancel') : t('exportForms:back')}
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
            {t('exportForms:next')}
          </Button>
        </>
      )
    }
    // Mọi nút ở ③ là `type="button"`: Enter trong form không được kích hoạt lưu.
    return (
      <>
        {back}
        <Button
          key="draft"
          type="button"
          variant={canSubmit ? 'outline' : 'default'}
          disabled={isPending || uploading}
          onClick={(e) => {
            if (isRepeatClick(e)) return
            void requestSave('createDraft', e.currentTarget)()
          }}
        >
          {savingLabel(t('exportForms:saveDraft'), pendingAction === 'draft')}
        </Button>
        {canSubmit && submitButton('submit', false, t('exportForms:saveAndSubmit'), true)}
        {showConfirm && submitButton('confirm', true, t('exportForms:submitAndConfirm'), false)}
        {blockedReason}
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

  let body: ReactNode = null
  if (editing && !original && detail.isPending) body = loadingBlock
  else if (editing && !original)
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
  else if (editing && !editable)
    body = (
      <p role="alert" className="text-sm">
        {t('exportForms:notEditable')}
      </p>
    )

  /**
   * Chân sheet khi sửa, ở mọi bước: Huỷ · Lưu & gửi duyệt (`canSubmit`) · Gửi & xác nhận (`showConfirm`) · Lưu. Không có Quay lại / Tiếp tục — đi giữa
   * các bước qua dải bước và "sửa". Cả hai nút lưu kiểm toàn phiếu; lỗi ở bước đang ẩn → sang bước đó.
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
      {canSubmit &&
        body === null &&
        submitButton('submit', false, t('exportForms:saveAndSubmit'), false)}
      {showConfirm &&
        body === null &&
        submitButton('confirm', true, t('exportForms:submitAndConfirm'), false)}
      <Button key="save" type="submit" disabled={isPending || uploading || !editable || !isDirty}>
        {savingLabel(t('common:save'), pendingAction === 'save')}
      </Button>
      {body === null && blockedReason}
    </>
  )

  // Mã trong câu hỏi: tạo → mã sẽ gửi (đã chuẩn hoá như payload); sửa → mã phiếu đang sửa.
  const saveCopy =
    saveRequest &&
    exportSaveConfirmCopy(t, saveRequest.action, {
      code: editing
        ? (original?.code ?? formCode ?? '')
        : toExportFormInput(saveRequest.values).code,
      changed: saveRequest.changed,
    })

  const steps = exportFormStepStatus(
    { type, receiver: receiver ?? '', purchaseOrder: purchaseOrder ?? '', items: items ?? [] },
    { sale },
  )

  return (
    <>
      <FormSheet
        open={open}
        onOpenChange={onOpenChange}
        size="wide"
        title={
          editing
            ? t('exportForms:editTitle', { code: original?.code ?? formCode ?? '' })
            : warehouseName
              ? t('exportForms:createTitleIn', { warehouse: warehouseName })
              : t('exportForms:createTitle')
        }
        actions={editing ? editActions : createActions}
        isPending={isPending}
        isDirty={isDirty}
        footerStart={
          // Tổng tiền chỉ có nghĩa khi Bán; khi tạo chỉ từ ② (① chưa có dòng nào).
          body === null && sale && (editing || step !== 'info')
            ? t('exportForms:total', {
                value: formatCurrency(formTotal(items), { maximumFractionDigits: 2 }),
              })
            : undefined
        }
        onSubmit={onSubmit}
      >
        {body ?? (
          <Form {...form}>
            <div ref={contentRef} className="space-y-6">
              <WizardStepper
                ariaLabel={t('exportForms:stepsLabel')}
                current={step}
                onSelect={(key) => void goTo(key as WizardStep)}
                disabled={isPending}
                lockForward={uploading}
                steps={[
                  { key: 'info', label: t('exportForms:stepInfo'), done: steps.infoDone },
                  {
                    key: 'items',
                    label: t('exportForms:stepItems'),
                    extra:
                      steps.lineCount > 0
                        ? t('exportForms:stepLineCount', { count: steps.lineCount })
                        : undefined,
                    done: steps.itemsDone,
                  },
                  { key: 'review', label: t('exportForms:stepReview'), done: false },
                ]}
              />
              <section
                ref={sectionRefs.info}
                hidden={step !== 'info'}
                className="bg-card space-y-5 rounded-xl border p-5 sm:p-6"
              >
                <ExportFormInfoStep
                  form={form}
                  warehouseSlug={warehouseSlug}
                  canReadWarehouses={canReadWarehouses}
                  onUploadingChange={setUploading}
                  onTypeChange={onTypeChange}
                />
              </section>

              <section
                ref={sectionRefs.items}
                hidden={step !== 'items'}
                className="bg-card space-y-4 rounded-xl border p-5 sm:p-6"
              >
                {type && (
                  <ExportFormInfoSummary
                    values={{ type, receiver: receiver ?? '', purchaseOrder: purchaseOrder ?? '' }}
                    onEdit={() => void goTo('info')}
                    disabled={isPending}
                  />
                )}
                {inventory.isPending ? (
                  loadingBlock
                ) : inventory.isError ? (
                  <div
                    role="alert"
                    className="text-destructive flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span>{resolveApiErrorMessage(inventory.error)}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void inventory.refetch()}
                    >
                      {t('common:retry')}
                    </Button>
                  </div>
                ) : (
                  <ExportFormItemsField
                    form={form}
                    warehouseSlug={warehouseSlug}
                    stock={stockItems}
                    stockTotal={inventory.data?.total ?? stockItems.length}
                    shortages={shortages}
                    canPickBatch={canPickBatch}
                    batchesBySlug={batches}
                    onBatchPicked={(b) => setPickedBatches((prev) => new Map(prev).set(b.slug, b))}
                    fallbackMaterials={fallbackMaterials}
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
                  stock={stock}
                  batches={batches}
                  fallbackMaterials={fallbackMaterials}
                  canSubmit={canSubmit}
                  editing={editing}
                  disabled={isPending}
                  onJumpToLine={jumpToLine}
                />
              </section>
            </div>
          </Form>
        )}
      </FormSheet>

      <ConfirmDialog
        open={dropOpen}
        onOpenChange={setDropOpen}
        icon={<ReceiptTextIcon />}
        tone="default"
        title={t('exportForms:dropPricesTitle', { count: dropPrices?.count ?? 0 })}
        description={t('exportForms:dropPricesDescription')}
        confirmLabel={t('exportForms:dropPricesConfirm')}
        cancelLabel={t('exportForms:dropPricesCancel')}
        onConfirm={confirmDropPrices}
      />

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
          confirmLabel={isPending ? t('common:saving') : saveCopy.confirmLabel}
          cancelLabel={t('common:back')}
          isPending={isPending}
          onConfirm={runSaveRequest}
        />
      )}
    </>
  )
}
