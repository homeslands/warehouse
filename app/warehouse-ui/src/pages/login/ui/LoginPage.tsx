import { zodResolver } from '@hookform/resolvers/zod'
import {
  CircleAlertIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  Loader2Icon,
  LockIcon,
  UserIcon,
  WarehouseIcon,
} from 'lucide-react'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Navigate, useSearchParams } from 'react-router-dom'
import { LanguageToggle } from '@/features/language-switch'
import { ModeToggle } from '@/features/theme-toggle'
import { Button } from '@/shared/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/shared/ui/input-group'
import { Label } from '@/shared/ui/label'
import { useAuthStore } from '@/entities/session'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { safeRedirect } from '@/shared/lib/safe-redirect'
import type { SessionEndReason } from '@/shared/api/types'
import { loginSchema, useLogin, type LoginErrorKey, type LoginInput } from '@/features/auth-login'
import bg1280 from '../assets/login-bg-1280.jpg'
import bg1920 from '../assets/login-bg-1920.jpg'

const SESSION_END_MESSAGE = {
  expired: 'auth:sessionEnd.expired',
  revoked: 'auth:sessionEnd.revoked',
  userInactive: 'auth:sessionEnd.userInactive',
  unauthorized: 'auth:sessionEnd.unauthorized',
} as const satisfies Record<Exclude<SessionEndReason, 'loggedOut'>, string>

/*
 * Kiểu kính mờ (glassmorphism). Màu CỐ ĐỊNH (`white/…`), không theo token sáng/tối: thẻ nằm trên ẢNH,
 * nền thật của nó là ảnh đã làm mờ chứ không phải `--background` — đổi theo chế độ sáng/tối thì chữ
 * trắng trên kính sáng sẽ mất. Ngoại lệ có chủ đích, chỉ ở màn này.
 */

/** Ô nhập kính: đè viền/nền/vòng focus của `InputGroup` (tailwind-merge trong `cn` gỡ class cũ). */
const GLASS_FIELD =
  'h-11 border-white/20 bg-white/10 dark:bg-white/10 transition-colors ' +
  'has-[[data-slot=input-group-control]:focus-visible]:border-white/60 ' +
  'has-[[data-slot=input-group-control]:focus-visible]:ring-white/20 ' +
  'has-[[data-slot][aria-invalid=true]]:border-red-300/70 has-[[data-slot][aria-invalid=true]]:ring-red-300/20'

/**
 * Chữ trong ô. Chrome tự điền (autofill) tô nền `#e8f0fe` bằng style nội bộ mức `!important` — trang
 * KHÔNG đè được `background-color`, và mẹo kéo dài `transition` cũ đã hết tác dụng ở Chrome mới (trên
 * kính nó thành chữ trắng trên nền xanh nhạt, gần như không đọc được).
 *
 * Cách dùng ở đây: không đổi màu nền mà đổi PHẠM VI VẼ nền — `background-clip: text` thu nền vào
 * trong nét chữ, rồi `-webkit-text-fill-color` phủ chữ trắng lên trên, nên mảng xanh biến mất. Lặp
 * cho cả `:autofill` (chuẩn) và `:-webkit-autofill` (Safari, Chrome cũ).
 */
const GLASS_INPUT =
  'text-white placeholder:text-white/40 caret-white ' +
  'autofill:[-webkit-background-clip:text] autofill:[background-clip:text] autofill:[-webkit-text-fill-color:white] ' +
  '[&:-webkit-autofill]:[-webkit-background-clip:text] [&:-webkit-autofill]:[-webkit-text-fill-color:white]'

const GLASS_ADDON = 'text-white/70'

