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
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          // Key theo vị trí: danh sách chỉ dựng lại từ route, không thêm/xoá giữa chừng.
          <Fragment key={index}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {crumb.current ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={crumb.to}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
