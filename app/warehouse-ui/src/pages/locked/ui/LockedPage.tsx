import { Button, Flex, Spin, Typography } from 'antd'
import { LockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Navigate, useSearchParams } from 'react-router-dom'
import { logoutV1, useSessionV1 } from '@/entities/session'
import { LoginV1Form } from '@/features/auth-login-v1'
import { safeRedirect } from '@/shared/lib/safe-redirect'
import { useAppDispatch } from '@/shared/store'
import { AuthV1Layout } from '@/widgets/auth-layout'

/**
 * UI-02 · Khoá do không hoạt động (`/locked`), chỉ có khi cờ `apiV1Auth` bật.
 *
 * screen-contracts UI-02: server khoá sau 30 phút; overlay che dữ liệu — ở đây màn khoá THAY cả
 * layout (nội dung trang không còn trong DOM). Đăng nhập lại CÙNG user → draft Redux còn nguyên
 * (`app/client-state-lifecycle.ts`); user khác hoặc Đăng xuất → purge toàn bộ cache/draft.
 */
export function LockedPage() {
  const { status, endReason, identity } = useSessionV1()
  const [searchParams] = useSearchParams()
  const dispatch = useAppDispatch()
  const { t } = useTranslation(['auth'])
  const redirect = searchParams.get('redirect')

  if (status === 'authenticated') return <Navigate to={safeRedirect(redirect)} replace />
  if (status === 'unknown') {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100svh' }}>
        <Spin />
      </Flex>
    )
  }
  if (status !== 'locked') {
    const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''
    return <Navigate to={`/login${query}`} replace />
  }

  return (
    <AuthV1Layout>
      <Flex vertical align="center" gap={8} style={{ marginBottom: 16, textAlign: 'center' }}>
        <LockIcon size={32} aria-hidden="true" />
        <Typography.Title level={1} style={{ fontSize: 24, margin: 0 }}>
          {t('auth:lock.title')}
        </Typography.Title>
        <Typography.Paragraph type="secondary" role="status" style={{ margin: 0 }}>
          {endReason === 'idle' ? t('auth:lock.idleDescription') : t('auth:lock.lockedDescription')}
        </Typography.Paragraph>
        {identity && (
          <Typography.Text strong>
            {t('auth:lock.signedInAs', { name: identity.displayName })}
          </Typography.Text>
        )}
      </Flex>
      <LoginV1Form
        formName="unlock-v1"
        initialPhoneNumber={identity?.phoneNumber}
        autoFocusField={identity ? 'password' : 'phoneNumber'}
        submitLabel={t('auth:lock.unlock')}
        submittingLabel={t('auth:lock.unlocking')}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>
        {t('auth:lock.otherUserWarning')}
      </Typography.Paragraph>
      <Button type="link" block onClick={() => void dispatch(logoutV1())}>
        {t('auth:lock.signOut')}
      </Button>
    </AuthV1Layout>
  )
}
