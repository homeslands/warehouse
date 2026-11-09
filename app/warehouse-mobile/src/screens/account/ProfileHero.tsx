import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { CurrentUser } from '@/entities/session'
import { formatPhone } from '@/shared/lib/phone'
import { useTheme } from '@/shared/theme/useTheme'
import { Avatar, Badge, Text } from '@/shared/ui'

/** "Nguyễn Văn A" từ họ + tên; thiếu cả hai → "". */
function fullNameOf(user: CurrentUser | null): string {
  return [user?.lastName, user?.firstName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
}

/**
 * Đầu trang Tài khoản kiểu "Tài khoản Apple": avatar 84 căn giữa, tên lớn, dòng phụ, email, chip vai
 * trò. Có họ tên → dòng phụ là SĐT; chưa có → tên lớn là SĐT (định dạng đẹp), dòng phụ "Chưa đặt họ
 * tên" — không lặp SĐT hai lần.
 */
export function ProfileHero({ user }: { user: CurrentUser | null }) {
  const { t } = useTranslation(['account', 'common'])
  const { colors } = useTheme()
  const name = fullNameOf(user)
  const phone = user?.phonenumber?.trim() ? formatPhone(user.phonenumber) : ''
  const title = name || phone || user?.userName || t('common:unnamedUser')
  const detail = name ? phone : t('account:noName')
  const email = user?.email?.trim()
  const roleName = user?.roleName
  const role = roleName ? t(`common:roles.${roleName}`, { defaultValue: roleName }) : ''

  return (
    <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 18 }}>
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
    </View>
  )
}
