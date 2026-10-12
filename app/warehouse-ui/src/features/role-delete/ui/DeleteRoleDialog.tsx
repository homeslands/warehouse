import { useQueryClient } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { toastApiError } from '@/shared/lib/toast-error'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { roleKeys, useDeleteRole, type Role } from '@/entities/user'

/** Vai trò có sẵn — trang đã khoá mục Xoá, nhưng giữ để báo đúng nếu dữ liệu cũ. */
const ROLE_BUILT_IN = 100105
/** Còn người dùng mang vai trò (kể cả người đã xoá mềm) — backend không trả số đếm nên chỉ biết sau khi gửi. */
const ROLE_IN_USE = 100106

type Props = {
  /** `null` = đóng. */
  role: Role | null
  onOpenChange: (open: boolean) => void
  /** Có `USER_READ` — cho link sang danh sách người dùng của vai trò khi còn người dùng (100106). */
  canViewUsers: boolean
}

/** 100105 / 100106 báo ngay trong hộp; lỗi khác (cấp / quyền đã đổi, vai trò đã bị xoá) tải lại danh sách rồi toast. */
export function DeleteRoleDialog({ role, onOpenChange, canViewUsers }: Props) {
  const { t } = useTranslation(['roles', 'common'])
  const qc = useQueryClient()
  const remove = useDeleteRole()
  const [error, setError] = useState<{ slug: string; code: number; message: string } | null>(null)

  // Giữ bản ghi cuối để lúc hộp mờ dần không hiện câu xác nhận với tên trống.
  const [last, setLast] = useState(role)
  if (role !== null && role !== last) setLast(role)
  // Đóng hộp = dọn lỗi: mở lại (vd sau khi đã đổi vai trò của người dùng) không còn câu lỗi cũ.
  if (role === null && error !== null) setError(null)
  const shown = role ?? last
  // Lỗi gắn với bản ghi nó sinh ra: mở cho vai trò khác thì không hiện lại.
  const inline = error !== null && error.slug === role?.slug ? error : null

  const confirm = () => {
    if (!role) return
    const { slug } = role
    setError(null)
    remove.mutate(slug, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => {
        if (isApiError(err) && (err.code === ROLE_IN_USE || err.code === ROLE_BUILT_IN)) {
          setError({ slug, code: err.code, message: resolveApiErrorMessage(err) })
          return
        }
        // 100104 / 100101: cấp, quyền hoặc dữ liệu đã đổi — tải lại để bảng hiện đúng rồi báo.
        void qc.invalidateQueries({ queryKey: roleKeys.all })
        toastApiError(err)
        onOpenChange(false)
      },
    })
  }

  return (
    <ConfirmDialog
      open={role !== null}
      onOpenChange={onOpenChange}
      icon={<Trash2Icon />}
      title={t('roles:delete')}
      description={
        <Trans
          ns={['roles', 'common']}
          i18nKey="roles:deleteConfirm"
          values={{ name: shown?.name ?? '' }}
          components={[<span key="0" />, <span key="1" className="font-medium" />]}
        />
      }
      details={
        inline !== null ? (
          <p role="alert" className="text-destructive text-sm">
            {inline.message}
            {inline.code === ROLE_IN_USE && canViewUsers && (
              <>
                {' '}
                <Link
                  to={`/users?roleSlug=${encodeURIComponent(inline.slug)}`}
                  className="font-medium underline underline-offset-4"
                >
                  {t('roles:viewUsers')}
                </Link>
              </>
            )}
          </p>
        ) : undefined
      }
      confirmLabel={remove.isPending ? t('roles:deleting') : t('roles:deleteAction')}
      isPending={remove.isPending}
      onConfirm={confirm}
    />
  )
}
