import { Fragment, useState } from 'react'
import { CheckIcon, MinusIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Authority } from '@/entities/authority'
import { ROLES, useAuthStore, useRoleLabel } from '@/entities/session'
import type { Role } from '@/entities/user'
import { BACKEND_SUPPORTS } from '@/shared/api/backend-capabilities'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { Switch } from '@/shared/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { useTogglePermission, type TogglePermissionInput } from '../api/useTogglePermission'
import { cellLock, isRankLocked, sortRolesByRank, type CellLock } from '../model/cell-rules'
import { useAuthorityLabels } from '../model/labels'

const MANAGE_PERMISSIONS = 'MANAGE_PERMISSIONS'

/** Khoá `i18n` giải thích vì sao ô bị khoá — hiện khi rê chuột. */
const LOCK_REASON = {
  protected: 'permissions:protectedReason',
  rank: 'permissions:rankReason',
  notHeld: 'permissions:notHeldReason',
  lastKey: 'permissions:lastKeyReason',
} as const satisfies Record<CellLock, string>

/** Ô đang chờ xác nhận. Kèm `authorityName` vì hộp gọi tên quyền, còn input chỉ mang `code`. */
type Confirming = TogglePermissionInput & { authorityName: string }

/** Gom authority theo nhóm, giữ nguyên thứ tự API trả (thứ tự seed — có nghĩa nghiệp vụ). */
function groupAuthorities(authorities: Authority[]): { name: string; items: Authority[] }[] {
  const out: { name: string; items: Authority[] }[] = []
  for (const authority of authorities) {
    const name = authority.authorityGroup.name
    const existing = out.find((group) => group.name === name)
    if (existing) existing.items.push(authority)
    else out.push({ name, items: [authority] })
  }
  return out
}

/** Cho mã quyền xuống dòng ở dấu `_` (không bẻ giữa chữ như `break-all`) khi cột tên quyền bị hẹp. */
function breakableCode(code: string) {
  return code.split('_').map((part, i) => (
    <Fragment key={i}>
      {i > 0 && (
        <>
          _<wbr />
        </>
      )}
      {part}
    </Fragment>
  ))
}

