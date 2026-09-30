import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthorities } from '@/entities/authority'
import { useRoles } from '@/entities/user'
import { PermissionMatrix } from '@/features/permission-matrix'
import { authorityCodeDrift } from '@/shared/api/authority-codes'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { Skeleton } from '@/shared/ui/skeleton'

export function PermissionsPage() {
  const { t } = useTranslation('permissions')
  const rolesQuery = useRoles()
  const authoritiesQuery = useAuthorities()

  const isPending = rolesQuery.isPending || authoritiesQuery.isPending
  const roles = rolesQuery.data
  const authorities = authoritiesQuery.data
  // Không dùng truthy-check trên `error`: axios reject bằng CHUỖI RỖNG khi response 500 không có
  // body (`error.response.data` là `""`, không phải `null`/`undefined` nên `??` không thay nó) —
  // `""` là falsy, `{error ? ... : ...}` sẽ bỏ qua nhánh lỗi dù query đã thật sự lỗi. Cùng bẫy đã
  // gặp ở `AccountPage.tsx`: gác bằng `data === undefined` (react-query không có data khi query lỗi
  // từ lần tải đầu), không gác theo `error`.
  const error = rolesQuery.error ?? authoritiesQuery.error

  // `AUTHORITY_CODES` là bản sao danh mục của backend — màn này là nơi duy nhất có đủ danh mục thật
  // trong tay, nên soát lệch ở đây. Chỉ khi dev: người dùng cuối không làm gì được với cảnh báo này.
  useEffect(() => {
    if (!import.meta.env.DEV || authorities === undefined) return
    const { unknown, missing } = authorityCodeDrift(authorities.map((a) => a.code))
    if (unknown.length > 0 || missing.length > 0) {
      console.warn(
        '[authority-codes] Danh mục mã quyền của FE lệch backend — sửa src/shared/api/authority-codes.ts.' +
          (unknown.length > 0 ? ` Backend có mà FE chưa khai: ${unknown.join(', ')}.` : '') +
          (missing.length > 0 ? ` FE khai mà backend không có: ${missing.join(', ')}.` : ''),
      )
    }
  }, [authorities])

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>

      {isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : roles === undefined || authorities === undefined ? (
        <p role="alert" className="text-destructive text-sm">
          {resolveApiErrorMessage(error)}
        </p>
      ) : (
        <PermissionMatrix roles={roles} authorities={authorities} />
      )}
    </div>
  )
}
