import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { ReceiptIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { formatCurrency, formatDate, formatQuantity } from '@/shared/lib/format'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { Combobox } from '@/shared/ui/Combobox'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FormSheet } from '@/shared/ui/FormSheet'
import { NumberInput } from '@/shared/ui/NumberInput'
import { SummaryList, type SummaryItem } from '@/shared/ui/SummaryList'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
import {
  SUPPLIER_TRANSACTION_TYPES,
  supplierKeys,
  useAllSupplierMaterials,
  useCreateSupplierTransaction,
} from '@/entities/supplier'
import {
  previewAmount,
  toTransactionInput,
  transactionFormSchema,
  type TransactionFormValues,
} from '../model/transaction-form.schema'

const FIELD_BY_CODE = {
  101213: 'materialSlug',
  101216: 'quantity',
  101217: 'unitPrice',
  101218: 'amount',
  101219: 'transactionDate',
} as const

/** Tiền có thể lẻ 2 số (0,1 × 3 = 0,3) nên không làm tròn về đồng như bảng. */
const money = (value: number | undefined) => formatCurrency(value, { maximumFractionDigits: 2 })

const emptyValues = (canViewMaterials: boolean): TransactionFormValues => ({
  // Thiếu MATERIAL_READ không chọn được vật tư → chỉ còn Thanh toán.
  type: canViewMaterials ? 'PURCHASE' : 'PAYMENT',
  materialSlug: '',
  quantity: undefined,
  unitPrice: undefined,
  amount: undefined,
  transactionDate: format(new Date(), 'yyyy-MM-dd'),
  note: '',
})

// Dựng schema mỗi lần kiểm tra để "hôm nay" không cũ đi nếu sheet mở qua nửa đêm.
const resolver: Resolver<TransactionFormValues> = (values, context, options) =>
  (zodResolver(transactionFormSchema()) as unknown as Resolver<TransactionFormValues>)(
    values,
    context,
    options,
  )

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: { slug: string; code: string }
  /** Có xem được vật tư không (`MATERIAL_READ`). `false` → chỉ ghi được Thanh toán. */
  canViewMaterials: boolean
  /** Nhà cung cấp chưa gắn vật tư → dẫn người dùng sang tab Vật tư. */
  onGoToMaterials: () => void
}

