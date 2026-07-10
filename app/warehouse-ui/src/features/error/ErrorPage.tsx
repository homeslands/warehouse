import { useTranslation } from 'react-i18next'
import { Link, useRouteError } from 'react-router-dom'
import { CenteredMessage } from '@/components/layout/CenteredMessage'
import { Button } from '@/components/ui/button'

/** Đọc message/stack mà không ép kiểu: useRouteError() trả về `unknown`. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}

/**
 * Giữ component này CÀNG ĐƠN GIẢN CÀNG TỐT: không gọi API, không đọc store, không logic điều kiện
 * ngoài cờ import.meta.env.DEV. Nếu ErrorPage tự ném lỗi thì không còn lưới nào bên dưới nó.
 */
export function ErrorPage() {
  const error = useRouteError()
  const { t } = useTranslation(['error'])

  return (
    <CenteredMessage title={t('error:title')} description={t('error:description')}>
      <div className="flex justify-center gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t('error:reload')}
        </Button>
        <Button asChild>
          <Link to="/">{t('error:goHome')}</Link>
        </Button>
      </div>

      {import.meta.env.DEV && (
        <details className="text-left">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            {t('error:detailsHeading')}
          </summary>
          <pre className="bg-muted mt-2 overflow-x-auto rounded p-3 text-left text-xs">
            {describeError(error)}
          </pre>
        </details>
      )}
    </CenteredMessage>
  )
}
