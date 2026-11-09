import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, Eye, EyeOff, Lock, Smartphone } from '@/shared/ui/icons'
import { useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Pressable, type TextInputInstance, View } from 'react-native'

import { bootstrapSession, login, useAuthStore } from '@/entities/session'
import { errorMessage } from '@/shared/api/error-message'
import { isApiError } from '@/shared/api/http'
import { useTheme } from '@/shared/theme/useTheme'
import { formatPhone, normalizeVnPhone } from '@/shared/lib/phone'
import { Button, FormField, Text } from '@/shared/ui'

import { loginSchema, type LoginErrorKey, type LoginInput } from './login.schema'

/**
 * Form đăng nhập. Thành công: `startSession(token)` rồi `bootstrapSession()` — cùng một đường xác minh
 * phiên với lúc mở app, nên `/auth/me` lỗi tạm thời → offline, tài khoản bị khoá → về login có lý do.
 * SessionGate tự chuyển màn khi store đổi; form không điều hướng.
 */
export function LoginForm() {
  const { t } = useTranslation(['auth', 'errors', 'common'])
  const { colors, radius } = useTheme()
  const [showPassword, setShowPassword] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const passwordRef = useRef<TextInputInstance>(null)

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { phonenumber: '', password: '' },
  })
  const { isSubmitting } = form.formState

  // Lỗi đang hiện nói về lần gửi TRƯỚC. Người dùng sửa ô nghĩa là họ đã đọc nó rồi (giống web).
  const editing = (onChange: (value: string) => void) => (value: string) => {
    setSubmitError(null)
    onChange(value)
  }

  const send = async ({ phonenumber, password }: LoginInput) => {
    setSubmitError(null)
    try {
      const { accessToken, refreshToken } = await login(phonenumber, password)
      useAuthStore.getState().startSession({ accessToken, refreshToken })
      await bootstrapSession()
    } catch (e) {
      // 429 không có `code` nghiệp vụ: errorMessage() sẽ ra "Đã có lỗi xảy ra" — vô ích ở đây.
      setSubmitError(
        isApiError(e) && e.statusCode === 429 ? t('auth:tooManyAttempts') : errorMessage(e, t),
      )
    }
  }

  // Nút đã khoá khi đang gửi, nhưng phím "Đi" trên bàn phím vẫn gọi được: khoá đồng bộ ở đây.
  const inFlight = useRef(false)
  const submit = () => {
    if (inFlight.current) return
    inFlight.current = true
    void form
      .handleSubmit(send)()
      .finally(() => {
        inFlight.current = false
      })
  }

  return (
    <View style={{ gap: 14 }}>
      <Controller
        control={form.control}
        name="phonenumber"
        render={({ field, fieldState }) => (
          <FormField
            ref={field.ref}
            label={t('auth:phonenumber')}
            icon={Smartphone}
            placeholder={t('auth:phonenumberPlaceholder')}
            // Form giữ CHỮ SỐ dạng nội địa (gửi lên server; "+84 912…" tự điền → "0912…"); ô chỉ
            // hiện bản đã nhóm "0912 345 678".
            value={formatPhone(field.value)}
            onChangeText={editing((text) => field.onChange(normalizeVnPhone(text)))}
            onBlur={field.onBlur}
            error={fieldState.error ? t(fieldState.error.message as LoginErrorKey) : undefined}
            // Chỉ số điện thoại: tài khoản chữ (vd `root`) không đăng nhập trên app (đã chốt).
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={20}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!isSubmitting}
          />
        )}
      />

      <Controller
        control={form.control}
        name="password"
        render={({ field, fieldState }) => (
          <FormField
            ref={(node) => {
              field.ref(node)
              passwordRef.current = node
            }}
            label={t('auth:password')}
            icon={Lock}
            placeholder={t('auth:passwordPlaceholder')}
            value={field.value}
            onChangeText={editing(field.onChange)}
            onBlur={field.onBlur}
            error={fieldState.error ? t(fieldState.error.message as LoginErrorKey) : undefined}
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            textContentType="password"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!isSubmitting}
            trailing={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? t('auth:hidePassword') : t('auth:showPassword')}
                onPress={() => setShowPassword((shown) => !shown)}
                hitSlop={4}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                {showPassword ? (
                  <EyeOff size={18} color={colors.mutedForeground} />
                ) : (
                  <Eye size={18} color={colors.mutedForeground} />
                )}
              </Pressable>
            }
          />
        )}
      />

      {submitError ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            gap: 8,
            padding: 12,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.destructive,
          }}
        >
          <CircleAlert size={16} color={colors.destructive} style={{ marginTop: 2 }} />
          <Text size={14} style={{ flex: 1, color: colors.destructive }}>
            {submitError}
          </Text>
        </View>
      ) : null}

      <Button loading={isSubmitting} onPress={submit}>
        {isSubmitting ? t('auth:submitting') : t('auth:submit')}
      </Button>
    </View>
  )
}
