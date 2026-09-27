import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { toastApiError } from '@/shared/lib/toast-error'
import { FormSheet } from '@/shared/ui/FormSheet'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { Switch } from '@/shared/ui/switch'
import { Textarea } from '@/shared/ui/textarea'
import {
  useCreateWarehouse,
  useUpdateWarehouse,
  type Warehouse,
  type WarehouseInput,
} from '@/entities/warehouse'

type WarehouseErrorKey =
  | 'warehouses:codeRequired'
  | 'warehouses:codeInvalid'
  | 'warehouses:nameRequired'
  | 'warehouses:addressRequired'

/**
 * Backend chặt hơn một chút (`^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$`: không mở/đóng bằng gạch
 * ngang). Ở FE giữ bản dễ đọc này để bắt lỗi thường gặp ngay tại ô; trường hợp còn lại backend trả
 * 100505 và cũng hiện đúng dưới ô Mã — backend vẫn là chốt chặn.
 */
const CODE_REGEX = /^[A-Za-z0-9-]{2,32}$/

const schema = z.object({
  code: z
    .string()
    .min(1, 'warehouses:codeRequired' satisfies WarehouseErrorKey)
    .regex(CODE_REGEX, 'warehouses:codeInvalid' satisfies WarehouseErrorKey),
  name: z.string().min(1, 'warehouses:nameRequired' satisfies WarehouseErrorKey),
  address: z.string().min(1, 'warehouses:addressRequired' satisfies WarehouseErrorKey),
  phonenumber: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean(),
})

// Mã lỗi backend thuộc về một ô cụ thể. Phần còn lại (404, isActive không hợp lệ) đi toast.
const FIELD_BY_CODE = {
  100503: 'name',
  100505: 'code',
  100506: 'code',
  100507: 'code',
  100509: 'phonenumber',
} as const

const EMPTY_FORM: WarehouseInput = {
  code: '',
  name: '',
  address: '',
  phonenumber: '',
  description: '',
  isActive: true,
}

/**
 * Ô tuỳ chọn CÓ validator định dạng ở backend (`phonenumber`: `@Matches`) không được gửi chuỗi
 * rỗng — `@IsOptional()` chỉ bỏ qua `undefined`/`null`, còn `''` vẫn chạy `@Matches` và trả 100509.
 * Ô tuỳ chọn chỉ có `@IsOptional()` (`description`) gửi `''` được, và đó là cách duy nhất để xoá
 * nội dung cũ khi sửa.
 */
function toApiInput(values: WarehouseInput): WarehouseInput {
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    address: values.address.trim(),
    phonenumber: values.phonenumber?.trim() || undefined,
    description: values.description ?? '',
    isActive: values.isActive,
  }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Có = sửa kho này; không có = tạo mới. */
  warehouse?: Warehouse
}

export function WarehouseFormSheet({ open, onOpenChange, warehouse }: Props) {
  const { t } = useTranslation(['warehouses', 'common'])
  const create = useCreateWarehouse()
  const update = useUpdateWarehouse()
  const isPending = create.isPending || update.isPending

  const form = useForm<WarehouseInput>({ resolver: zodResolver(schema), defaultValues: EMPTY_FORM })
  // Sửa: khoá Lưu tới khi khác giá trị đã `reset` lúc mở sheet. KHÔNG khoá vì form chưa hợp lệ —
  // bấm Lưu vẫn phải báo lỗi tại từng ô và focus ô lỗi đầu tiên.
  const submitDisabled = warehouse ? !form.formState.isDirty : false

  // Mở lại sheet không được còn giá trị/lỗi của lần trước.
  useEffect(() => {
    if (!open) return
    form.reset(
      warehouse
        ? {
            code: warehouse.code,
            name: warehouse.name,
            address: warehouse.address,
            phonenumber: warehouse.phonenumber ?? '',
            description: warehouse.description ?? '',
            isActive: warehouse.isActive,
          }
        : EMPTY_FORM,
    )
  }, [open, warehouse, form])

  const handleError = (error: unknown) => {
    if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
    toastApiError(error)
  }

  const onSubmit = (values: WarehouseInput) => {
    const input = toApiInput(values)
    const options = { onSuccess: () => onOpenChange(false), onError: handleError }
    if (warehouse) {
      update.mutate({ slug: warehouse.slug, input }, options)
    } else {
      create.mutate(input, options)
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={warehouse ? t('warehouses:edit') : t('warehouses:create')}
      submitLabel={warehouse ? t('common:save') : t('warehouses:create')}
      isPending={isPending}
      submitDisabled={submitDisabled}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('warehouses:columnCode')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('warehouses:columnName')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('warehouses:columnAddress')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phonenumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('warehouses:columnPhonenumber')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('warehouses:fieldDescription')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} ref={field.ref} />
              </FormControl>
              <FormLabel>{t('warehouses:fieldIsActive')}</FormLabel>
            </FormItem>
          )}
        />
      </Form>
    </FormSheet>
  )
}
