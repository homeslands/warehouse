import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { formatDate, formatDateTime } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import { DetailContact, DetailField, DetailGroup, DetailMeta } from '@/shared/ui/detail'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import { Skeleton } from '@/shared/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'
import type { User } from '../model/types'
import { userDisplayName } from './columns'
import { UserStatusBadge } from './UserStatusBadge'

/** `USER_NOT_FOUND` — slug sai, đã xoá, hoặc ngoài phạm vi kho của người xem (backend không phân biệt). */
const USER_NOT_FOUND = 100405

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Chưa có (đang tải lần đầu / lỗi) → khung chờ hoặc câu lỗi. */
  user: User | undefined
  /** Lỗi tải (`useUser`) — chỉ hiện khi chưa có `user` để hiển thị. */
  error?: unknown
  /** Như `buildUserColumns`: tầng page cấp (entity không đọc `entities/session`). */
  roleLabel: (roleName: string) => string
  isSelf: (user: User) => boolean
  /** Nút thao tác ở chân sheet — page dựng theo quyền, bấm mở đúng hộp đang có. Không có → không chân sheet. */
  actions?: ReactNode
}

/**
 * Xem nhanh một người dùng — chỉ đọc. Dữ liệu do bên gọi nạp (`useUser`, `GET /users/{slug}`, hiện sẵn dòng của
 * danh sách làm placeholder) nên sửa / khoá xong sheet tự cập nhật theo lần tải lại.
 */
export function UserDetailSheet({
  open,
  onOpenChange,
  user,
  error,
  roleLabel,
  isSelf,
  actions,
}: Props) {
  const { t } = useTranslation(['users', 'common'])
  // Giữ bản ghi cuối khi sheet đang trượt ra — không trống trơn giữa chừng.
  const [last, setLast] = useState(user)
  if (user !== undefined && user !== last) setLast(user)
  const shown = open ? user : (user ?? last)
  const notFound = isApiError(error) && error.code === USER_NOT_FOUND

  const login = shown?.phonenumber ?? ''
  const warehouses = shown?.warehouses ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]"
        // Radix mặc định focus phần tử bấm được đầu tiên — ở đây là nút "Khoá" ở chân sheet: một cú Enter nhầm
        // là mở hộp khoá. Sheet chỉ để xem nên focus vào chính khung sheet (trình đọc màn hình vẫn đọc tiêu đề).
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).focus()
        }}
      >
        {!shown && (
          // Chưa có dữ liệu: tiêu đề chung (sheet luôn cần tên cho trình đọc màn hình) + khung chờ hoặc câu lỗi.
          <>
            <SheetHeader className="border-b pr-12">
              <SheetTitle>{t('users:detailTitle')}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 p-4">
              {error != null ? (
                <div role="alert" className="space-y-1 text-sm">
                  <p className="font-medium">{resolveApiErrorMessage(error)}</p>
                  {notFound && (
                    <p className="text-muted-foreground">{t('users:detailNotFoundHint')}</p>
                  )}
                </div>
              ) : (
                <div aria-busy="true" className="space-y-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-24" />
                </div>
              )}
            </div>
          </>
        )}
        {shown && (
          <>
            <SheetHeader className="gap-2 border-b pr-12">
              <SheetTitle className="break-words">
                {userDisplayName(shown)}
                {isSelf(shown) && (
                  <Badge variant="secondary" className="ms-2 align-middle">
                    {t('users:you')}
                  </Badge>
                )}
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <UserStatusBadge isActive={shown.isActive} />
                  <span aria-hidden="true">·</span>
                  <span className="min-w-0 break-words">{roleLabel(shown.roleName)}</span>
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
              <DetailGroup className="lg:grid-cols-2">
                <DetailField label={t('users:columnLogin')}>
                  {/* Định danh đăng nhập: thường là SĐT, nhưng `root` là chữ — chỉ số mới thành link gọi. */}
                  {/^\+?\d+$/.test(login) ? <DetailContact kind="tel" value={login} /> : login}
                </DetailField>
                <DetailField label={t('users:fieldEmail')}>
                  <DetailContact kind="mailto" value={shown.email} />
                </DetailField>
                <DetailField label={t('users:fieldDob')}>
                  {shown.dob ? formatDate(shown.dob) : <EmptyValue />}
                </DetailField>
                <DetailField label={t('users:fieldAddress')} span="full">
                  {shown.address || <EmptyValue />}
                </DetailField>
                <DetailField label={t('users:fieldMemberWarehouses')} span="full">
                  {warehouses.length === 0 ? (
                    <EmptyValue />
                  ) : (
                    <ul className="space-y-1">
                      {warehouses.map((w) => (
                        <li key={w.slug}>{w.name}</li>
                      ))}
                    </ul>
                  )}
                </DetailField>
              </DetailGroup>
              <DetailMeta
                items={[
                  { label: t('common:createdAt'), value: formatDateTime(shown.createdAt) },
                  { label: t('common:updatedAt'), value: formatDateTime(shown.updatedAt) },
                ]}
              />
            </div>

            {actions && (
              // `flex-auto`: nút giãn lấp kín từng hàng khi phải xuống hàng (mobile, 4 nút) thay vì dồn lệch phải.
              <SheetFooter className="flex-row flex-wrap gap-2 border-t [&>button]:flex-auto">
                {actions}
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
