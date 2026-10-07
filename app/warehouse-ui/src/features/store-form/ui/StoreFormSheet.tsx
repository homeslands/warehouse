import { zodResolver } from '@hookform/resolvers/zod'
import { StoreIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
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
import { Switch } from '@/shared/ui/switch'
import { useCreateStore, useUpdateStore, type Store, type StoreInput } from '@/entities/store'

type StoreErrorKey =
  | 'stores:codeRequired'
  | 'stores:codeInvalid'
  | 'stores:nameRequired'
  | 'stores:legalNameRequired'
  | 'stores:taxCodeRequired'
  | 'stores:taxCodeInvalid'

/** Xem ghi chú ở `WarehouseFormSheet`: backend chặt hơn, 101005 vẫn hiện đúng dưới ô Mã. */
const CODE_REGEX = /^[A-Za-z0-9-]{2,32}$/
/** Đúng `STORE_TAX_CODE_REGEX` của backend: 10 chữ số + hậu tố chi nhánh 3 chữ số tuỳ chọn. */
const TAX_CODE_REGEX = /^\d{10}(-\d{3})?$/

const schema = z.object({
  code: z
    .string()
    .min(1, 'stores:codeRequired' satisfies StoreErrorKey)
    .regex(CODE_REGEX, 'stores:codeInvalid' satisfies StoreErrorKey),
  name: z.string().min(1, 'stores:nameRequired' satisfies StoreErrorKey),
  legalName: z.string().min(1, 'stores:legalNameRequired' satisfies StoreErrorKey),
  taxCode: z
    .string()
    .min(1, 'stores:taxCodeRequired' satisfies StoreErrorKey)
    .regex(TAX_CODE_REGEX, 'stores:taxCodeInvalid' satisfies StoreErrorKey),
  invoiceAddress: z.string().optional(),
  phonenumber: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  isActive: z.boolean(),
})

const FIELD_BY_CODE = {
  101003: 'name',
  101005: 'code',
  101006: 'code',
  101007: 'code',
  101010: 'taxCode',
  101011: 'taxCode',
  101012: 'phonenumber',
  101013: 'email',
} as const

const EMPTY_FORM: StoreInput = {
  code: '',
  name: '',
  legalName: '',
  taxCode: '',
  invoiceAddress: '',
  phonenumber: '',
  email: '',
  address: '',
  isActive: true,
}

/**
 * `phonenumber` (`@Matches`) và `email` (`@IsEmail`) không nhận chuỗi rỗng — `@IsOptional()` chỉ bỏ
 * qua `undefined`/`null`. `invoiceAddress`/`address` chỉ có `@IsOptional()` nên gửi `''` được, và
 * đó là cách duy nhất để xoá nội dung cũ khi sửa.
 */
function toApiInput(values: StoreInput): StoreInput {
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    legalName: values.legalName.trim(),
    taxCode: values.taxCode.trim(),
    invoiceAddress: values.invoiceAddress ?? '',
    address: values.address ?? '',
    phonenumber: values.phonenumber?.trim() || undefined,
    email: values.email?.trim() || undefined,
    isActive: values.isActive,
  }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Có = sửa cửa hàng này; không có = tạo mới. */
  store?: Store
}

export function StoreFormSheet({ open, onOpenChange, store }: Props) {
  const { t } = useTranslation(['stores', 'common'])
  const create = useCreateStore()
  const update = useUpdateStore()
  const isPending = create.isPending || update.isPending

  const form = useForm<StoreInput>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: EMPTY_FORM,
  })
  const submitDisabled = store ? !form.formState.isDirty : false

  useEffect(() => {
    if (!open) return
    form.reset(
      store
        ? {
            code: store.code,
            name: store.name,
            legalName: store.legalName,
            taxCode: store.taxCode,
            invoiceAddress: store.invoiceAddress ?? '',
            phonenumber: store.phonenumber ?? '',
            email: store.email ?? '',
            address: store.address ?? '',
            isActive: store.isActive,
          }
        : EMPTY_FORM,
    )
  }, [open, store, form])

  const handleError = (error: unknown) => {
    if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
    toastApiError(error)
  }

  // Tạo: form hợp lệ → giữ giá trị, hỏi "Xác nhận tạo …" rồi mới gửi. Sửa: lưu thẳng.
  const [toCreate, setToCreate] = useState<StoreInput | null>(null)
  if (!open && toCreate) setToCreate(null)

  const confirmCreate = () => {
    if (!toCreate) return
    create.mutate(toApiInput(toCreate), {
      onSuccess: () => onOpenChange(false),
      onError: (error) => {
        // Đóng hộp xác nhận để lỗi tại ô (vd mã đã tồn tại) hiện ra.
        setToCreate(null)
        handleError(error)
      },
    })
  }

  const onSubmit = (values: StoreInput) => {
    if (!store) {
      setToCreate(values)
      return
    }
    update.mutate(
      { slug: store.slug, input: toApiInput(values) },
      { onSuccess: () => onOpenChange(false), onError: handleError },
    )
  }

  const textField = (
    name:
      | 'code'
      | 'name'
      | 'legalName'
      | 'taxCode'
      | 'invoiceAddress'
      | 'phonenumber'
      | 'email'
      | 'address',
    label: string,
    required = false,
    hint?: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem required={required}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} value={field.value ?? ''} />
          </FormControl>
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={store ? t('stores:edit') : t('stores:create')}
      submitLabel={store ? t('common:save') : t('stores:create')}
      isPending={isPending}
      submitDisabled={submitDisabled}
      isDirty={form.formState.isDirty}
      confirmation={
        store
          ? undefined
          : {
              open: toCreate !== null,
              onOpenChange: (next) => {
                if (!next) setToCreate(null)
              },
              icon: <StoreIcon />,
              title: t('stores:createConfirmTitle'),
              description: t('stores:createConfirmDescription'),
              details: toCreate && (
                <SummaryList
                  items={[
                    { label: t('stores:columnCode'), value: toCreate.code.trim() },
                    { label: t('stores:columnName'), value: toCreate.name.trim() },
                    { label: t('stores:columnTaxCode'), value: toCreate.taxCode.trim() },
                  ]}
                />
              ),
              confirmLabel: t('stores:createConfirmAction'),
              onConfirm: confirmCreate,
            }
      }
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        {textField('code', t('stores:columnCode'), true, t('stores:codeHint'))}
        {textField('name', t('stores:columnName'), true)}
        {textField('legalName', t('stores:columnLegalName'), true)}
        {textField('taxCode', t('stores:columnTaxCode'), true, t('stores:taxCodeHint'))}
        {textField('invoiceAddress', t('stores:fieldInvoiceAddress'))}
        {textField('address', t('stores:fieldAddress'))}
        {textField('phonenumber', t('stores:fieldPhonenumber'))}
        {textField('email', t('stores:fieldEmail'))}

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} ref={field.ref} />
              </FormControl>
              <FormLabel>{t('stores:fieldIsActive')}</FormLabel>
            </FormItem>
          )}
        />
      </Form>
    </FormSheet>
  )
}
