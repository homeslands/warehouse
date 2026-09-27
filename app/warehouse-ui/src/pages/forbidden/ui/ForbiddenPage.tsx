import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { CenteredMessage } from '@/shared/ui/CenteredMessage'
import { Button } from '@/shared/ui/button'

export function ForbiddenPage() {
  const { t } = useTranslation(['errorPages'])
  // `RoleGate` gắn lý do khi người dùng VỪA còn vào được màn này — quyền đổi giữa phiên.
  const changed = useSearchParams()[0].get('reason') === 'permissionChanged'

  return (
    <CenteredMessage
      title={t(changed ? 'errorPages:forbiddenChangedTitle' : 'errorPages:forbiddenTitle')}
      description={t(
        changed ? 'errorPages:forbiddenChangedDescription' : 'errorPages:forbiddenDescription',
      )}
    >
      <Button asChild variant="outline">
        <Link to="/">{t('errorPages:goHome')}</Link>
      </Button>
    </CenteredMessage>
  )
}
