import * as React from 'react'
import type { Label as LabelPrimitive } from 'radix-ui'
import { Slot } from 'radix-ui'
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { cn } from '@/shared/lib/cn'
import { translateFormMessage } from '@/shared/lib/form-message'
import { Label } from '@/shared/ui/label'

// Chép từ registry shadcn `new-york-v4/form` (style `radix-nova` không còn phát `form`), sửa:
// - FormMessage tự dịch message là khoá i18n (xem translateFormMessage);
// - KHÔNG export useFormField (react-refresh/only-export-components — giữ lint baseline 1 warning).

const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue)

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

type FormItemContextValue = {
  id: string
  /**
   * Trường bắt buộc: khai một lần ở `<FormItem required>` — dữ liệu tĩnh (không state/effect),
   * `FormLabel` đọc để hiện dấu `*`, `FormControl` đọc để gắn `aria-required`. Xem ghi chú đầy đủ
   * tại `FormItem`.
   */
  required: boolean
}

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue)

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState } = useFormContext()
  const formState = useFormState({ name: fieldContext.name })
  const fieldState = getFieldState(fieldContext.name, formState)

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>')
  }

  const { id, required } = itemContext

  return {
    id,
    required,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

function FormItem({
  className,
  required = false,
  ...props
}: React.ComponentProps<'div'> & {
  /**
   * Trường bắt buộc: `FormLabel` hiện dấu `*` đỏ (aria-hidden, chỉ để mắt nhìn) sau nhãn — KHÔNG
   * dùng thuộc tính `required` gốc của HTML (gây bong bóng validate của trình duyệt). `FormControl`
   * tự gắn `aria-required="true"` cho screen reader từ CÙNG cờ này, khai một lần duy nhất ở đây
   * (nguồn dữ liệu tĩnh qua context — không phải state/effect: không có lần render đầu "thiếu
   * aria-required", không có state cũ sót lại khi đổi `required`).
   */
  required?: boolean
}) {
  const id = React.useId()

  return (
    <FormItemContext.Provider value={{ id, required }}>
      <div data-slot="form-item" className={cn('grid gap-2', className)} {...props} />
    </FormItemContext.Provider>
  )
}

function FormLabel({
  className,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const { error, formItemId, required } = useFormField()

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn('data-[error=true]:text-destructive', className)}
      htmlFor={formItemId}
      {...props}
    >
      {/* Một khối duy nhất (không phải 2 flex item của `Label`) để `gap-2` của `Label` không kéo
          dấu `*` ra xa chữ; khoảng cách sát dùng `ms-0.5` (thang spacing Tailwind, không phải px
          cứng). */}
      <span className="inline-flex items-baseline">
        {children}
        {required && (
          <span aria-hidden="true" className="text-destructive ms-0.5">
            *
          </span>
        )}
      </span>
    </Label>
  )
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot.Root>) {
  const { error, formItemId, formDescriptionId, formMessageId, required } = useFormField()

  return (
    <Slot.Root
      data-slot="form-control"
      id={formItemId}
      aria-describedby={!error ? `${formDescriptionId}` : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      aria-required={required || undefined}
      {...props}
    />
  )
}

function FormDescription({ className, ...props }: React.ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField()

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

function FormMessage({ className, ...props }: React.ComponentProps<'p'>) {
  const { error, formMessageId } = useFormField()
  // Đăng ký theo dõi đổi ngôn ngữ: message dịch lại ngay, không cần submit lại.
  useTranslation()
  const body = error ? translateFormMessage(String(error.message ?? '')) : props.children

  if (!body) {
    return null
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn('text-destructive text-sm', className)}
      {...props}
    >
      {body}
    </p>
  )
}

export { Form, FormItem, FormLabel, FormControl, FormDescription, FormMessage, FormField }