export function PermissionMatrix({
  roles,
  authorities,
}: {
  roles: Role[]
  authorities: Authority[]
}) {
  const { t } = useTranslation(['permissions', 'common'])
  const currentUser = useAuthStore((s) => s.user)
  const roleLabel = useRoleLabel()
  const currentRoleName = currentUser?.roleName
  // Luật ủy quyền R1–R4 — xem `model/cell-rules.ts`. Tắt thì chỉ còn khoá "vai trò cuối cùng".
  const delegationRules = BACKEND_SUPPORTS.permissionDelegationRules
  const toggle = useTogglePermission()
  const { authorityName, groupName } = useAuthorityLabels()

  // Những ô đang bay. Set chứ không phải một ô: hai ô khác nhau là hai request độc lập và
  // idempotent, chặn lẫn nhau chỉ làm giao diện ì. KHÔNG suy từ `toggle.variables` — bấm ô thứ hai
  // là `variables` nhảy sang ô mới và ô cũ mở khoá giữa chừng.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [confirming, setConfirming] = useState<Confirming | null>(null)

  const superAdmin = roles.find((role) => role.name === ROLES.SUPER_ADMIN)
  // Xếp theo cấp bậc (ADMIN → MANAGER → SUPERVISOR) sau cột SUPER_ADMIN — không theo thứ tự API.
  const editableRoles = sortRolesByRank(roles.filter((role) => role.name !== ROLES.SUPER_ADMIN))
  const manageHolders = roles.filter((role) => role.authorityCodes.includes(MANAGE_PERMISSIONS))

  const cellKey = (roleSlug: string, code: string) => `${roleSlug}:${code}`

  const run = (input: TogglePermissionInput) => {
    const key = cellKey(input.roleSlug, input.authorityCode)
    setPending((prev) => new Set(prev).add(key))
    // `mutateAsync` (KHÔNG `mutate(input, { onSettled })`): cả bảng dùng CHUNG một
    // `useTogglePermission()`, tức một `MutationObserver` duy nhất. Gọi `mutate()` lần hai trong
    // lúc lần đầu còn bay làm observer đó GỠ đăng ký khỏi mutation thứ nhất (xem
    // `MutationObserver.mutate` của `@tanstack/query-core`) — `onSettled` truyền qua tham số thứ
    // hai của `mutate()` gắn vào observer dùng chung nên bị GHI ĐÈ, callback của lần đầu không bao
    // giờ chạy, và ô đó khoá vĩnh viễn dù request đã xong từ lâu. Promise `mutateAsync` trả về gắn
    // với ĐÚNG mutation đó, không qua observer, nên luôn settle đúng lúc bất kể có bấm ô khác xen
    // vào hay không. `.catch(() => {})` chặn "unhandled rejection" — lỗi đã có handler toast global
    // của `app/query-client.ts` lo, tại đây chỉ cần biết request đã xong để mở khoá ô.
    toggle
      .mutateAsync(input)
      .catch(() => {})
      .finally(() =>
        setPending((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        }),
      )
  }

  // Hỏi lại MỌI lần đổi quyền, không chỉ ca tự thu hồi: một cú bấm nhầm ở đây đổi quyền của cả một
  // vai trò và có hiệu lực ngay với mọi người dùng đang đăng nhập, mà bảng lại dày switch cạnh nhau.
  const onToggle = (role: Role, authority: Authority, granted: boolean) => {
    setConfirming({
      roleSlug: role.slug,
      roleName: role.name,
      authorityCode: authority.code,
      granted,
      authorityName: authorityName(authority),
    })
  }

  // Gỡ quyền quản trị của CHÍNH role mình là ca riêng: hậu quả rơi lên chính người đang bấm, nên
  // hộp phải nói thẳng điều đó thay vì câu chung. (Ca "chiếc chìa khoá cuối cùng" đã bị chặn ở
  // `disabled` nên không bao giờ tới được đây.)
  const isSelfRevoke =
    confirming !== null &&
    !confirming.granted &&
    confirming.authorityCode === MANAGE_PERMISSIONS &&
    confirming.roleName === currentRoleName

  const confirmCopy = isSelfRevoke
    ? {
        icon: <ShieldOffIcon />,
        tone: 'destructive' as const,
        title: t('permissions:selfRevokeTitle'),
        description: t('permissions:selfRevokeConfirm'),
        confirmLabel: t('permissions:selfRevokeAction'),
      }
    : confirming?.granted
      ? {
          icon: <ShieldCheckIcon />,
          tone: 'success' as const,
          title: t('permissions:grantTitle'),
          description: t('permissions:grantConfirm', {
            role: roleLabel(confirming.roleName),
            authority: confirming.authorityName,
          }),
          confirmLabel: t('permissions:grantAction'),
        }
      : {
          icon: <ShieldOffIcon />,
          tone: 'destructive' as const,
          title: t('permissions:revokeTitle'),
          description: t('permissions:revokeConfirm', {
            role: roleLabel(confirming?.roleName),
            authority: confirming?.authorityName ?? '',
          }),
          confirmLabel: t('permissions:revokeAction'),
        }

  return (
    <div className="grid gap-6">
      {/* Mỗi nhóm một BẢNG RIÊNG, tiêu đề nhóm nằm NGOÀI bảng. Đổi lại header cột (tên vai trò)
          lặp ở từng bảng — đó là điểm cộng với 46 quyền: cuộn xuống vẫn luôn thấy mình đang bật
          cho vai trò nào. */}
      {groupAuthorities(authorities).map((group) => (
        <section key={group.name} className="grid gap-2">
          <h2 className="font-heading text-base font-semibold">{groupName(group.name)}</h2>

          <div className="@container overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* Cột đầu DÍNH trái: bảng cuộn ngang, không dính thì kéo sang cột vai trò
                      cuối là mất luôn tên quyền đang bật. Phải có nền đặc, nếu không nội dung
                      cuộn qua sẽ lộ ra dưới nó. */}
                  <TableHead className="bg-background sticky left-0 z-20 max-w-40 whitespace-normal @2xl:max-w-none @2xl:whitespace-nowrap">
                    {t('permissions:columnAuthority')}
                  </TableHead>
                  {/* Khung bảng hẹp ẩn cột SUPER_ADMIN: nó chỉ là lời nhắc "Toàn quyền", không bấm được — nhường
                      chỗ cho các cột vai trò chỉnh được. */}
                  {superAdmin && (
                    <TableHead className="hidden @xl:table-cell">
                      {roleLabel(superAdmin.name)}
                    </TableHead>
                  )}
                  {editableRoles.map((role) => (
                    <TableHead key={role.slug}>
                      <div className="grid">
                        <span>{roleLabel(role.name)}</span>
                        {/* R1: vai trò ngang/cao hơn mình → cả cột chỉ xem. Nói ra ngay ở tiêu đề,
                            thay vì để người dùng tự đoán từ một hàng switch xám. */}
                        {isRankLocked(currentUser, role, delegationRules) && (
                          <span
                            className="text-muted-foreground text-xs font-normal"
                            title={t('permissions:rankReason')}
                          >
                            {t('permissions:readOnlyColumn')}
                          </span>
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.items.map((authority) => (
                  // `hover:bg-muted` ĐẶC thay cho `bg-muted/50` mặc định: ô dính tô nền riêng nên
                  // màu có alpha sẽ chồng hai lớp và lệch màu với phần còn lại của dòng.
                  <TableRow key={authority.slug} className="group hover:bg-muted">
                    {/* `transition-colors` phải LẶP LẠI ở đây: nó nằm trên `<tr>`, không di truyền
                        xuống `<td>`. Thiếu nó, nền `<tr>` mờ dần trong khi ô dính đổi màu tức thì
                        — cột đầu nháy lệch nhịp với phần còn lại của dòng mỗi lần rê chuột. */}
                    {/* Khung bảng hẹp (container query): cột dính giới hạn 10rem và cho xuống dòng, không thì nó chiếm gần hết
                        bề ngang, các cột vai trò chỉ còn một khe để cuộn. */}
                    <TableCell className="bg-background group-hover:bg-muted sticky left-0 z-10 max-w-40 whitespace-normal transition-colors @2xl:max-w-none @2xl:whitespace-nowrap">
                      <div className="grid gap-0.5">
                        <span>{authorityName(authority)}</span>
                        <span className="text-muted-foreground text-xs">
                          {breakableCode(authority.code)}
                        </span>
                      </div>
                    </TableCell>
                    {/* Cột SUPER_ADMIN là LỜI KHẲNG ĐỊNH, không phải dữ liệu: nó bypass mọi cổng
                        kiểm tra và cố tình không có row nào trong permission_tbl. Vẽ switch ở đây
                        là bịa ra một trạng thái không tồn tại. */}
                    {superAdmin && (
                      <TableCell className="text-muted-foreground hidden text-sm @xl:table-cell">
                        {t('permissions:fullAccess')}
                      </TableCell>
                    )}
                    {editableRoles.map((role) => {
                      const granted = role.authorityCodes.includes(authority.code)
                      const label = `${authorityName(authority)} — ${roleLabel(role.name)}`

                      // Cột chỉ xem (R1): dấu ✓/— thay cho switch — vẫn cho biết đã cấp hay chưa.
                      if (isRankLocked(currentUser, role, delegationRules)) {
                        return (
                          <TableCell key={role.slug}>
                            <span
                              role="img"
                              aria-label={`${label}: ${t(granted ? 'permissions:cellGranted' : 'permissions:cellNotGranted')}`}
                              className="text-muted-foreground inline-flex"
                            >
                              {granted ? (
                                <CheckIcon className="size-4" />
                              ) : (
                                <MinusIcon className="size-4" />
                              )}
                            </span>
                          </TableCell>
                        )
                      }

                      const lock = cellLock({
                        actor: currentUser,
                        role,
                        code: authority.code,
                        granted,
                        manageHolderCount: manageHolders.length,
                        delegationRules,
                      })
                      return (
                        <TableCell key={role.slug}>
                          {/* `title` đặt trên `<span>` bọc ngoài, KHÔNG trên chính `<Switch>`: phần
                              tử `disabled` không phát sự kiện chuột ở phần lớn trình duyệt nên
                              tooltip đặt thẳng trên nó không bao giờ hiện — đúng lúc người dùng cần
                              biết vì sao không bấm được. */}
                          <span title={lock ? t(LOCK_REASON[lock]) : undefined}>
                            <Switch
                              aria-label={label}
                              checked={granted}
                              disabled={
                                pending.has(cellKey(role.slug, authority.code)) || lock !== null
                              }
                              onCheckedChange={(next) => onToggle(role, authority, next)}
                            />
                          </span>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}

      <p className="text-muted-foreground text-xs">{t('permissions:superAdminNote')}</p>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        icon={confirmCopy.icon}
        tone={confirmCopy.tone}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        onConfirm={() => {
          if (confirming) run(confirming)
          setConfirming(null)
        }}
      />
    </div>
  )
}
