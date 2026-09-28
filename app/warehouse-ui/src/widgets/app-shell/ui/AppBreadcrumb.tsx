import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/ui/breadcrumb'
import { useCrumbs } from '../model/crumbs'

export function AppBreadcrumb() {
  const { t } = useTranslation(['nav'])
  const crumbs = useCrumbs()

  return (
    <Breadcrumb aria-label={t('nav:breadcrumb')} className="min-w-0">
      {/* Màn hẹp chỉ còn mục cuối (không xuống dòng, cắt bằng "…"): nhiều mục sẽ chồng lên các nút
          bên phải header. Mục trước đó vẫn tới được bằng sidebar / nút "Quay lại danh sách". */}
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => (
          // Key theo vị trí: danh sách chỉ dựng lại từ route, không thêm/xoá giữa chừng.
          <Fragment key={index}>
            {index > 0 && <BreadcrumbSeparator className="hidden sm:inline-flex" />}
            <BreadcrumbItem className={crumb.current ? 'min-w-0' : 'hidden sm:inline-flex'}>
              {crumb.current ? (
                <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={crumb.to} className="whitespace-nowrap">
                    {crumb.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
