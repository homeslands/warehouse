import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRoundIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Trans, useTranslation } from 'react-i18next'
import { MIN_PASSWORD_LENGTH } from '@/shared/lib/password-policy'
import { useRevalidateWhenTouched } from '@/shared/lib/form-validation'
import { isApiError } from '@/shared/api/http'
import { isPhraseConfirmed } from '@/shared/lib/confirm-phrase'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { ConfirmPhraseField } from '@/shared/ui/ConfirmPhraseField'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { DialogIcon } from '@/shared/ui/DialogIcon'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form'
import { PasswordInput } from '@/shared/ui/PasswordInput'
import { useResetUserPassword, userDisplayName, type User } from '@/entities/user'
import { resetPasswordSchema, type ResetPasswordValues } from '../model/reset-password.schema'

type Props = {
  /** `null` = đóng. */
  user: User | null
  onOpenChange: (open: boolean) => void
}

const EMPTY: ResetPasswordValues = { newPassword: '', confirmNewPassword: '' }
const FIELDS = ['newPassword', 'confirmNewPassword'] as const
const LABEL_KEY = {
  newPassword: 'users:fieldNewPassword',
  confirmNewPassword: 'users:fieldConfirmNewPassword',
} as const
const FIELD_BY_CODE = { 100406: 'newPassword' } as const
/** Mã backend khi người đích không còn (bị xoá ở nơi khác) — khớp `USER_NOT_FOUND_CODE` trong
 * `entities/user/api/hooks.ts` (không export, chép lại vì đây là quyết định UI, không phải API). */
const USER_NOT_FOUND_CODE = 100405

/**
 * Admin đặt mật khẩu hộ. Backend thu hồi mọi phiên của người đó — nói rõ trước khi bấm. 100407 / 100408 /
 * 404 / 429 hiện toast (`useResetUserPassword` tự tải lại danh sách khi 404).
 */
export function ResetPasswordDialog({ user, onOpenChange }: Props) {
  const { t } = useTranslation(['users', 'errors', 'common'])
  const reset = useResetUserPassword()
  // Hộp còn mờ dần sau khi trang đặt `user` về null — giữ bản cuối để câu cảnh báo không mất tên.
  const [last, setLast] = useState(user)
  if (user !== null && user !== last) setLast(user)
  const shown = user ?? last
  const open = user !== null
  // Gõ tên đăng nhập của người bị đổi để xác nhận — chống bấm nhầm dòng. Đóng hộp = xoá chữ đã gõ.
  const phrase = shown?.phonenumber ?? ''
  const [typed, setTyped] = useState('')
  if (!open && typed !== '') setTyped('')
  const confirmed = isPhraseConfirmed(typed, phrase)

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onTouched',
    defaultValues: EMPTY,
  })
  useRevalidateWhenTouched(form, 'newPassword', 'confirmNewPassword')

  // Mở lại dialog không được còn mật khẩu lần trước. (Trạng thái hiện/ẩn nằm trong `PasswordInput`, tự về
  // dạng ẩn vì nội dung dialog unmount khi đóng.)
  useEffect(() => {
    if (!open) form.reset(EMPTY)
  }, [open, form])

  const onSubmit = ({ newPassword }: ResetPasswordValues) => {
    if (!user || !confirmed) return
    reset.mutate(
      { slug: user.slug, input: { newPassword } },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
          toastApiError(error)
          // Người đích đã biến mất — không còn gì để sửa, giữ hộp mở chỉ mời bấm lại vào hư không.
          if (isApiError(error) && error.code === USER_NOT_FOUND_CODE) onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Cùng quy ước với AssignStoreWarehouseDialog: nút × của Radix gọi thẳng `onOpenChange`,
        // không đi qua hai handler dưới — phải giấu nó lúc đang gửi để không còn lối đóng nào lọt qua.
        showCloseButton={!reset.isPending}
        onEscapeKeyDown={(event) => {
          if (reset.isPending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (reset.isPending) event.preventDefault()
        }}
      >
        <DialogHeader className="items-center text-center">
          <DialogIcon tone="destructive">
            <KeyRoundIcon />
          </DialogIcon>
          <DialogTitle>{t('users:resetPasswordTitle')}</DialogTitle>
          <DialogDescription>
            <Trans
              ns={['users']}
              i18nKey="users:resetPasswordWarning"
              values={{ name: shown ? userDisplayName(shown) : '' }}
              components={[<span key="0" />, <span key="1" className="font-medium" />]}
            />
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {FIELDS.map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem required>
                    <FormLabel>{t(LABEL_KEY[name])}</FormLabel>
                    <FormControl>
                      <PasswordInput autoComplete="new-password" {...field} />
                    </FormControl>
                    {name === 'newPassword' && (
                      <FormDescription>
                        {t('common:passwordHint', { count: MIN_PASSWORD_LENGTH })}
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            <ConfirmPhraseField
              phrase={phrase}
              value={typed}
              onChange={setTyped}
              disabled={reset.isPending}
            />

            <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
              <Button
                type="button"
                variant="outline"
                size="xl"
                disabled={reset.isPending}
                onClick={() => onOpenChange(false)}
              >
                {t('common:cancel')}
              </Button>
              {/* Khoá tới khi gõ đúng (cố ý, khác quy ước form): câu hướng dẫn nằm ngay trên nút. */}
              <Button type="submit" size="xl" disabled={reset.isPending || !confirmed}>
                {reset.isPending
                  ? t('users:resetPasswordSubmitting')
                  : t('users:resetPasswordSubmit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
