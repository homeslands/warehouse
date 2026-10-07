import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { useUpdateProfile, type Profile } from '@/entities/session'

const SCHEMA = z.object({
  fullName: z.string().max(100, { error: 'account:fullNameTooLong' }).optional(),
  // `refine` chứ KHÔNG phải `z.union([z.literal(''), z.email()], { error })`: Zod 4 để message
  // của nhánh con ghi đè message cấp union, nên khoá i18n bị thay bằng câu tiếng Anh gốc của Zod.
  // Chuỗi rỗng là hợp lệ — đó là cách người dùng xoá email đã có.
  email: z
    .string()
    .refine((value) => value === '' || z.email().safeParse(value).success, {
      error: 'account:emailInvalid',
    })
    .optional(),
})

type Values = z.infer<typeof SCHEMA>

/**
 * Sửa hồ sơ của chính mình. Chỉ hiện khi `BACKEND_SUPPORTS.profileEdit` — bên gọi lo việc đó.
 *
 * `email` cho phép chuỗi rỗng vì đó là cách người dùng XOÁ email đã có; lúc gửi thì `''` đi
 * nguyên (cột `email` của backend đề xuất là nullable, `@IsOptional()` thuần). `fullName` cũng vậy.
 */
export function ProfileForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation(['account', 'common'])
  const update = useUpdateProfile()
  const form = useForm<Values>({
    resolver: zodResolver(SCHEMA),
    mode: 'onTouched',
    defaultValues: { fullName: profile.fullName ?? '', email: profile.email ?? '' },
  })

  // Hồ sơ tới sau lần render đầu (GET /auth/me) hoặc đổi sau khi lưu → nạp lại giá trị vào form.
  // `reset` cũng đặt lại mốc `isDirty`, nên nút Lưu khoá lại đúng lúc.
  useEffect(() => {
    form.reset({ fullName: profile.fullName ?? '', email: profile.email ?? '' })
  }, [form, profile.fullName, profile.email])

  const submit = (values: Values) =>
    update.mutate(
      // `GET /auth/me` chưa trả `version`; gửi `version: undefined` thì backend hiểu là thiếu
      // field (100512) chứ không phải "bỏ qua". Chỉ đính kèm khi thật sự có.
      { ...values, ...(profile.version === undefined ? {} : { version: profile.version }) },
      {
        onError: (error) => {
          // 999903 = email đã được dùng (mã đề xuất trong docs/proposals) — báo tại ô thay vì toast.
          if (!applyApiErrorToForm(form, error, { 999903: 'email' })) toastApiError(error)
        },
      },
    )

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="grid gap-4 sm:max-w-md">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('account:fullName')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('account:email')}</FormLabel>
              <FormControl>
                {/* KHÔNG dùng `type="email"`: validate gốc của HTML chặn submit trước khi
                    resolver Zod chạy → không có lỗi nào hiện ra và form im lặng không gửi.
                    Cùng họ với bẫy thuộc tính `required` đã ghi trong CLAUDE.md.
                    `inputMode` chỉ gợi ý bàn phím, không kích hoạt validate. */}
                <Input {...field} value={field.value ?? ''} inputMode="email" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          size="lg"
          className="justify-self-start"
          disabled={update.isPending || !form.formState.isDirty}
        >
          {update.isPending ? t('common:saving') : t('common:save')}
        </Button>
      </form>
    </Form>
  )
}
