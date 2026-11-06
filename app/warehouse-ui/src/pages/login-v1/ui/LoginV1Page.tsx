import { Alert, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useSessionV1 } from '@/entities/session'
import { LoginV1Form } from '@/features/auth-login-v1'
import type { SessionEndReason } from '@/shared/api/types'
import { safeRedirect } from '@/shared/lib/safe-redirect'
import { AuthV1Layout } from '@/widgets/auth-layout'

const SESSION_END_MESSAGE = {
  expired: 'auth:sessionEnd.expired',
  revoked: 'auth:sessionEnd.revoked',
  userInactive: 'auth:sessionEnd.userInactive',
  unauthorized: 'auth:sessionEnd.unauthorized',
  idle: 'auth:sessionEnd.idle',
  locked: 'auth:sessionEnd.locked',
} as const satisfies Record<Exclude<SessionEndReason, 'loggedOut'>, string>

/**
 * UI-01 · Đăng nhập (`/login`) theo API v1 — chỉ dùng khi cờ `apiV1Auth` bật; tắt thì route vẫn là
 * `LoginPage` legacy. screen-contracts UI-01: password toggle, lỗi chung, refresh cookie không hiển
 * thị/không lưu localStorage, không có lựa chọn role/SUPER_ADMIN.
 */
export function LoginV1Page() {
  const { status, endReason } = useSessionV1()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation(['auth'])

  if (status === 'authenticated') {
    return <Navigate to={safeRedirect(searchParams.get('redirect'))} replace />
  }

  return (
    <AuthV1Layout>
      <Typography.Title level={1} style={{ fontSize: 24, marginTop: 0 }}>
        {t('auth:title')}
      </Typography.Title>
      <Typography.Paragraph type="secondary">{t('auth:subtitle')}</Typography.Paragraph>
      {endReason && endReason !== 'loggedOut' && (
        <Alert
          type="info"
          role="status"
          showIcon
          style={{ marginBottom: 16 }}
          title={t(SESSION_END_MESSAGE[endReason])}
        />
      )}
      <LoginV1Form
        formName="login-v1"
        submitLabel={t('auth:submit')}
        submittingLabel={t('auth:submitting')}
      />
    </AuthV1Layout>
  )
}