export function LoginPage() {
  const status = useAuthStore((s) => s.status)
  const endReason = useAuthStore((s) => s.endReason)
  const [searchParams] = useSearchParams()
  const login = useLogin()
  const { t } = useTranslation(['auth', 'common'])
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { phonenumber: '', password: '' },
  })
  const errors = form.formState.errors

  const { reset: resetLogin, isError: loginFailed } = login

  // Lỗi đang hiện nói về lần gửi TRƯỚC. Người dùng vừa sửa input nghĩa là họ đã trả lời nó rồi.
  useEffect(() => {
    if (!loginFailed) return
    const subscription = form.watch(() => resetLogin())
    return () => subscription.unsubscribe()
  }, [form, loginFailed, resetLogin])

  // Màn chỉ có một việc — đặt con trỏ sẵn vào ô đầu tiên. Qua `setFocus` chứ không `autoFocus`:
  // react-hook-form giữ ref của ô, không cần nối ref thứ hai.
  useEffect(() => form.setFocus('phonenumber'), [form])

  // Không có ô nào hiện chữ khi gõ mật khẩu nên Caps Lock là lý do "sai mật khẩu" hay gặp nhất.
  // Đọc trạng thái phím từ chính sự kiện bàn phím — trình duyệt không cho hỏi trạng thái lúc khác.
  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState('CapsLock'))

  if (status === 'authenticated') {
    return <Navigate to={safeRedirect(searchParams.get('redirect'))} replace />
  }

  const appName = t('common:appName')

  return (
    // `isolate`: ảnh và lớp phủ nằm ở `-z-10` BÊN TRONG khối này, không chìm xuống dưới nền `body`.
    <div className="relative isolate flex min-h-svh flex-col overflow-hidden">
      {/* Ảnh trang trí: `alt=""` để trình đọc màn hình bỏ qua. `fetchPriority="high"` vì đây là thứ
          lớn nhất màn hình vẽ đầu tiên (LCP). Màn nhỏ chỉ tải bản 1280px. */}
      <img
        data-slot="login-background"
        src={bg1920}
        srcSet={`${bg1280} 1280w, ${bg1920} 1920w`}
        sizes="100vw"
        alt=""
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 -z-10 size-full object-cover"
      />
      {/* Lớp phủ tối cố định ở CẢ hai chế độ sáng/tối — chữ trắng trên ảnh phải đọc được bất kể ảnh
          chỗ đó sáng hay tối. Đây là màu của lớp phủ ảnh, không phải màu giao diện, nên không dùng
          token. Desktop tối dần sang hai mép để khối chữ bên trái và thẻ bên phải đều nổi. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/35 to-black/20 lg:bg-gradient-to-r lg:from-black/70 lg:via-black/25 lg:to-black/50"
      />

      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <div className="flex items-center gap-2 font-semibold text-white">
          <span className="grid size-9 place-items-center rounded-lg bg-white/15 backdrop-blur-sm">
            <WarehouseIcon className="size-5" aria-hidden="true" />
          </span>
          <span className="text-lg">{appName}</span>
        </div>
        {/* Hai nút là `variant="outline"` (nền theo theme). Đè từ khối bao ngoài bằng `[&_button]` —
            selector con cháu thắng specificity của class trên chính nút; nhánh `dark:` phải lặp lại vì
            biến thể outline có `dark:bg-input/30` riêng. `aria-expanded` là lúc menu đang mở — biến thể
            outline có `aria-expanded:bg-muted` (nền đặc), thiếu dòng đè này thì nút thành chấm trắng.
            Chỉ đè TRONG khối này: nút ở AppShell và menu thả xuống (portal ra `body`) không bị chạm. */}
        <div className="flex gap-1 rounded-full border border-white/20 bg-white/10 p-1 shadow-lg backdrop-blur-xl [&_button]:rounded-full [&_button]:border-white/20 [&_button]:bg-white/10 [&_button]:text-white [&_button]:hover:bg-white/25 [&_button]:hover:text-white dark:[&_button]:bg-white/10 dark:[&_button]:hover:bg-white/25 [&_button[aria-expanded=true]]:bg-white/25 [&_button[aria-expanded=true]]:text-white dark:[&_button[aria-expanded=true]]:bg-white/25">
          <LanguageToggle />
          <ModeToggle />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_minmax(0,28rem)]">
        {/* Khẩu hiệu chỉ hiện ở màn rộng — trên điện thoại nó đẩy form xuống dưới nếp gập. */}
        <div className="hidden max-w-lg text-white lg:block">
          <h2 className="font-heading text-4xl leading-tight font-semibold">{t('auth:tagline')}</h2>
          <p className="mt-4 text-lg text-white/80">{t('auth:taglineDescription')}</p>
        </div>

        <form
          noValidate
          onSubmit={form.handleSubmit((values) => login.mutate(values))}
          // Kính: nền trắng rất mỏng + làm mờ và tăng bão hoà thứ phía sau. Trình duyệt không hỗ trợ
          // `backdrop-filter` thì nền đặc hơn để chữ trắng vẫn đọc được. `before:` là vệt sáng mảnh
          // trên đỉnh — thứ làm tấm kính trông có độ dày thay vì một hình chữ nhật mờ.
          className="relative w-full space-y-5 overflow-hidden rounded-3xl border border-white/25 bg-slate-900/70 p-6 text-white shadow-[0_8px_40px_rgba(0,0,0,0.35)] ring-1 ring-white/10 ring-inset before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-24 before:bg-gradient-to-b before:from-white/15 before:to-transparent supports-[backdrop-filter]:bg-white/10 supports-[backdrop-filter]:backdrop-blur-2xl supports-[backdrop-filter]:backdrop-saturate-150 sm:p-8"
        >
          <div className="space-y-1.5">
            <h1 className="font-heading text-2xl font-semibold">{t('auth:title')}</h1>
            <p className="text-sm text-white/75">{t('auth:subtitle')}</p>
          </div>

          {endReason && endReason !== 'loggedOut' && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-xl border border-white/20 bg-white/10 p-3 text-sm text-white/90"
            >
              <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{t(SESSION_END_MESSAGE[endReason])}</span>
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="phonenumber" className="text-white/90">
              {t('auth:phonenumber')}
            </Label>
            {/* Không đặt `inputMode="tel"`: ô này là TÊN ĐĂNG NHẬP (tài khoản seed là `root`), bàn phím
                số trên điện thoại sẽ không gõ được chữ. */}
            <InputGroup className={GLASS_FIELD}>
              <InputGroupAddon className={GLASS_ADDON}>
                <UserIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                id="phonenumber"
                className={GLASS_INPUT}
                autoComplete="username"
                aria-invalid={errors.phonenumber ? true : undefined}
                aria-describedby={errors.phonenumber ? 'phonenumber-error' : undefined}
                {...form.register('phonenumber')}
              />
            </InputGroup>
            {errors.phonenumber && (
              <p id="phonenumber-error" className="text-sm text-red-200">
                {t(errors.phonenumber.message as LoginErrorKey)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-white/90">
              {t('auth:password')}
            </Label>
            <InputGroup className={GLASS_FIELD}>
              <InputGroupAddon className={GLASS_ADDON}>
                <LockIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                id="password"
                className={GLASS_INPUT}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={
                  [errors.password && 'password-error', capsLock && 'password-capslock']
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                onKeyDown={trackCapsLock}
                onKeyUp={trackCapsLock}
                {...form.register('password')}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-sm"
                  className="text-white/70 hover:bg-white/15 hover:text-white"
                  aria-label={showPassword ? t('auth:hidePassword') : t('auth:showPassword')}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((shown) => !shown)}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {capsLock && (
              <p id="password-capslock" className="text-sm text-amber-200">
                {t('auth:capsLockOn')}
              </p>
            )}
            {errors.password && (
              <p id="password-error" className="text-sm text-red-200">
                {t(errors.password.message as LoginErrorKey)}
              </p>
            )}
          </div>

          {login.isError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-300/30 bg-red-500/15 p-3 text-sm text-red-100"
            >
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{resolveApiErrorMessage(login.error)}</span>
            </p>
          )}

          <Button
            type="submit"
            size="xl"
            // Nút trắng đặc trên kính: độ tương phản cao nhất màn, mắt tìm thấy ngay việc cần làm.
            className="w-full rounded-xl bg-white text-slate-900 shadow-lg hover:bg-white/90 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
            disabled={login.isPending}
          >
            {login.isPending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
            {login.isPending ? t('auth:submitting') : t('auth:submit')}
          </Button>
        </form>
      </main>

      <footer className="px-4 py-4 text-center text-xs text-white/70 sm:px-8">
        {t('auth:copyright', { year: new Date().getFullYear(), appName })}
      </footer>
    </div>
  )
}
