import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, ScrollView, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

import { markWelcomeSeen } from '@/features/onboarding'
import { useLaunch } from '@/shared/lib/launch'
import { useTheme } from '@/shared/theme/useTheme'
import { Button, Screen, Text } from '@/shared/ui'
import { Package, ScanBarcode, ShoppingCart, type LucideIcon } from '@/shared/ui/icons'

// Cùng ảnh với splash gốc và lớp phủ mở app (`bootstrap/LaunchOverlay.tsx`).
const LOGO_LIGHT = require('../../../assets/splash-icon.png')
const LOGO_DARK = require('../../../assets/splash-icon-dark.png')

/** Logo rộng 130pt; ảnh vuông có nhiều lề trong suốt (mực chữ ở y 369–654 / 1024px) → chỉ lộ dải chữ. */
const LOGO_W = 130
const LOGO_H = 44

const STAGGER_MS = 120
const REVEAL_MS = 450
const RISE = 14

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ScanBarcode, title: 'welcome.scanTitle', body: 'welcome.scanBody' },
  { icon: Package, title: 'welcome.stockTitle', body: 'welcome.stockBody' },
  { icon: ShoppingCart, title: 'welcome.reorderTitle', body: 'welcome.reorderBody' },
]

/**
 * Màn chào một lần (máy mới cài, trước đăng nhập) kiểu "Có gì mới" của Apple: logo Soko + tiêu đề căn
 * giữa, 3 dòng tính năng, nút "Bắt đầu" ghim đáy. Logo + tiêu đề có sẵn (lòng chữ "o" của lớp phủ mở
 * app mở ra là thấy); 3 dòng + nút hiện lần lượt SAU khi lớp phủ xong. Bấm "Bắt đầu" chỉ ghi cờ —
 * `SessionGate` tự chuyển sang `/login`.
 *
 * `onPreviewClose` (chỉ bản dev, route `/welcome-preview` từ tab Tài khoản): xem lại khi đã đăng nhập —
 * nội dung chạy lại hiệu ứng, "Bắt đầu" chỉ đóng màn, không đụng cờ đã xem.
 */
export function WelcomeScreen({ onPreviewClose }: { onPreviewClose?: () => void } = {}) {
  const replay = !!onPreviewClose
  const { t } = useTranslation('common')
  const { colors, scheme } = useTheme()

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          width: '100%',
          maxWidth: 520,
          alignSelf: 'center',
          paddingHorizontal: 28,
          paddingTop: 48,
          paddingBottom: 24,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <View
            testID="welcome-logo"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ width: LOGO_W, height: LOGO_H, overflow: 'hidden' }}
          >
            <Image
              source={scheme === 'dark' ? LOGO_DARK : LOGO_LIGHT}
              resizeMode="contain"
              fadeDuration={0}
              style={{ width: LOGO_W, height: LOGO_W, marginTop: (LOGO_H - LOGO_W) / 2 }}
            />
          </View>
          <Text
            weight="bold"
            size={28}
            accessibilityRole="header"
            style={{ textAlign: 'center', letterSpacing: -0.6, marginTop: 14 }}
          >
            {t('welcome.title')}
          </Text>
        </View>

        <View style={{ gap: 24, marginTop: 36 }}>
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} index={i} replay={replay}>
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
                <Icon
                  size={30}
                  color={colors.foreground}
                  strokeWidth={1.8}
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text weight="semibold" size={16}>
                    {t(title)}
                  </Text>
                  <Text size={15} style={{ color: colors.secondaryForeground, marginTop: 2 }}>
                    {t(body)}
                  </Text>
                </View>
              </View>
            </Reveal>
          ))}
        </View>
      </ScrollView>

      <Reveal index={FEATURES.length} replay={replay}>
        <View style={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 12 }}>
          <Button onPress={onPreviewClose ?? (() => void markWelcomeSeen())}>
            {t('welcome.start')}
          </Button>
        </View>
      </Reveal>
    </Screen>
  )
}

/**
 * Hiện mờ + trượt lên nhẹ, phần tử thứ `index` trễ `index × 120ms`, bắt đầu khi lớp phủ mở app xong.
 * Reduce Motion, hoặc lớp phủ đã xong từ trước khi màn gắn → hiện ngay, không chuyển động; `replay`
 * (xem lại bản dev) thì vẫn chạy hiệu ứng dù lớp phủ đã xong.
 */
function Reveal({
  index,
  replay = false,
  children,
}: {
  index: number
  replay?: boolean
  children: ReactNode
}) {
  const reduced = useReducedMotion()
  const launched = useLaunch((s) => s.done)
  const [instant] = useState(reduced || (launched && !replay))
  const progress = useSharedValue(instant ? 1 : 0)

  useEffect(() => {
    if (instant || !launched) return
    if (reduced) {
      progress.value = 1
      return
    }
    progress.value = withDelay(
      index * STAGGER_MS,
      withTiming(1, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) }),
    )
  }, [instant, launched, reduced, index, progress])

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * RISE }],
  }))

  return <Animated.View style={style}>{children}</Animated.View>
}
