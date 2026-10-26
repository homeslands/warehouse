import { zodResolver } from '@hookform/resolvers/zod'
import { UserCogIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resources } from '@/shared/i18n'
import { changedFieldLabels } from '@/shared/lib/changed-fields'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { formatNumber } from '@/shared/lib/format'
import { toastApiError } from '@/shared/lib/toast-error'
import { FormSheet } from '@/shared/ui/FormSheet'
import { NumberInput } from '@/shared/ui/NumberInput'
import { SummaryList } from '@/shared/ui/SummaryList'
import { useSaveChangesConfirmation } from '@/shared/ui/useSaveChangesConfirmation'
import { DetailField } from '@/shared/ui/detail'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { useAuthStore, useRoleLabel } from '@/entities/session'
import {
  BUILT_IN_ROLE_NAMES,
  maxCreatableLevel,
  sortRolesByLevel,
  useCreateRole,
  useUpdateRole,
  type Role,
} from '@/entities/user'
import { describeLevelPosition } from '../model/level-position'
import {
  EMPTY_ROLE_FORM,
  makeRoleCreateSchema,
  roleEditSchema,
  toCreateInput,
  type RoleCreateValues,
  type RoleEditValues,
} from '../model/role-form.schema'

const ROLE_LEVEL_FORBIDDEN = 100104
const FIELD_BY_CODE = { 100102: 'name', 100103: 'name' } as const

/** Mã + nhãn vi/en của vai trò có sẵn — tên mới không được trùng (không phân biệt hoa thường). */
const BUILT_IN_NAMES: readonly string[] = [
  ...BUILT_IN_ROLE_NAMES,
  ...Object.values(resources.vi.common.roles),
  ...Object.values(resources.en.common.roles),
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Có = sửa mô tả vai trò này; không có = tạo mới. */
  role?: Role
  /** Vai trò đang có — chặn trùng tên, gợi ý cấp, mô tả vị trí. */
  roles: readonly Role[]
}

export function RoleFormSheet(props: Props) {
  return props.role ? (
    <EditRoleSheet {...props} role={props.role} />
  ) : (
    <CreateRoleSheet {...props} />
  )
}

