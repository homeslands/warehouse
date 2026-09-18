import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useMatches, type UIMatch } from 'react-router-dom'
import { useNavLabel } from '@/shared/lib/nav'

export type Crumb = {
  to: string
  label: string
  /** Mục cuối = trang hiện tại: chữ thường, `aria-current="page"`. */
  current: boolean
}

const HOME_KEY = 'nav:home'

/** `handle.crumb` của một match (tầng app khai bằng `satisfies AppRouteHandle`); sai kiểu → bỏ. */
function crumbKeyOf(match: UIMatch): string | undefined {
  const handle: unknown = match.handle
  if (typeof handle !== 'object' || handle === null || !('crumb' in handle)) return undefined
  return typeof handle.crumb === 'string' ? handle.crumb : undefined
}

/**
 * "Tổng quan" (luôn đầu tiên) rồi crumb của các match; các mục liền nhau cùng `to` gộp làm một.
 * Route `/` đã là "Tổng quan" nên không lặp lại. Mục cuối là trang hiện tại — trừ khi chỉ còn "Tổng quan" mà đang không ở `/`
 * (màn chưa khai crumb): khi đó "Tổng quan" vẫn là link.
 */
export function useCrumbs(): Crumb[] {
  const matches = useMatches()
  const { pathname } = useLocation()
  const label = useNavLabel()

  const items = [
    { to: '/', label: label(HOME_KEY) },
    ...matches.flatMap((match) => {
      const key = crumbKeyOf(match)
      // Route index con có pathname kèm "/" cuối (`/stock/`) — bỏ đi để trùng với route cha.
      const to = match.pathname.replace(/(.)\/$/, '$1')
      return key && to !== '/' ? [{ to, label: label(key) }] : []
    }),
  ]
    // Route cha và route index con cùng khai crumb thì cùng pathname: chỉ giữ mục sâu hơn.
    .filter((item, index, all) => all[index + 1]?.to !== item.to)

  return items.map((item, index) => ({
    ...item,
    current: index === items.length - 1 && (index > 0 || pathname === '/'),
  }))
}

/**
 * `document.title = "<crumb cuối> · <tên app>"`; màn không có crumb → tên app. Đổi theo route và
 * ngôn ngữ. Rời layout (login, 404…) → trả về tên app.
 */
export function useDocumentTitle(): void {
  const matches = useMatches()
  const { t } = useTranslation(['common'])
  const label = useNavLabel()

  const key = matches.map(crumbKeyOf).findLast((k) => k !== undefined)
  const appName = t('common:appName')
  const title = key ? `${label(key)} · ${appName}` : appName

  useEffect(() => {
    document.title = title
  }, [title])

  useEffect(
    () => () => {
      document.title = appName
    },
    [appName],
  )
}
