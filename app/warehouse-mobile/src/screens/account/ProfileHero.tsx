import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { CurrentUser } from '@/entities/session'
import { fullName } from '@/entities/user'
import { formatPhone } from '@/shared/lib/phone'
import { useTheme } from '@/shared/theme/useTheme'
import { Avatar, Badge, DashCard, Text } from '@/shared/ui'

/**
 * Đầu trang Tài khoản = một `DashCard`: avatar 84 căn giữa, họ tên to, dòng phụ muted, email, chip vai
 * trò. Có họ tên → dòng phụ là SĐT; chưa có → tên lớn là SĐT (định dạng đẹp), dòng phụ "Chưa đặt họ
 * tên" — không lặp SĐT hai lần.
 */
export function ProfileHero({ user }: { user: CurrentUser | null }) {
  const { t } = useTranslation(['account', 'common'])
  const { colors } = useTheme()
  const name = fullName(user ?? {})
  const phone = user?.phonenumber?.trim() ? formatPhone(user.phonenumber) : ''
  const title = name || phone || user?.userName || t('common:unnamedUser')
  const detail = name ? phone : t('account:noName')
  const email = user?.email?.trim()
  const roleName = user?.roleName
  const role = roleName ? t(`common:roles.${roleName}`, { defaultValue: roleName }) : ''

  return (
    <DashCard style={{ alignItems: 'center', gap: 0, marginBottom: 14 }}>
      <Avatar name={name} size={84} />
      <Text
        weight="bold"
        size={22}
        numberOfLines={1}
        accessibilityRole="header"
        style={{ marginTop: 12, letterSpacing: -0.4, textAlign: 'center' }}
      >
        {title}
      </Text>
      {detail ? (
        <Text muted size={13} numberOfLines={1} style={{ marginTop: 3, textAlign: 'center' }}>
          {detail}
        </Text>
      ) : null}
      {email ? (
        <Text
          size={13}
          numberOfLines={1}
          style={{ marginTop: 2, textAlign: 'center', color: colors.groupedLabel }}
        >
          {email}
        </Text>
      ) : null}
      {role ? (
        <View style={{ marginTop: 8 }}>
          <Badge variant="solid" pill>
            {role}
          </Badge>
        </View>
      ) : null}
    </DashCard>
  )
}
