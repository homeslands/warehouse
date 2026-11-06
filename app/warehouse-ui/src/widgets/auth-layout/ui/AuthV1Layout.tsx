import { Card, Flex, Layout, Typography } from 'antd'
import { WarehouseIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageToggle } from '@/features/language-switch'
import { ModeToggle } from '@/features/theme-toggle'

/**
 * Khung chung của UI-01/UI-02 (archetype `auth.svg`): thanh trên (tên app, ngôn ngữ, sáng/tối) +
 * một thẻ giữa màn. Màu nền/thẻ đi theo token antd (`AntdProvider`), nên sáng/tối tự đổi.
 */
export function AuthV1Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation(['common'])
  return (
    <Layout style={{ minHeight: '100svh' }}>
      <Flex
        component="header"
        align="center"
        justify="space-between"
        gap={16}
        style={{ padding: 16 }}
      >
        <Flex align="center" gap={8}>
          <WarehouseIcon size={20} aria-hidden="true" />
          <Typography.Text strong>{t('common:appName')}</Typography.Text>
        </Flex>
        <Flex gap={4}>
          <LanguageToggle />
          <ModeToggle />
        </Flex>
      </Flex>
      <Flex component="main" flex={1} align="center" justify="center" style={{ padding: 16 }}>
        {/* Mobile 320px: thẻ co theo màn, lề 16px; desktop giới hạn 420px. */}
        <Card style={{ width: '100%', maxWidth: 420 }}>{children}</Card>
      </Flex>
    </Layout>
  )
}
