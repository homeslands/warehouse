import { KeyRoundIcon, LogOutIcon, MonitorIcon, ShieldIcon, UserIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BACKEND_SUPPORTS } from '@/shared/api/backend-capabilities'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { formatDateTime } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { Skeleton } from '@/shared/ui/skeleton'
import {
  useAuthSessions,
  useAuthStore,
  useProfile,
  useRevokeSession,
  type AuthSession,
} from '@/entities/session'
import { ChangePasswordDialog } from '@/features/change-password'
import { LogoutAllDialog } from '@/features/logout-all'
import { ProfileForm } from '@/features/profile-form'

/** Một khối trên trang: icon + tiêu đề + mô tả. Cục bộ trong màn — chưa màn nào khác cần. */
function Section({
  icon: Icon,
  title,
  description,
  tone = 'default',
  children,
}: {
  icon: typeof UserIcon
  title: string
  description?: string
  tone?: 'default' | 'destructive'
  children: React.ReactNode
}) {
  return (
    <Card className={tone === 'destructive' ? 'border-destructive/30' : undefined}>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span
            className={
              tone === 'destructive'
                ? 'flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive'
                : 'flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'
            }
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="grid gap-0.5">
            <CardTitle>{title}</CardTitle>
            {description !== undefined && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Chữ cái đầu của tên đăng nhập, dùng làm ảnh đại diện tạm — backend chưa có avatar. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function DeviceRow({
  device,
  onRevoke,
}: {
  device: AuthSession
  onRevoke: (device: AuthSession) => void
}) {
  const { t } = useTranslation('account')

  return (
    <li className="flex items-center gap-3 py-2">
      <MonitorIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {device.userAgent ?? device.ipAddress ?? device.sessionId}
        </p>
        {device.lastSeenAt !== undefined && (
          <p className="text-muted-foreground text-xs">
            {t('deviceLastSeen')}: {formatDateTime(device.lastSeenAt)}
          </p>
        )}
      </div>
      {device.current ? (
        <Badge variant="success">{t('deviceCurrent')}</Badge>
      ) : (
        <Button variant="outline" size="sm" onClick={() => onRevoke(device)}>
          {t('deviceRevoke')}
        </Button>
      )}
    </li>
  )
}

export function AccountPage() {
  const { t } = useTranslation(['account', 'common'])
  const tokenUser = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const profileQuery = useProfile()
  const devicesQuery = useAuthSessions(BACKEND_SUPPORTS.sessionList)
  const revoke = useRevokeSession()

  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [logoutAllOpen, setLogoutAllOpen] = useState(false)
  const [revoking, setRevoking] = useState<AuthSession | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)

  // Token đã mang sẵn số điện thoại và vai trò → hiện ngay, không bắt chờ GET /auth/me.
  const profile = profileQuery.data
  const loginName = profile?.userName ?? tokenUser?.userName ?? ''
  const roleName = profile?.roleName ?? tokenUser?.roleName ?? ''

  return (
    <div className="grid gap-5 sm:max-w-2xl">
      {/* Hero: ảnh đại diện tạm bằng chữ cái đầu (backend chưa có avatar) + tên + vai trò. */}
      <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-5">
        <span
          aria-hidden
          className="bg-primary text-primary-foreground font-heading flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold"
        >
          {initials(loginName)}
        </span>
        <div className="grid min-w-0 gap-1.5">
          <h1 className="truncate text-xl font-semibold">{loginName}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{roleName}</Badge>
            {profile?.isActive === false && (
              <Badge variant="destructive">{t('account:inactive')}</Badge>
            )}
          </div>
          {/* Không lặp lại tên đăng nhập trong một thẻ riêng — nó đã là tiêu đề ở ngay trên. */}
          <p className="text-muted-foreground text-xs">{t('account:loginNameHint')}</p>
        </div>
      </div>

      {BACKEND_SUPPORTS.profileEdit && (
        <Section
          icon={UserIcon}
          title={t('account:profileSection')}
          description={t('account:profileSectionHint')}
        >
          {profileQuery.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : profile === undefined ? (
            <p role="alert" className="text-destructive text-sm">
              {resolveApiErrorMessage(profileQuery.error)}
            </p>
          ) : (
            <ProfileForm profile={profile} />
          )}
        </Section>
      )}

      <Section
        icon={KeyRoundIcon}
        title={t('account:securitySection')}
        description={t('account:securitySectionHint')}
      >
        <Button
          variant="outline"
          size="lg"
          className="justify-self-start"
          onClick={() => setChangePasswordOpen(true)}
        >
          {t('account:changePassword')}
        </Button>
      </Section>

      {BACKEND_SUPPORTS.sessionList && (
        <Section
          icon={MonitorIcon}
          title={t('account:devicesSection')}
          description={t('account:devicesSectionHint')}
        >
          {devicesQuery.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : (devicesQuery.data?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">{t('account:devicesEmpty')}</p>
          ) : (
            <ul className="divide-y">
              {devicesQuery.data?.map((device) => (
                <DeviceRow key={device.sessionId} device={device} onRevoke={setRevoking} />
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section
        icon={ShieldIcon}
        title={t('account:logoutSection')}
        description={t('account:logoutSectionHint')}
        tone="destructive"
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" onClick={() => setLogoutOpen(true)}>
            <LogOutIcon aria-hidden />
            {t('account:logout')}
          </Button>
          <Button variant="destructive-solid" size="lg" onClick={() => setLogoutAllOpen(true)}>
            {t('account:logoutAll')}
          </Button>
        </div>
      </Section>

      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        icon={<LogOutIcon />}
        title={t('account:logoutTitle')}
        description={t('account:logoutConfirm')}
        confirmLabel={t('account:logout')}
        onConfirm={() => void logout()}
      />
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <LogoutAllDialog open={logoutAllOpen} onOpenChange={setLogoutAllOpen} />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        icon={<LogOutIcon />}
        title={t('account:deviceRevokeTitle')}
        description={t('account:deviceRevokeConfirm')}
        confirmLabel={revoke.isPending ? t('common:saving') : t('account:deviceRevoke')}
        isPending={revoke.isPending}
        onConfirm={() =>
          revoking && revoke.mutate(revoking.sessionId, { onSuccess: () => setRevoking(null) })
        }
      />
    </div>
  )
}