/** Ghi giao dịch mua/trả/thanh toán. Sổ không sửa được nên luôn hỏi xác nhận trước khi gửi. */
export function SupplierTransactionFormSheet({
  open,
  onOpenChange,
  supplier,
  canViewMaterials,
  onGoToMaterials,
}: Props) {
  const { t } = useTranslation(['suppliers', 'common'])
  const qc = useQueryClient()
  const create = useCreateSupplierTransaction()
  const materials = useAllSupplierMaterials(supplier.slug, { enabled: open && canViewMaterials })

  const form = useForm<TransactionFormValues>({
    resolver,
    mode: 'onTouched',
    defaultValues: emptyValues(canViewMaterials),
  })
  const [type, materialSlug, quantity, unitPrice] = useWatch({
    control: form.control,
    name: ['type', 'materialSlug', 'quantity', 'unitPrice'],
  })
  const isMaterial = type !== 'PAYMENT'

  useEffect(() => {
    if (open) form.reset(emptyValues(canViewMaterials))
  }, [open, form, canViewMaterials])

  const items = materials.data?.items ?? []
  const options = items.map((m) => ({ value: m.slug, label: `${m.code} · ${m.name}` }))
  const selectedMaterial = items.find((m) => m.slug === materialSlug)
  const noMaterials = isMaterial && materials.isSuccess && items.length === 0

  const [pending, setPending] = useState<TransactionFormValues | null>(null)
  if (!open && pending) setPending(null)

  const handleError = (error: unknown) => {
    // 101213: vật tư đã không còn gắn → danh sách vật tư trong ô chọn đã cũ, tải lại.
    if (isApiError(error) && error.code === 101213)
      void qc.invalidateQueries({ queryKey: supplierKeys.materials(supplier.slug) })
    if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
    toastApiError(error)
  }

  const confirm = () => {
    if (!pending) return
    create.mutate(
      { slug: supplier.slug, input: toTransactionInput(pending) },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          // Đóng hộp xác nhận để lỗi tại ô hiện ra.
          setPending(null)
          handleError(error)
        },
      },
    )
  }

  const summary = (values: TransactionFormValues) => {
    const lines: SummaryItem[] = [
      { label: t('suppliers:fieldType'), value: t(`suppliers:type.${values.type}`) },
    ]
    if (values.type === 'PAYMENT') {
      lines.push({
        label: t('suppliers:fieldAmount'),
        value: <span className="whitespace-nowrap">{money(values.amount)}</span>,
      })
    } else {
      const material = items.find((m) => m.slug === values.materialSlug)
      lines.push(
        {
          label: t('suppliers:fieldMaterial'),
          value: material ? `${material.code} · ${material.name}` : values.materialSlug,
        },
        {
          label: t('suppliers:fieldQuantity'),
          value: (
            <>
              <span className="whitespace-nowrap">
                {formatQuantity(values.quantity)}
                {material?.baseUnitName ? ` ${material.baseUnitName}` : ''}
              </span>
              {' × '}
              <span className="whitespace-nowrap">{money(values.unitPrice)}</span>
            </>
          ),
        },
        {
          label: t('suppliers:fieldPreviewAmount'),
          value: (
            <span className="whitespace-nowrap">
              {money(previewAmount(values.quantity, values.unitPrice))}
            </span>
          ),
        },
      )
    }
    lines.push({
      label: t('suppliers:fieldTransactionDate'),
      value: formatDate(values.transactionDate),
    })
    return lines
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('suppliers:recordTransaction')}
      submitLabel={t('suppliers:recordTransaction')}
      isPending={create.isPending}
      submitDisabled={noMaterials}
      isDirty={form.formState.isDirty}
      confirmation={{
        open: pending !== null,
        onOpenChange: (next) => {
          if (!next) setPending(null)
        },
        icon: <ReceiptIcon />,
        title: t('suppliers:transactionConfirmTitle'),
        description: t('suppliers:transactionConfirmDescription'),
        details: pending && <SummaryList items={summary(pending)} />,
        confirmLabel: t('suppliers:transactionConfirmAction'),
        onConfirm: confirm,
      }}
      onSubmit={form.handleSubmit((values) => setPending(values))}
    >
      <Form {...form}>
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('suppliers:fieldType')}</FormLabel>
              <Select
                value={field.value}
                onValueChange={(next) => {
                  field.onChange(next)
                  // Lỗi của loại cũ không còn áp dụng.
                  form.clearErrors(['materialSlug', 'quantity', 'unitPrice', 'amount'])
                }}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SUPPLIER_TRANSACTION_TYPES.filter(
                    (value) => canViewMaterials || value === 'PAYMENT',
                  ).map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`suppliers:type.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!canViewMaterials && (
                <FormDescription>{t('suppliers:paymentOnlyNoMaterialRead')}</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {isMaterial && noMaterials && (
          <div className="grid justify-items-start gap-2">
            <p className="text-muted-foreground text-sm">
              {t('suppliers:noMaterialsForTransaction')}
            </p>
            <Button type="button" variant="outline" onClick={onGoToMaterials}>
              {t('suppliers:openMaterialsTab')}
            </Button>
          </div>
        )}

        {isMaterial && !noMaterials && (
          <>
            <FormField
              control={form.control}
              name="materialSlug"
              render={({ field }) => (
                <FormItem required>
                  <FormLabel>{t('suppliers:fieldMaterial')}</FormLabel>
                  <FormControl>
                    <Combobox
                      options={options}
                      value={field.value === '' ? undefined : field.value}
                      onChange={(next) => field.onChange(next ?? '')}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      disabled={materials.isError}
                      placeholder={
                        materials.isPending
                          ? t('common:loading')
                          : t('suppliers:materialPlaceholder')
                      }
                    />
                  </FormControl>
                  {materials.isError && (
                    <p role="alert" className="text-destructive text-sm">
                      {resolveApiErrorMessage(materials.error)}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem required>
                  <FormLabel>{t('suppliers:fieldQuantity')}</FormLabel>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <NumberInput
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </FormControl>
                    {selectedMaterial?.baseUnitName && (
                      <span className="text-muted-foreground text-sm">
                        {selectedMaterial.baseUnitName}
                      </span>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unitPrice"
              render={({ field }) => (
                <FormItem required>
                  <FormLabel>{t('suppliers:fieldUnitPrice')}</FormLabel>
                  <FormControl>
                    <NumberInput
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
              <FormLabel>{t('suppliers:fieldPreviewAmount')}</FormLabel>
              <FormControl>
                <Input readOnly value={money(previewAmount(quantity, unitPrice))} />
              </FormControl>
              <FormDescription>{t('suppliers:previewAmountHint')}</FormDescription>
            </FormItem>
          </>
        )}

        {!isMaterial && (
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem required>
                <FormLabel>{t('suppliers:fieldAmount')}</FormLabel>
                <FormControl>
                  <NumberInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="transactionDate"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('suppliers:fieldTransactionDate')}</FormLabel>
              <FormControl>
                <DatePicker
                  value={field.value}
                  onChange={(next) => field.onChange(next ?? '')}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('suppliers:columnNote')}</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    </FormSheet>
  )
}
