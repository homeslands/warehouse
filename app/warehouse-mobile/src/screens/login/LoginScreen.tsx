import { useRouter } from 'expo-router'
import { Info } from '@/shared/ui/icons'
import { useTranslation } from 'react-i18next'
import { KeyboardAvoidingView, ScrollView, View } from 'react-native'

import { useAuthStore } from '@/entities/session'
import { LoginForm } from '@/features/auth-login'
import { LanguagePill } from '@/features/language-switch'
import type { SessionEndReason } from '@/shared/api/types'
import { appVersion } from '@/shared/config/app-version'
import { getEnv, isSandbox } from '@/shared/config/env'
import { useTheme } from '@/shared/theme/useTheme'
import { AppMark, Badge, Screen, Text } from '@/shared/ui'

import { useKeepEndVisible } from './useKeepEndVisible'

/** Giống web: tự đăng xuất (`loggedOut`) thì không cần giải thích gì. */
const SESSION_END_MESSAGE = {
  expired: 'auth:sessionEnd.expired',
  revoked: 'auth:sessionEnd.revoked',
  userInactive: 'auth:sessionEnd.userInactive',
  unauthorized: 'auth:sessionEnd.unauthorized',
} as const satisfies Record<Exclude<SessionEndReason, 'loggedOut'>, string>

/**
 * Đăng nhập: viên ngôn ngữ, biểu tượng app + tên + câu mô tả, form, chân màn (nhãn môi trường +
 * phiên bản). Bàn phím bật lên thì nội dung cuộn để nút Đăng nhập vẫn thấy được.
 */
export function LoginScreen() {
  const { t } = useTranslation(['auth', 'common'])
  const { colors, radius } = useTheme()
  const endReason = useAuthStore((s) => s.endReason)
  const { scrollRef, onLayout } = useKeepEndVisible()
  const router = useRouter()

  return (
    <Screen>
      {/* Android edge-to-edge: cửa sổ không tự co khi có bàn phím → `padding` cho cả hai nền tảng. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          ref={scrollRef}
          onLayout={onLayout}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 4 }}
        >
          <LanguagePill onPress={() => router.navigate('/language')} />

          <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 20 }}>
            <AppMark />
            <Text
              weight="bold"
              size={24}
              accessibilityRole="header"
              style={{ letterSpacing: -0.6, marginTop: 14 }}
            >
              {t('common:appName')}
            </Text>
            <Text muted size={14} style={{ marginTop: 4, textAlign: 'center' }}>
              {t('auth:tagline')}
            </Text>
          </View>

          {endReason && endReason !== 'loggedOut' ? (
            <View
              accessibilityRole="summary"
              accessibilityLiveRegion="polite"
              style={{
                flexDirection: 'row',
                gap: 8,
                padding: 12,
                marginBottom: 16,
                borderRadius: radius.group,
                backgroundColor: colors.muted,
              }}
            >
              <Info size={16} color={colors.info} style={{ marginTop: 2 }} />
              <Text size={14} style={{ flex: 1 }}>
                {t(SESSION_END_MESSAGE[endReason])}
              </Text>
            </View>
          ) : null}

          <LoginForm />

          <Text muted size={13} style={{ textAlign: 'center', marginTop: 14 }}>
            {t('auth:forgotPasswordHint')}
          </Text>

          <View
            style={{
              marginTop: 'auto',
              paddingTop: 24,
              paddingBottom: 16,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {isSandbox(getEnv()) ? (
              <Badge variant="outline" testID="env-badge">
                {t('common:sandbox')}
              </Badge>
            ) : null}
            <Text muted size={12}>
              {t('common:version', { version: appVersion() })}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}
