import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CenteredMessage } from '@/components/layout/CenteredMessage'
import { Button } from '@/components/ui/button'

export function ForbiddenPage() {
  const { t } = useTranslation(['error'])

  return (
    <CenteredMessage
      title={t('error:forbiddenTitle')}
      description={t('error:forbiddenDescription')}
    >
      <Button asChild variant="outline">
        <Link to="/">{t('error:goHome')}</Link>
      </Button>
    </CenteredMessage>
  )
}
