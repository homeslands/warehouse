import { useRouter } from 'expo-router'
import { Eye, Globe, KeyRound, Package, Ruler, SunMoon, Tag, Warehouse } from '@/shared/ui/icons'
import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, View } from 'react-native'

import { materialAbilities } from '@/entities/material'
import { materialTypeAbilities } from '@/entities/material-type'
import { useAuthStore } from '@/entities/session'
import { unitAbilities } from '@/entities/unit'
import { useWarehouseStore } from '@/entities/warehouse'
import { useCurrentAppearance } from '@/features/appearance-switch'
import { usePasswordNotice } from '@/features/change-password'
import { useCurrentLanguage } from '@/features/language-switch'
import { useLogoutAction } from '@/features/logout'
import { WarehouseTransition } from '@/features/warehouse-picker'
import { appVersion } from '@/shared/config/app-version'
import { getEnv, isSandbox } from '@/shared/config/env'
import {
  ICON_CARD_INSET,
  ListGroup,
  ListRow,
  Screen,
  SectionFooter,
  SectionHeader,
  Text,
} from '@/shared/ui'

import { ProfileHero } from './ProfileHero'

/**
 * Một khối: tiêu đề nhóm viết thường (tuỳ chọn, thẳng cột với vòng icon trong thẻ — lề `ICON_CARD_INSET`)
 * + card, cách khối sau 14.
 */
function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {title ? (
        <SectionHeader variant="sentence" inset={ICON_CARD_INSET}>
          {title}
        </SectionHeader>
      ) : null}
      {children}
    </View>
  )
}

/**
 * Tài khoản kiểu trang "Tài khoản Apple" (iOS 26/27): đầu trang căn giữa (avatar, tên, vai trò), nhóm
 * "Làm việc" (kho), nhóm "Cài đặt" (ngôn ngữ, giao diện, đổi mật khẩu), nhóm đăng xuất chữ đỏ căn giữa (hỏi lại
 * bằng hộp thoại gốc), chân màn "Kho · phiên bản · Sandbox". Mỗi nhóm có icon là một card `ListGroup variant="iconCard"` (vòng icon xám, lề quanh vòng cân 12), khoảng giữa card 14.
 */
export function AccountScreen() {
  const { t } = useTranslation(['account', 'auth', 'catalog', 'common'])
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const warehouse = useWarehouseStore((s) => s.current)
  const language = useCurrentLanguage()
  const appearance = useCurrentAppearance()
  const logout = useLogoutAction('this-device')
  const logoutAll = useLogoutAction('all-devices')
  const passwordChanged = usePasswordNotice((s) => s.changed)

  const canUnits = unitAbilities(user).read
  const canTypes = materialTypeAbilities(user).read
  const canMaterials = materialAbilities(user).read

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
            <ListGroup variant="iconCard">
              <ListRow
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

        {canUnits || canTypes || canMaterials ? (
          <Section title={t('catalog:section')}>
            <ListGroup variant="iconCard">
              {canMaterials ? (
                <ListRow
                  icon={Package}
                  label={t('catalog:material.title')}
                  chevron
                  onPress={() => router.push('/account/materials')}
                />
              ) : null}
              {canUnits ? (
                <ListRow
                  icon={Ruler}
                  label={t('catalog:unit.title')}
                  chevron
                  onPress={() => router.push('/account/units')}
                />
              ) : null}
              {canTypes ? (
                <ListRow
                  icon={Tag}
                  label={t('catalog:materialType.title')}
                  chevron
                  onPress={() => router.push('/account/material-types')}
                />
              ) : null}
            </ListGroup>
          </Section>
        ) : null}

        <Section title={t('account:settingsSection')}>
          <ListGroup variant="iconCard">
            <ListRow
              icon={Globe}
              label={t('common:language')}
              value={language.label}
              chevron
              onPress={() => router.navigate('/language')}
            />
            <ListRow
              icon={SunMoon}
              label={t('common:appearance')}
              value={appearance.label}
              chevron
              onPress={() => router.navigate('/appearance')}
            />
            <ListRow
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
            <SectionFooter tone="success" accessibilityRole="alert" inset={ICON_CARD_INSET}>
              {t('auth:changePassword.success')}
            </SectionFooter>
          ) : null}
        </Section>

        {/* Chỉ bản dev: công cụ kiểm thử, bản phát hành không có. */}
        {__DEV__ ? (
          <Section title={t('account:devSection')}>
            <ListGroup variant="iconCard">
              <ListRow
                icon={Eye}
                label={t('account:replayWelcome')}
                chevron
                onPress={() => router.navigate('/welcome-preview')}
              />
            </ListGroup>
          </Section>
        ) : null}

        <Section>
          <ListGroup variant="card" inset={20}>
            <ListRow
              label={t('account:logout')}
              destructive
              centered
              busy={logout.pending}
              onPress={() => void logout.request()}
            />
            <ListRow
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
