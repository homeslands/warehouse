import { useRouter } from 'expo-router'
import { Globe, KeyRound, Warehouse } from '@/shared/ui/icons'
import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, View } from 'react-native'

import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { usePasswordNotice } from '@/features/change-password'
import { useCurrentLanguage } from '@/features/language-switch'
import { useLogoutAction } from '@/features/logout'
import { WarehouseTransition } from '@/features/warehouse-picker'
import { appVersion } from '@/shared/config/app-version'
import { getEnv, isSandbox } from '@/shared/config/env'
import { ListGroup, ListRow, Screen, SectionFooter, SectionHeader, Text } from '@/shared/ui'

import { ProfileHero } from './ProfileHero'

/** Đường kẻ trong nhóm bắt đầu sau ô icon 30: lề 16 + ô 30 + khoảng cách 12. */
const ROW_INSET = 58

/** Một khối: tiêu đề nhóm viết thường (tuỳ chọn) + thẻ, cách khối sau 22. */
function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 22 }}>
      {title ? <SectionHeader variant="sentence">{title}</SectionHeader> : null}
      {children}
    </View>
  )
}

/**
 * Tài khoản kiểu trang "Tài khoản Apple" (iOS 26/27): đầu trang căn giữa (avatar, tên, vai trò), nhóm
 * "Làm việc" (kho), nhóm "Cài đặt" (ngôn ngữ, đổi mật khẩu), nhóm đăng xuất chữ đỏ căn giữa (hỏi lại
 * bằng hộp thoại gốc), chân màn "Kho · phiên bản · Sandbox". Nhóm bo góc 26, dòng cao 50.
 */
export function AccountScreen() {
  const { t } = useTranslation(['account', 'auth', 'common'])
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const warehouse = useWarehouseStore((s) => s.current)
  const language = useCurrentLanguage()
  const logout = useLogoutAction('this-device')
  const logoutAll = useLogoutAction('all-devices')
  const passwordChanged = usePasswordNotice((s) => s.changed)

  const footer = [t('common:appName'), appVersion()]
  if (isSandbox(getEnv())) footer.push(t('common:sandbox'))

  return (
    <Screen edges={['left', 'right']} tone="grouped">
      {/* Tiêu đề lớn "Tài khoản" do header native của Stack lồng vẽ (thu lại khi cuộn). */}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}
      >
        <ProfileHero user={user} />

        <Section title={t('account:workSection')}>
          <WarehouseTransition>
            <ListGroup large inset={ROW_INSET}>
              <ListRow
                large
                icon={Warehouse}
                label={t('account:warehouseRow')}
                value={warehouse?.name ?? t('common:notSet')}
                chevron
                accessibilityHint={t('auth:changeWarehouse')}
                onPress={() => router.navigate('/switch-warehouse')}
              />
            </ListGroup>
          </WarehouseTransition>
        </Section>

        <Section title={t('account:settingsSection')}>
          <ListGroup large inset={ROW_INSET}>
            <ListRow
              large
              icon={Globe}
              label={t('common:language')}
              value={language.label}
              chevron
              onPress={() => router.navigate('/language')}
            />
            <ListRow
              large
              icon={KeyRound}
              label={t('account:changePassword')}
              chevron
              onPress={() => {
                usePasswordNotice.getState().clear()
                router.navigate('/change-password')
              }}
            />
          </ListGroup>
          {passwordChanged ? (
            <SectionFooter tone="success" accessibilityRole="alert">
              {t('auth:changePassword.success')}
            </SectionFooter>
          ) : null}
        </Section>

        <Section>
          <ListGroup large inset={16}>
            <ListRow
              large
              label={t('account:logout')}
              destructive
              centered
              busy={logout.pending}
              onPress={() => void logout.request()}
            />
            <ListRow
              large
              label={t('account:logoutAll')}
              destructive
              centered
              busy={logoutAll.pending}
              onPress={() => void logoutAll.request()}
            />
          </ListGroup>
        </Section>

        <Text size={12} muted style={{ textAlign: 'center', marginBottom: 8 }}>
          {footer.join(' · ')}
        </Text>
      </ScrollView>
    </Screen>
  )
}
