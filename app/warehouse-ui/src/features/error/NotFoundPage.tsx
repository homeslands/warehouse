import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CenteredMessage } from '@/components/layout/CenteredMessage'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  const { t } = useTranslation(['error'])

  return (
    <CenteredMessage
      title={t('error:notFoundTitle')}
      description={t('error:notFoundDescription')}
    >
      <Button asChild variant="outline">
        <Link to="/">{t('error:goHome')}</Link>
      </Button>
    </CenteredMessage>
  )
}
