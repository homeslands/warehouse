import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert, Eye, EyeOff } from '@/shared/ui/icons'
import { useRef, useState } from 'react'
import { Controller, useForm, type Path } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Pressable, type TextInputInstance, View } from 'react-native'

import { getSessionEpoch, useAuthStore } from '@/entities/session'
import { errorMessage } from '@/shared/api/error-message'
import { isApiError } from '@/shared/api/http'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useSheetSubmit } from '@/shared/lib/useSheetSubmit'
import { useTheme } from '@/shared/theme/useTheme'
import { FormField, SheetScaffold, Text } from '@/shared/ui'

import { changePassword } from './change-password.api'
import {
  CURRENT_PASSWORD_INCORRECT_CODE,
  MIN_PASSWORD_LENGTH,
  changePasswordSchema,
  type ChangePasswordErrorKey,
  type ChangePasswordInput,
} from './change-password.schema'
import { usePasswordNotice } from './password-notice.store'

type ErrorKey = ChangePasswordErrorKey | 'errors:currentPasswordIncorrect'

const EMPTY: ChangePasswordInput = { currentPassword: '', newPassword: '', confirmNewPassword: '' }
const FIELDS: Path<ChangePasswordInput>[] = ['currentPassword', 'newPassword', 'confirmNewPassword']

export type ChangePasswordSheetProps = {
  /** Đóng sheet (route `/change-password` → `router.back()`). */
  onClose: () => void
}

/**
 * Sheet đổi mật khẩu (✕ trái, ✓ phải). ✓ hoặc phím "Đi" ở ô cuối: kiểm form → hỏi lại bằng hộp
 * thoại gốc (`confirmAction`) → ghi qua `useSheetSubmit`. Thành công: `replaceTokens(cặp mới)` (đổi
 * mật khẩu thu hồi phiên khác, phiên này được cấp token mới — KHÔNG kết thúc phiên), bật thông báo cho
 * màn Tài khoản, dấu tích nảy rồi đóng. Sai mật khẩu hiện tại (100013) hiện ở ô đó; lỗi khác hiện dưới
 * form.
 */
export function ChangePasswordSheet({ onClose }: ChangePasswordSheetProps) {
  const { t } = useTranslation(['auth', 'account', 'common', 'errors'])
  const { colors, radius } = useTheme()
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const inputs = useRef<Partial<Record<Path<ChangePasswordInput>, TextInputInstance | null>>>({})

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onTouched',
    defaultValues: EMPTY,
  })

  const { doneState, submit } = useSheetSubmit({
    onSubmit: async () => {
      const { currentPassword, newPassword } = form.getValues()
      // Phiên kết thúc (hết hạn, đăng xuất…) trong lúc request đang bay: không ghi token mới đè lên
      // phiên đã đóng, không để lại thông báo "đã đổi" cho lần đăng nhập sau.
      const epoch = getSessionEpoch()
      const tokens = await changePassword(currentPassword, newPassword)
      if (getSessionEpoch() !== epoch) return
      useAuthStore
        .getState()
        .replaceTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
      usePasswordNotice.getState().show()
    },
    onClose,
    onError: (e) => {
      if (isApiError(e) && e.code === CURRENT_PASSWORD_INCORRECT_CODE) {
        form.setError('currentPassword', { message: 'errors:currentPasswordIncorrect' })
        return
      }
      setSubmitError(errorMessage(e, t))
    },
  })
  const locked = doneState !== 'idle'

  const review = async () => {
    setSubmitError(null)
    const confirmed = await confirmAction({
      title: t('auth:changePassword.confirmTitle'),
      message: t('account:changePasswordConfirm'),
      confirmLabel: t('auth:changePassword.submit'),
      cancelLabel: t('common:cancel'),
    })
    if (confirmed) await submit()
  }
  const done = () => {
    if (!locked) void form.handleSubmit(review)()
  }

  const editing = (onChange: (value: string) => void) => (value: string) => {
    setSubmitError(null)
    onChange(value)
  }

  return (
    <SheetScaffold
      title={t('auth:changePassword.title')}
      cancelLabel={t('common:cancel')}
      doneLabel={t('common:done')}
      onCancel={onClose}
      onDone={done}
      doneState={doneState}
    >
      <View style={{ gap: 16, paddingTop: 4 }}>
        {FIELDS.map((name, index) => {
          const last = index === FIELDS.length - 1
          return (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field, fieldState }) => (
                <View style={{ gap: 4 }}>
                  <FormField
                    ref={(node) => {
                      field.ref(node)
                      inputs.current[name] = node
                    }}
                    label={t(`auth:changePassword.${name}`)}
                    value={field.value}
                    onChangeText={editing(field.onChange)}
                    onBlur={field.onBlur}
                    error={fieldState.error ? t(fieldState.error.message as ErrorKey) : undefined}
                    editable={!locked}
                    secureTextEntry={!shown[name]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={name === 'currentPassword' ? 'current-password' : 'new-password'}
                    textContentType={name === 'currentPassword' ? 'password' : 'newPassword'}
                    // Hiện tại → mới → nhập lại → "Đi" (= bấm ✓).
                    returnKeyType={last ? 'go' : 'next'}
                    submitBehavior={last ? 'blurAndSubmit' : 'submit'}
                    onSubmitEditing={() =>
                      last ? done() : inputs.current[FIELDS[index + 1]!]?.focus()
                    }
                    trailing={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${shown[name] ? t('auth:hidePassword') : t('auth:showPassword')} (${t(`auth:changePassword.${name}`)})`}
                        onPress={() => setShown((s) => ({ ...s, [name]: !s[name] }))}
                        hitSlop={4}
                        style={{
                          width: 44,
                          height: 44,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {shown[name] ? (
                          <EyeOff size={18} color={colors.mutedForeground} />
                        ) : (
                          <Eye size={18} color={colors.mutedForeground} />
                        )}
                      </Pressable>
                    }
                  />
                  {name === 'newPassword' ? (
                    <Text muted size={12} style={{ marginLeft: 2 }}>
                      {t('common:passwordHint', { count: MIN_PASSWORD_LENGTH })}
                    </Text>
                  ) : null}
                </View>
              )}
            />
          )
        })}

        {submitError ? (
          <View
            accessible
            accessibilityRole="alert"
            style={{
              flexDirection: 'row',
              gap: 8,
              padding: 12,
              borderRadius: radius.group,
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
      </View>
    </SheetScaffold>
  )
}
