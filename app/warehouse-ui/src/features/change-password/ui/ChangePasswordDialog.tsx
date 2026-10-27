import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { MIN_PASSWORD_LENGTH } from '@/shared/lib/password-policy'
import { useRevalidateWhenTouched } from '@/shared/lib/form-validation'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { KeyRoundIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { DialogConfirmStep } from '@/shared/ui/DialogConfirmStep'
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
import { useChangePassword } from '../api/useChangePassword'
import {
  CURRENT_PASSWORD_INCORRECT_CODE,
  changePasswordSchema,
  type ChangePasswordInput,
} from '../model/change-password.schema'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EMPTY: ChangePasswordInput = { currentPassword: '', newPassword: '', confirmNewPassword: '' }
const FIELDS = ['currentPassword', 'newPassword', 'confirmNewPassword'] as const
const AUTOCOMPLETE = {
  currentPassword: 'current-password',
  newPassword: 'new-password',
  confirmNewPassword: 'new-password',
} as const
const FIELD_BY_CODE = { [CURRENT_PASSWORD_INCORRECT_CODE]: 'currentPassword' } as const

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation(['auth', 'errors', 'common'])
  const changePassword = useChangePassword()
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onTouched',
    defaultValues: EMPTY,
  })
  useRevalidateWhenTouched(form, 'newPassword', 'confirmNewPassword')
  // Nhóm C: bước xác nhận nằm ngay trong hộp. Mật khẩu vẫn nằm trong state của form (không hiện ở
  // màn xác nhận) nên "Quay lại" giữ nguyên những gì đã gõ.
  const [step, setStep] = useState<'edit' | 'confirm'>('edit')

  // Mở lại dialog không được còn mật khẩu của lần trước.
  useEffect(() => {
    if (!open) {
      form.reset(EMPTY)
      setStep('edit')
    }
  }, [open, form])

  // Form đã qua validate → hỏi xác nhận, chưa gửi.
  const onSubmit = () => setStep('confirm')

  const confirm = () => {
    const { currentPassword, newPassword } = form.getValues()
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) {
            // Lỗi thuộc ô (mật khẩu hiện tại sai) → về màn nhập, lỗi hiện tại ô.
            setStep('edit')
            return
          }
          toastApiError(error)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Nút × của Radix gọi thẳng `onOpenChange` — giấu nó lúc đang gửi để không còn lối đóng nào lọt qua.
        showCloseButton={!changePassword.isPending}
        onEscapeKeyDown={(event) => {
          if (changePassword.isPending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (changePassword.isPending) event.preventDefault()
        }}
      >
        {step === 'confirm' ? (
          <DialogConfirmStep
            icon={<KeyRoundIcon />}
            tone="destructive"
            title={t('auth:changePassword.confirmTitle')}
            description={t('auth:changePassword.confirmDescription')}
            confirmLabel={
              changePassword.isPending
                ? t('auth:changePassword.submitting')
                : t('auth:changePassword.confirmAction')
            }
            isPending={changePassword.isPending}
            onBack={() => setStep('edit')}
            onConfirm={confirm}
          />
        ) : (
          <>
            <DialogHeader className="items-center text-center">
              <DialogIcon tone="destructive">
                <KeyRoundIcon />
              </DialogIcon>
              <DialogTitle>{t('auth:changePassword.title')}</DialogTitle>
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
                        <FormLabel>{t(`auth:changePassword.${name}`)}</FormLabel>
                        <FormControl>
                          <PasswordInput autoComplete={AUTOCOMPLETE[name]} {...field} />
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

                <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="xl"
                    disabled={changePassword.isPending}
                    onClick={() => onOpenChange(false)}
                  >
                    {t('common:cancel')}
                  </Button>
                  <Button type="submit" size="xl" disabled={changePassword.isPending}>
                    {changePassword.isPending
                      ? t('auth:changePassword.submitting')
                      : t('auth:changePassword.submit')}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
