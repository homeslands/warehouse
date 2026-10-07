import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { MIN_PASSWORD_LENGTH } from '@/shared/lib/password-policy'
import { useRevalidateWhenTouched } from '@/shared/lib/form-validation'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { KeyRoundIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
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

  // Mở lại dialog không được còn mật khẩu của lần trước.
  useEffect(() => {
    if (!open) form.reset(EMPTY)
  }, [open, form])

  const onSubmit = ({ currentPassword, newPassword }: ChangePasswordInput) =>
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          if (!applyApiErrorToForm(form, error, FIELD_BY_CODE)) toastApiError(error)
        },
      },
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
      </DialogContent>
    </Dialog>
  )
}
