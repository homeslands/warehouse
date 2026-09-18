import { useTranslation } from 'react-i18next'
import { useNavigation } from 'react-router-dom'

/**
 * Thanh mảnh ở đỉnh vùng nội dung khi router đang tải màn mới (chunk `lazy`). Màn cũ vẫn hiển thị
 * bên dưới — không thay bằng spinner toàn trang.
 */
export function RouteProgress() {
  const navigation = useNavigation()
  const { t } = useTranslation(['common'])

  if (navigation.state !== 'loading') return null
  return (
    <div
      role="progressbar"
      aria-label={t('common:loading')}
      className="bg-primary/20 absolute inset-x-0 top-0 h-0.5 overflow-hidden"
    >
      <div className="bg-primary h-full w-1/3 animate-pulse" />
    </div>
  )
}
