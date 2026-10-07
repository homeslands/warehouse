import { UserCogIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { isPhraseConfirmed } from '@/shared/lib/confirm-phrase'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { ConfirmPhraseField } from '@/shared/ui/ConfirmPhraseField'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { DialogIcon } from '@/shared/ui/DialogIcon'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { useRoleLabel } from '@/entities/session'
import { useChangeUserRole, userDisplayName, type Role, type User } from '@/entities/user'

/** Lỗi thuộc về ô chọn vai trò — hiện ngay trong hộp. Còn lại (404, 100416…) đi toast rồi đóng hộp. */
const FIELD_CODES = new Set([100101, 100104, 100404, 100417])

type Props = {
  /** `null` = đóng. */
  user: User | null
  /** Vai trò ĐƯỢC GÁN — trang đã lọc bằng `assignableRoles`. */
  roles: Role[]
  onOpenChange: (open: boolean) => void
}

/**
 * Đổi vai trò người khác (`POST /users/{slug}/change-role`). Backend thu hồi mọi phiên của người đó (vai trò là
 * claim trong JWT) — nói trước và bắt gõ tên đăng nhập để xác nhận, như đặt lại mật khẩu.
 */
export function ChangeUserRoleDialog({ user, roles, onOpenChange }: Props) {
  const { t } = useTranslation(['users', 'common'])
  const roleLabel = useRoleLabel()
  const changeRole = useChangeUserRole()

  // Hộp còn mờ dần sau khi trang đặt `user` về null — giữ bản cuối để chữ không mất tên.
  const [last, setLast] = useState(user)
  if (user !== null && user !== last) setLast(user)
  const shown = user ?? last

  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [typed, setTyped] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)

  // Mở cho một người (lại) → bỏ lựa chọn, chữ đã gõ và lỗi của lần trước.
  useEffect(() => {
    if (user) {
      setSelected(undefined)
      setTyped('')
      setFieldError(null)
    }
  }, [user])

  const options = roles.filter((role) => role.slug !== shown?.roleSlug)
  const confirmed = isPhraseConfirmed(typed, shown?.phonenumber ?? '')

  const submit = () => {
    if (!user || selected === undefined || !confirmed) return
    setFieldError(null)
    changeRole.mutate(
      { slug: user.slug, roleSlug: selected },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          if (isApiError(error) && error.code !== undefined && FIELD_CODES.has(error.code)) {
            setFieldError(resolveApiErrorMessage(error))
            return
          }
          toastApiError(error)
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent
        // Nút × của Radix gọi thẳng `onOpenChange`, không đi qua hai handler dưới — giấu nó lúc đang gửi.
        showCloseButton={!changeRole.isPending}
        onEscapeKeyDown={(event) => {
          if (changeRole.isPending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (changeRole.isPending) event.preventDefault()
        }}
      >
        <DialogHeader className="items-center text-center">
          <DialogIcon>
            <UserCogIcon />
          </DialogIcon>
          <DialogTitle>{t('users:changeRoleTitle')}</DialogTitle>
          <DialogDescription>
            <Trans
              ns={['users']}
              i18nKey="users:changeRoleWarning"
              values={{
                name: shown ? userDisplayName(shown) : '',
                role: roleLabel(shown?.roleName),
              }}
              components={[<span key="0" />, <span key="1" className="font-medium" />]}
            />
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="user-new-role">{t('users:fieldNewRole')}</Label>
          <Select
            value={selected ?? ''}
            onValueChange={setSelected}
            disabled={changeRole.isPending}
          >
            <SelectTrigger
              id="user-new-role"
              aria-label={t('users:fieldNewRole')}
              aria-invalid={fieldError !== null}
              className="w-full"
            >
              <SelectValue placeholder={t('users:rolePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {options.map((role) => (
                <SelectItem key={role.slug} value={role.slug}>
                  {roleLabel(role.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError !== null && (
            <p role="alert" className="text-destructive text-sm">
              {fieldError}
            </p>
          )}
        </div>

        <ConfirmPhraseField
          phrase={shown?.phonenumber ?? ''}
          value={typed}
          onChange={setTyped}
          disabled={changeRole.isPending}
        />

        <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
          <Button
            type="button"
            variant="outline"
            size="xl"
            disabled={changeRole.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common:cancel')}
          </Button>
          <Button
            type="button"
            size="xl"
            disabled={changeRole.isPending || selected === undefined || !confirmed}
            onClick={submit}
          >
            {changeRole.isPending ? t('common:saving') : t('users:changeRoleAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
