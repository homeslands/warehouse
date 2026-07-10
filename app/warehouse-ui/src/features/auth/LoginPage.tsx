import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/shared/auth/auth.store'
import { loginSchema, type LoginInput } from './login.schema'
import { useLogin } from './useLogin'

export function LoginPage() {
  const status = useAuthStore((s) => s.status)
  const login = useLogin()

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phonenumber: '', password: '' },
  })

  if (status === 'authenticated') return <Navigate to="/examples" replace />

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Đăng nhập</h1>

        <div className="space-y-2">
          <Label htmlFor="phonenumber">Số điện thoại</Label>
          <Input id="phonenumber" autoComplete="username" {...form.register('phonenumber')} />
          {form.formState.errors.phonenumber && (
            <p className="text-sm text-red-600">{form.formState.errors.phonenumber.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
          {form.formState.errors.password && (
            <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>
          )}
        </div>

        {login.isError && <p className="text-sm text-red-600">{login.error.message}</p>}

        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </form>
    </div>
  )
}
