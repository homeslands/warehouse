import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { formatDateTime } from '@/shared/lib/format'
import { formatFullName } from '@/shared/lib/person-name'
import { Badge } from '@/shared/ui/badge'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import type { User } from '../model/types'
import { UserStatusBadge } from './UserStatusBadge'

/**
 * Tên hiển thị một người dùng: họ tên, chưa khai thì định danh đăng nhập (`phonenumber` — với root là
 * chuỗi `"root"`, không phải số điện thoại). Dùng cho bảng, nhãn nút và câu xác nhận.
 */
export function userDisplayName(
  user: Pick<User, 'phonenumber' | 'firstName' | 'lastName'>,
): string {
  return formatFullName(user) || user.phonenumber
}

/**
 * `roleLabel` và `isSelf` do tầng page cấp: entity không được đọc `entities/session` (import ngang). Có `onOpen`
 * thì tên là nút mở chi tiết — cho bàn phím, vì cả dòng bấm được (`DataTable` `onRowClick`) nhưng `<tr>` không nhận focus.
 * `sortField` khớp field `sort` của `GET /users` (chỉ có tác dụng khi màn bật `sorting`). Khung hẹp giữ Họ tên, Trạng thái, Thao tác.
 */
const MAX_WAREHOUSES_SHOWN = 2

export function buildUserColumns(
  t: TFunction<readonly ['users', 'common']>,
  options: {
    roleLabel: (roleName: string) => string
    isSelf: (user: User) => boolean
    onOpen?: (user: User) => void
  },
): ColumnDef<User>[] {
  const { roleLabel, isSelf, onOpen } = options
  return [
    {
      id: 'name',
      header: t('users:columnName'),
      meta: { sortField: 'firstName' },
      cell: ({ row }) => (
        // Nhãn "Bạn" chạy theo dòng chữ (inline) — tên xuống 2-3 dòng thì nhãn nằm ngay sau chữ cuối, không
        // lơ lửng giữa ô như khi là một cột flex.
        <div className="max-w-64 min-w-28 font-medium break-words whitespace-normal">
          {onOpen ? (
            <button
              type="button"
              className="text-left underline-offset-4 hover:underline"
              aria-label={t('users:viewDetail', { name: userDisplayName(row.original) })}
              onClick={() => onOpen(row.original)}
            >
              {userDisplayName(row.original)}
            </button>
          ) : (
            userDisplayName(row.original)
          )}
          {isSelf(row.original) && (
            <Badge variant="secondary" className="ms-2 align-middle">
              {t('users:you')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'phonenumber',
      header: t('users:columnLogin'),
      meta: { sortField: 'phonenumber', hideBelow: '@sm' },
    },
    {
      id: 'email',
      header: t('users:columnEmail'),
      meta: { hideBelow: '@4xl' },
      // Email không có chỗ ngắt dòng: `break-words` cắt giữa chữ khi chạm `max-w`, mà KHÔNG hạ min-content
      // (khác `overflow-wrap:anywhere` — bảng sẽ bóp cột tới 1 ký tự, email ngắn cũng gãy).
      cell: ({ row }) =>
        row.original.email ? (
          <span className="block max-w-60 whitespace-normal break-words">{row.original.email}</span>
        ) : (
          <EmptyValue />
        ),
    },
    {
      id: 'role',
      header: t('users:columnRole'),
      meta: { hideBelow: '@2xl' },
      // Vai trò tự tạo tên dài (backend không giới hạn) → cắt "…", `title` cho đọc đủ.
      cell: ({ row }) => {
        const label = roleLabel(row.original.roleName)
        return (
          <span className="block max-w-48 truncate" title={label}>
            {label}
          </span>
        )
      },
    },
    {
      id: 'warehouses',
      header: t('users:columnWarehouses'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) => {
        const names = (row.original.warehouses ?? []).map((w) => w.name)
        if (names.length === 0) return <EmptyValue />
        const all = names.join(', ')
        if (names.length <= MAX_WAREHOUSES_SHOWN) {
          return <span className="block max-w-56 min-w-36 whitespace-normal">{all}</span>
        }
        // Nhiều kho: 2 kho đầu + "+N" để dòng không cao vọt; danh sách đủ ở `title` và cho trình đọc màn hình.
        return (
          <span className="block max-w-56 min-w-36 whitespace-normal" title={all}>
            <span aria-hidden="true">
              {names.slice(0, MAX_WAREHOUSES_SHOWN).join(', ')}
              <span className="text-muted-foreground"> +{names.length - MAX_WAREHOUSES_SHOWN}</span>
            </span>
            <span className="sr-only">{all}</span>
          </span>
        )
      },
    },
    {
      id: 'status',
      header: t('users:columnStatus'),
      cell: ({ row }) => <UserStatusBadge isActive={row.original.isActive} />,
    },
    {
      accessorKey: 'createdAt',
      header: t('users:columnCreatedAt'),
      meta: { sortField: 'createdAt', hideBelow: '@4xl' },
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ]
}
