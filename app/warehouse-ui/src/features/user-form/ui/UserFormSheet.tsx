import { zodResolver } from '@hookform/resolvers/zod'
import { UserPlusIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useRevalidateWhenTouched } from '@/shared/lib/form-validation'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { MIN_PASSWORD_LENGTH } from '@/shared/lib/password-policy'
import { formatFullName } from '@/shared/lib/person-name'
import { toastApiError } from '@/shared/lib/toast-error'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FormSheet } from '@/shared/ui/FormSheet'
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
import { PasswordInput } from '@/shared/ui/PasswordInput'
import { SummaryList } from '@/shared/ui/SummaryList'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { useRoleLabel } from '@/entities/session'
import { useCreateUser, useUpdateUser, type Role, type User } from '@/entities/user'
import {
  EMPTY_USER_FORM,
  toCreateInput,
  toUpdateInput,
  userFormSchema,
  type UserFormValues,
} from '../model/user-form.schema'

/** Mã lỗi backend → ô. Mã khác → toast. */
const FIELD_BY_CODE = {
  100401: 'phonenumber',
  100402: 'phonenumber',
  100409: 'phonenumber',
  100403: 'password',
  100410: 'firstName',
  100411: 'lastName',
  100412: 'dob',
  100413: 'email',
  100101: 'roleSlug',
  100104: 'roleSlug',
  100404: 'roleSlug',
} as const

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Có = sửa người này (cờ `userUpdate`); không có = tạo mới. */
  user?: User
  /** Vai trò ĐƯỢC GÁN khi tạo — trang đã lọc bằng `assignableRoles`. Sửa không đổi vai trò ở đây. */
  roles: Role[]
}

export function UserFormSheet({ open, onOpenChange, user, roles }: Props) {
  const { t } = useTranslation(['users', 'common'])
  const roleLabel = useRoleLabel()
  const create = useCreateUser()
  const update = useUpdateUser()
  const isPending = create.isPending || update.isPending
  const mode = user ? 'edit' : 'create'

  const originalPhone = user?.phonenumber
  const schema = useMemo(
    () => userFormSchema(mode, undefined, originalPhone),
    [mode, originalPhone],
  )
  const form = useForm<UserFormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: EMPTY_USER_FORM,
  })
  useRevalidateWhenTouched(form, 'password', 'confirmPassword')

  // Mở lại sheet không được còn dữ liệu (hay mật khẩu) của lần trước.
  useEffect(() => {
    if (!open) return
    form.reset(
      user
        ? {
            ...EMPTY_USER_FORM,
            phonenumber: user.phonenumber,
            lastName: user.lastName ?? '',
            firstName: user.firstName ?? '',
            roleSlug: user.roleSlug,
            dob: user.dob ?? undefined,
            email: user.email ?? '',
            address: user.address ?? '',
          }
        : EMPTY_USER_FORM,
    )
  }, [open, user, form])

  const handleError = (error: unknown) => {
    if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
    toastApiError(error)
  }

  // Tạo: form hợp lệ → giữ giá trị, hỏi "Xác nhận thêm người dùng" rồi mới gửi. Sửa: lưu thẳng.
  const [toCreate, setToCreate] = useState<UserFormValues | null>(null)
  if (!open && toCreate) setToCreate(null)

  const confirmCreate = () => {
    if (!toCreate) return
    create.mutate(toCreateInput(toCreate), {
      onSuccess: () => onOpenChange(false),
      onError: (error) => {
        // Đóng hộp xác nhận để lỗi tại ô (vd SĐT đã tồn tại) hiện ra.
        setToCreate(null)
        handleError(error)
      },
    })
  }

  const createRole = roles.find((role) => role.slug === toCreate?.roleSlug)

  const onSubmit = (values: UserFormValues) => {
    const options = { onSuccess: () => onOpenChange(false), onError: handleError }
    if (user) {
      const input = toUpdateInput(values, user)
      // Chỉ xoá trống trường tuỳ chọn (bị bỏ qua) → không còn gì để gửi: đóng luôn, không gọi API.
      if (Object.keys(input).length === 0) {
        onOpenChange(false)
        return
      }
      update.mutate({ slug: user.slug, input }, options)
    } else {
      setToCreate(values)
    }
  }

  const textField = (
    name: 'phonenumber' | 'lastName' | 'firstName' | 'email' | 'address',
    label: string,
    { required = false, hint }: { required?: boolean; hint?: string } = {},
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
          {hint ? <FormDescription>{hint}</FormDescription> : !required && keepHint}
          <FormMessage />
        </FormItem>
      )}
    />
  )

  // Backend chưa xoá trống được trường tuỳ chọn (lọc `null`) — nói trước thay vì để người dùng tưởng đã xoá.
  const keepHint = user ? <FormDescription>{t('users:keepWhenEmpty')}</FormDescription> : null

  const passwordField = (name: 'password' | 'confirmPassword', label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem required>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <PasswordInput autoComplete="new-password" {...field} />
          </FormControl>
          {name === 'password' && (
            <FormDescription>
              {t('common:passwordHint', { count: MIN_PASSWORD_LENGTH })}
            </FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={user ? t('users:edit') : t('users:create')}
      submitLabel={user ? t('common:save') : t('users:create')}
      isPending={isPending}
      submitDisabled={user ? !form.formState.isDirty : false}
      isDirty={form.formState.isDirty}
      confirmation={
        user
          ? undefined
          : {
              open: toCreate !== null,
              onOpenChange: (next) => {
                if (!next) setToCreate(null)
              },
              icon: <UserPlusIcon />,
              title: t('users:createConfirmTitle'),
              description: t('users:createConfirmDescription'),
              details: toCreate && (
                <SummaryList
                  items={[
                    { label: t('users:columnName'), value: formatFullName(toCreate) },
                    { label: t('users:fieldPhonenumber'), value: toCreate.phonenumber.trim() },
                    {
                      label: t('users:columnRole'),
                      value: createRole ? roleLabel(createRole.name) : '',
                    },
                  ]}
                />
              ),
              confirmLabel: t('users:createConfirmAction'),
              onConfirm: confirmCreate,
            }
      }
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        {textField('phonenumber', t('users:fieldPhonenumber'), {
          required: true,
          hint: t('users:phonenumberHint'),
        })}
        {textField('lastName', t('users:fieldLastName'), { required: true })}
        {textField('firstName', t('users:fieldFirstName'), { required: true })}
        {!user && passwordField('password', t('users:fieldPassword'))}
        {!user && passwordField('confirmPassword', t('users:fieldConfirmPassword'))}

        {!user && (
          <FormField
            control={form.control}
            name="roleSlug"
            render={({ field }) => (
              <FormItem required>
                <FormLabel>{t('users:fieldRole')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('users:rolePlaceholder')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.slug} value={role.slug}>
                        {roleLabel(role.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="dob"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('users:fieldDob')}</FormLabel>
              <FormControl>
                <DatePicker value={field.value} onChange={field.onChange} />
              </FormControl>
              {keepHint}
              <FormMessage />
            </FormItem>
          )}
        />

        {textField('email', t('users:fieldEmail'))}
        {textField('address', t('users:fieldAddress'))}
      </Form>
    </FormSheet>
  )
}
