import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Vòng chờ giữa màn hình khi router tải chunk của màn `lazy` ở lần tải trang đầu tiên. */
export function HydrateFallback() {
  const { t } = useTranslation(['common'])

  return (
    <div
      role="status"
      aria-label={t('common:loading')}
      className="bg-background flex min-h-screen items-center justify-center"
    >
      <LoaderCircle className="text-muted-foreground size-6 animate-spin" aria-hidden />
    </div>
  )
}
