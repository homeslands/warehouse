import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CenteredMessage } from '@/shared/ui/CenteredMessage'
import { Button } from '@/shared/ui/button'

export function ForbiddenPage() {
  const { t } = useTranslation(['errorPages'])

  return (
    <CenteredMessage
      title={t('errorPages:forbiddenTitle')}
      description={t('errorPages:forbiddenDescription')}
    >
      <Button asChild variant="outline">
        <Link to="/">{t('errorPages:goHome')}</Link>
      </Button>
    </CenteredMessage>
  )
}
