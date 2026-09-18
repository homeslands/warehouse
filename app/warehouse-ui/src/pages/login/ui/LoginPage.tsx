import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Navigate, useSearchParams } from 'react-router-dom'
import { LanguageToggle } from '@/features/language-switch'
import { ModeToggle } from '@/features/theme-toggle'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { useAuthStore } from '@/entities/session'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { safeRedirect } from '@/shared/lib/safe-redirect'
import type { SessionEndReason } from '@/shared/api/types'
import { loginSchema, useLogin, type LoginErrorKey, type LoginInput } from '@/features/auth-login'

const SESSION_END_MESSAGE = {
  expired: 'auth:sessionEnd.expired',
  revoked: 'auth:sessionEnd.revoked',
  userInactive: 'auth:sessionEnd.userInactive',
  unauthorized: 'auth:sessionEnd.unauthorized',
} as const satisfies Record<Exclude<SessionEndReason, 'loggedOut'>, string>

export function LoginPage() {
  const status = useAuthStore((s) => s.status)
  const endReason = useAuthStore((s) => s.endReason)
  const [searchParams] = useSearchParams()
  const login = useLogin()
  const { t } = useTranslation(['auth', 'common'])

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phonenumber: '', password: '' },
  })

  const { reset: resetLogin, isError: loginFailed } = login

  // Lỗi đang hiện nói về lần gửi TRƯỚC. Người dùng vừa sửa input nghĩa là họ đã trả lời nó rồi.
  useEffect(() => {
    if (!loginFailed) return
    const subscription = form.watch(() => resetLogin())
    return () => subscription.unsubscribe()
  }, [form, loginFailed, resetLogin])

  if (status === 'authenticated') {
    return <Navigate to={safeRedirect(searchParams.get('redirect'))} replace />
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="absolute top-4 right-4 flex gap-2">
        <LanguageToggle />
        <ModeToggle />
      </div>

      <form
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
        className="bg-card w-full max-w-sm space-y-4 rounded-lg border p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">{t('auth:title')}</h1>

        {endReason && endReason !== 'loggedOut' && (
          <p role="status" className="bg-muted text-foreground rounded-md p-3 text-sm">
            {t(SESSION_END_MESSAGE[endReason])}
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="phonenumber">{t('auth:phonenumber')}</Label>
          <Input id="phonenumber" autoComplete="username" {...form.register('phonenumber')} />
          {form.formState.errors.phonenumber && (
            <p className="text-destructive text-sm">
              {t(form.formState.errors.phonenumber.message as LoginErrorKey)}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t('auth:password')}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
          {form.formState.errors.password && (
            <p className="text-destructive text-sm">
              {t(form.formState.errors.password.message as LoginErrorKey)}
            </p>
          )}
        </div>

        {login.isError && (
          <p className="text-destructive text-sm">{resolveApiErrorMessage(login.error)}</p>
        )}

        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? t('auth:submitting') : t('auth:submit')}
        </Button>
      </form>
    </div>
  )
}