function CreateRoleSheet({ open, onOpenChange, roles }: Props) {
  const { t } = useTranslation(['roles', 'common'])
  const roleLabel = useRoleLabel()
  const me = useAuthStore((s) => s.user)
  const create = useCreateRole()
  const maxLevel = me ? maxCreatableLevel(me, roles) : 0

  const schema = useMemo(
    () =>
      makeRoleCreateSchema({
        maxLevel,
        takenNames: [...BUILT_IN_NAMES, ...roles.map((role) => role.name)],
      }),
    [maxLevel, roles],
  )
  const form = useForm<RoleCreateValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: EMPTY_ROLE_FORM,
  })

  useEffect(() => {
    if (open) form.reset(EMPTY_ROLE_FORM)
  }, [open, form])

  // Form hợp lệ → giữ giá trị, hỏi xác nhận rồi mới gửi (tên và cấp không đổi được sau khi tạo).
  const [toCreate, setToCreate] = useState<RoleCreateValues | null>(null)
  if (!open && toCreate) setToCreate(null)

  // Thấp → cao, khớp cách người dùng đọc thang cấp khi chọn số.
  const existing = sortRolesByLevel(roles)
    .filter((role) => role.level !== undefined)
    .reverse()
    .map((role) => `${roleLabel(role.name)} ${formatNumber(role.level)}`)
    .join(' · ')
  const rangeHint =
    maxLevel <= 0 ? t('roles:levelHintNone') : t('roles:levelHintRange', { max: maxLevel })

  const confirmCreate = () => {
    if (!toCreate) return
    create.mutate(toCreateInput(toCreate), {
      onSuccess: () => onOpenChange(false),
      onError: (error) => {
        // Đóng hộp xác nhận để lỗi tại ô hiện ra.
        setToCreate(null)
        // 100104 dùng chung với "gán vai trò" ở màn Người dùng — ở đây nói về ô Cấp.
        if (isApiError(error) && error.code === ROLE_LEVEL_FORBIDDEN) {
          form.setError(
            'level',
            { type: 'server', message: t('roles:levelForbidden') },
            { shouldFocus: true },
          )
          return
        }
        if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
        toastApiError(error)
      },
    })
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('roles:create')}
      submitLabel={t('roles:create')}
      isPending={create.isPending}
      isDirty={form.formState.isDirty}
      confirmation={{
        open: toCreate !== null,
        onOpenChange: (next) => {
          if (!next) setToCreate(null)
        },
        icon: <UserCogIcon />,
        title: t('roles:createConfirmTitle'),
        description: t('roles:createConfirmDescription'),
        details: toCreate && (
          <SummaryList
            items={[
              { label: t('roles:fieldName'), value: toCreate.name.trim() },
              { label: t('roles:fieldLevel'), value: formatNumber(toCreate.level) },
              {
                label: t('roles:positionLabel'),
                value: describeLevelPosition(toCreate.level as number, roles, roleLabel, t),
              },
              { label: t('roles:fieldDescription'), value: toCreate.description.trim() },
            ]}
          />
        ),
        confirmLabel: t('roles:createConfirmAction'),
        onConfirm: confirmCreate,
      }}
      onSubmit={form.handleSubmit((values) => setToCreate(values))}
    >
      <Form {...form}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('roles:fieldName')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>{t('roles:nameHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="level"
          render={({ field }) => (
            <FormItem required>
              <FormLabel>{t('roles:fieldLevel')}</FormLabel>
              <FormControl>
                <NumberInput
                  integer
                  ref={field.ref}
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              </FormControl>
              {/* Tên vai trò tự tạo có thể dài không khoảng trắng — ngắt để không kéo tràn sheet. */}
              <FormDescription className="wrap-anywhere">
                {existing !== '' && <>{t('roles:levelHintExisting', { list: existing })}. </>}
                {rangeHint}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('roles:fieldDescription')}</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    </FormSheet>
  )
}

function EditRoleSheet({ open, onOpenChange, role }: Props & { role: Role }) {
  const { t } = useTranslation(['roles', 'common'])
  const roleLabel = useRoleLabel()
  const update = useUpdateRole()
  const form = useForm<RoleEditValues>({
    resolver: zodResolver(roleEditSchema),
    mode: 'onTouched',
    defaultValues: { description: '' },
  })

  useEffect(() => {
    if (open) form.reset({ description: role.description ?? '' })
  }, [open, role, form])

  // Form hợp lệ → hỏi "Lưu thay đổi …?" rồi mới PATCH.
  const saveConfirmation = useSaveChangesConfirmation<RoleEditValues>({
    open,
    entity: t('roles:entityName'),
    name: roleLabel(role.name),
    changed: changedFieldLabels(form.formState.dirtyFields, {
      description: t('roles:fieldDescription'),
    }),
    icon: <UserCogIcon />,
    onConfirm: (values) => {
      update.mutate(
        // Xoá trống → gửi `''` (backend nhận và xoá mô tả cũ).
        { slug: role.slug, input: { description: values.description.trim() } },
        {
          onSuccess: () => onOpenChange(false),
          onError: (error) => {
            saveConfirmation.close()
            toastApiError(error)
          },
        },
      )
    },
  })

  const onSubmit = (values: RoleEditValues) => saveConfirmation.request(values)

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('roles:edit')}
      submitLabel={t('common:save')}
      isPending={update.isPending}
      submitDisabled={!form.formState.isDirty}
      isDirty={form.formState.isDirty}
      confirmation={saveConfirmation.confirmation}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <dl className="grid grid-cols-2 gap-4">
        <DetailField label={t('roles:fieldName')}>{roleLabel(role.name)}</DetailField>
        <DetailField label={t('roles:fieldLevel')}>
          {role.level === undefined ? '—' : formatNumber(role.level)}
        </DetailField>
      </dl>
      <p className="text-muted-foreground text-sm">{t('roles:readOnlyHint')}</p>
      <Form {...form}>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('roles:fieldDescription')}</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    </FormSheet>
  )
}
