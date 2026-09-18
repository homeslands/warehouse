import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CenteredMessage } from '@/shared/ui/CenteredMessage'
import { Button } from '@/shared/ui/button'

export function NotFoundPage() {
  const { t } = useTranslation(['errorPages'])

  return (
    <CenteredMessage
      title={t('errorPages:notFoundTitle')}
      description={t('errorPages:notFoundDescription')}
    >
      <Button asChild variant="outline">
        <Link to="/">{t('errorPages:goHome')}</Link>
      </Button>
    </CenteredMessage>
  )
}
