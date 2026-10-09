import { zodResolver } from '@hookform/resolvers/zod'
import { TruckIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { toastApiError } from '@/shared/lib/toast-error'
import { FormSheet } from '@/shared/ui/FormSheet'
import { SummaryList } from '@/shared/ui/SummaryList'
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
import { Textarea } from '@/shared/ui/textarea'
import { useCreateSupplier, useUpdateSupplier, type Supplier } from '@/entities/supplier'
import {
  EMPTY_SUPPLIER_FORM,
  supplierFormSchema,
  toCreateInput,
  toFormValues,
  toUpdateInput,
  type SupplierFormValues,
} from '../model/supplier-form.schema'

const FIELD_BY_CODE = {
  101202: 'name',
  101203: 'code',
  101204: 'code',
  101205: 'code',
  101206: 'code',
  101207: 'taxCode',
  101208: 'taxCode',
  101209: 'phonenumber',
  101210: 'email',
} as const

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Có = sửa nhà cung cấp này; không có = tạo mới. */
  supplier?: Supplier
}

export function SupplierFormSheet({ open, onOpenChange, supplier }: Props) {
  const { t } = useTranslation(['suppliers', 'common'])
  const create = useCreateSupplier()
  const update = useUpdateSupplier()
  const isPending = create.isPending || update.isPending

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    mode: 'onTouched',
    defaultValues: EMPTY_SUPPLIER_FORM,
  })
  const submitDisabled = supplier ? !form.formState.isDirty : false

  useEffect(() => {
    if (!open) return
    form.reset(supplier ? toFormValues(supplier) : EMPTY_SUPPLIER_FORM)
  }, [open, supplier, form])

  const handleError = (error: unknown) => {
    if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
    toastApiError(error)
  }

  // Tạo: form hợp lệ → giữ giá trị, hỏi xác nhận rồi mới gửi. Sửa: lưu thẳng.
  const [toCreate, setToCreate] = useState<SupplierFormValues | null>(null)
  if (!open && toCreate) setToCreate(null)

  const confirmCreate = () => {
    if (!toCreate) return
    create.mutate(toCreateInput(toCreate), {
      onSuccess: () => onOpenChange(false),
      onError: (error) => {
        // Đóng hộp xác nhận để lỗi tại ô (vd mã đã tồn tại) hiện ra.
        setToCreate(null)
        handleError(error)
      },
    })
  }

  const onSubmit = (values: SupplierFormValues) => {
    if (!supplier) {
      setToCreate(values)
      return
    }
    const input = toUpdateInput(values, supplier)
    // Ô tuỳ chọn xoá trống không được gửi → có thể không còn gì để lưu.
    if (Object.keys(input).length === 0) {
      onOpenChange(false)
      return
    }
    update.mutate(
      { slug: supplier.slug, input },
      { onSuccess: () => onOpenChange(false), onError: handleError },
    )
  }

  const field = (
    name: keyof SupplierFormValues,
    label: string,
    {
      required = false,
      hint,
      multiline = false,
    }: { required?: boolean; hint?: string; multiline?: boolean } = {},
  ) => {
    // Sửa: ô tuỳ chọn không có gợi ý định dạng thì nhắc "để trống = giữ nguyên".
    const description = hint ?? (supplier && !required ? t('suppliers:keepWhenEmpty') : undefined)
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem required={required}>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              {multiline ? <Textarea rows={3} {...field} /> : <Input {...field} />}
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={supplier ? t('suppliers:edit') : t('suppliers:create')}
      submitLabel={supplier ? t('common:save') : t('suppliers:create')}
      isPending={isPending}
      submitDisabled={submitDisabled}
      isDirty={form.formState.isDirty}
      confirmation={
        supplier
          ? undefined
          : {
              open: toCreate !== null,
              onOpenChange: (next) => {
                if (!next) setToCreate(null)
              },
              icon: <TruckIcon />,
              title: t('suppliers:createConfirmTitle'),
              description: t('suppliers:createConfirmDescription'),
              details: toCreate && (
                <SummaryList
                  items={[
                    { label: t('suppliers:columnCode'), value: toCreate.code.trim().toUpperCase() },
                    { label: t('suppliers:columnName'), value: toCreate.name.trim() },
                    { label: t('suppliers:columnTaxCode'), value: toCreate.taxCode.trim() },
                  ]}
                />
              ),
              confirmLabel: t('suppliers:createConfirmAction'),
              onConfirm: confirmCreate,
            }
      }
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        {field('code', t('suppliers:fieldCode'), { required: true, hint: t('suppliers:codeHint') })}
        {field('name', t('suppliers:fieldName'), { required: true })}
        {field('taxCode', t('suppliers:fieldTaxCode'), { hint: t('suppliers:taxCodeHint') })}
        {field('phonenumber', t('suppliers:fieldPhonenumber'), {
          hint: t('suppliers:phonenumberHint'),
        })}
        {field('email', t('suppliers:fieldEmail'))}
        {field('address', t('suppliers:fieldAddress'))}
        {field('contactPerson', t('suppliers:fieldContactPerson'))}
        {field('note', t('suppliers:fieldNote'), { multiline: true })}
      </Form>
    </FormSheet>
  )
}
