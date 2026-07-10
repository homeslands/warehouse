import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { LanguageToggle } from '@/components/layout/LanguageToggle'
import { ModeToggle } from '@/components/layout/ModeToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/shared/auth/auth.store'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { loginSchema, type LoginErrorKey, type LoginInput } from './login.schema'
import { useLogin } from './useLogin'

export function LoginPage() {
  const status = useAuthStore((s) => s.status)
  const login = useLogin()
  const { t } = useTranslation(['auth', 'common'])

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phonenumber: '', password: '' },
  })

  if (status === 'authenticated') return <Navigate to="/examples" replace />

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
