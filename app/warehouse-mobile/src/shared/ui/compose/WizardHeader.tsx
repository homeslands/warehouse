import { Stack, type NativeStackHeaderItem } from 'expo-router'
import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, useWindowDimensions, View } from 'react-native'

import { chooseAction } from '../../lib/native-confirm'
import { useTheme } from '../../theme/useTheme'
import { AndroidCloseButton } from '../AndroidCloseButton'
import { AndroidFormHeaderRight } from '../FormHeaderItems'
import { Text } from '../Text'

/** Một mục của menu `⋯` (chữ đã dịch). `disabled` → iOS vẽ mờ; Android không có mục khoá nên bỏ đi. */
export type WizardMenuItem = {
  id: string
  label: string
  destructive?: boolean
  disabled?: boolean
  onPress: () => void
}

export type WizardHeaderProps = {
  title: string
  /** Dòng nhỏ dưới tiêu đề, đã dịch — vd "Bước 2/3 · Vật tư" (`common:compose.wizard.subtitle`). */
  subtitle: string
  /** Trái: `'close'` = ✕ (bước 1 — thoát luồng, `onClose`); `'back'` = nút back gốc (lùi một bước). */
  left: 'close' | 'back'
  onClose?: () => void
  /**
   * Đang ghi lên server: KHOÁ MỌI LỐI LÙI của người dùng — vuốt cạnh iOS (`gestureEnabled: false`), nút
   * back gốc ‹ (`headerBackVisible: false`), ✕ (bỏ khỏi header) và back phần cứng Android (listener
   * `hardwareBackPress` trả `true`); nút quét khoá (iOS) / ẩn (Android). Lý do: điều hướng + thông báo
   * sau ghi chỉ chạy khi màn bắt đầu ghi còn gắn. Điều hướng của chính luồng (`finish`, `goToStep`) vẫn chạy.
   */
  writing?: boolean
  /** Nút quét (`barcode.viewfinder`) bên phải — chỉ bước 2. `hidden` → không có nút. */
  scan?: { onPress: () => void; label: string; hidden?: boolean }
  /** Menu `⋯`: `label` = nhãn nút; `items` rỗng → không có `⋯`. */
  menu: { label: string; items: readonly WizardMenuItem[] }
  /**
   * Cách mở `⋯` trên iOS (Android luôn `chooseAction`): `'menu'` (mặc định) = UIMenu GỐC thả xuống;
   * `'sheet'` = nút thường mở action sheet `chooseAction` (modal — nuốt cú chạm đóng). Bước có nút ghi
   * KHÔNG hỏi lại ở thanh đáy (bước 3) dùng `'sheet'`: chạm ra ngoài để đóng UIMenu có thể lọt xuống nút đó.
   */
  menuStyle?: 'menu' | 'sheet'
}

/** Tiêu đề hai dòng giữa header: tiêu đề 17 đậm vừa + phụ đề 12.5 mờ, mỗi dòng một dòng cắt đuôi. */
function WizardTitle({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors } = useTheme()
  const { width } = useWindowDimensions()
  const ios = Platform.OS === 'ios'
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${title}, ${subtitle}`}
      // Chừa chỗ cho nút trái + [quét, ⋯] bên phải (iOS căn giữa nên trừ hai bên như nhau).
      style={{ alignItems: ios ? 'center' : 'flex-start', maxWidth: width - (ios ? 200 : 150) }}
    >
      <Text weight="semibold" size={17} numberOfLines={1}>
        {title}
      </Text>
      <Text size={12.5} numberOfLines={1} style={{ color: colors.mutedForeground }}>
        {subtitle}
      </Text>
    </View>
  )
}

/**
 * Header dùng chung cho các bước của form 3 bước (phiếu xuất, phiếu nhập; spec wizard-apple §3). CHỈ khai
 * `<Stack.Screen options>`, không vẽ nội dung (vạch tiến độ là `WizardProgress`, đặt trong vùng cuộn).
 * Giữa: tiêu đề hai dòng (`headerTitle` tuỳ biến — native-stack SDK 58 không có phụ đề gốc; `title` vẫn đặt
 * cho nhãn back / test). Trái: ✕ (`left: 'close'` — iOS mục gốc SF Symbol `xmark`, Android
 * `AndroidCloseButton`; ẩn nút back gốc) hoặc nút back gốc (`'back'`). Phải — iOS: [quét `type: 'button'`
 * `barcode.viewfinder`?, `⋯` SF `ellipsis`] (mục cuối = ngoài cùng bên phải): `menuStyle: 'menu'` → `type: 'menu'`
 * (UIMenu GỐC thả xuống, mục `destructive` / `disabled`); `'sheet'` → `type: 'button'` mở `chooseAction` các mục
 * bấm được (action sheet — mục khoá bỏ đi; không có mục bấm được → không có `⋯`). Android (không có menu gốc):
 * [nút quét?, nút `⋯` → `chooseAction` các mục bấm được (≤ 3 — Alert)], không có mục bấm được → không có `⋯`.
 */
export function WizardHeader({
  title,
  subtitle,
  left,
  onClose,
  writing = false,
  scan,
  menu,
  menuStyle = 'menu',
}: WizardHeaderProps) {
  const { t } = useTranslation('common')

  // Back phần cứng Android (no-op trên iOS): nuốt trong lúc ghi; gỡ khi ghi xong / màn tháo ra.
  useEffect(() => {
    if (!writing) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => sub.remove()
  }, [writing])

  const menuLabel = menu.label
  const menuItems = menu.items
  const scanShown = scan && !scan.hidden ? scan : undefined
  const scanLabel = scanShown?.label
  const scanPress = scanShown?.onPress

  /** Android (và iOS `menuStyle: 'sheet'`): `⋯` mở hộp chọn gốc với các mục bấm được. */
  const openMenuSheet = useCallback(async () => {
    const enabled = menuItems.filter((i) => !i.disabled)
    const picked = await chooseAction({
      actions: enabled.map((i) => ({ label: i.label, destructive: i.destructive })),
      cancelLabel: t('cancel'),
    })
    if (picked !== null) enabled[picked]?.onPress()
  }, [menuItems, t])

  const options = useMemo(() => {
    const closeLabel = t('close')
    const close = left === 'close' && !writing ? onClose : undefined
    const headerTitle = () => <WizardTitle title={title} subtitle={subtitle} />
    const common = {
      title,
      headerTitle,
      gestureEnabled: !writing,
      // Bước 1 (✕ thay cho back) hoặc đang ghi: không có nút back gốc.
      ...(left === 'close' || writing ? { headerBackVisible: false } : null),
    }
    if (Platform.OS === 'ios') {
      const right: NativeStackHeaderItem[] = []
      if (scanLabel !== undefined && scanPress) {
        right.push({
          type: 'button',
          label: scanLabel,
          accessibilityLabel: scanLabel,
          icon: { type: 'sfSymbol', name: 'barcode.viewfinder' },
          disabled: writing,
          onPress: scanPress,
        })
      }
      if (menuStyle === 'sheet') {
        if (menuItems.some((i) => !i.disabled)) {
          right.push({
            type: 'button',
            label: menuLabel,
            accessibilityLabel: menuLabel,
            icon: { type: 'sfSymbol', name: 'ellipsis' },
            onPress: () => void openMenuSheet(),
          })
        }
      } else if (menuItems.length > 0) {
        right.push({
          type: 'menu',
          label: menuLabel,
          accessibilityLabel: menuLabel,
          icon: { type: 'sfSymbol', name: 'ellipsis' },
          menu: {
            items: menuItems.map((i) => ({
              type: 'action' as const,
              label: i.label,
              destructive: i.destructive,
              disabled: i.disabled,
              onPress: i.onPress,
            })),
          },
        })
      }
      return {
        ...common,
        unstable_headerLeftItems: close
          ? () => [
              {
                type: 'button' as const,
                label: closeLabel,
                accessibilityLabel: closeLabel,
                icon: { type: 'sfSymbol' as const, name: 'xmark' as const },
                onPress: close,
              },
            ]
          : undefined,
        unstable_headerRightItems: () => right,
      }
    }
    const androidScan =
      scanLabel !== undefined && scanPress && !writing
        ? { label: scanLabel, onPress: scanPress }
        : undefined
    const androidMore = menuItems.some((i) => !i.disabled)
      ? { label: menuLabel, onPress: () => void openMenuSheet() }
      : undefined
    return {
      ...common,
      headerLeft: close
        ? () => <AndroidCloseButton label={closeLabel} onPress={close} />
        : undefined,
      headerRight: () => <AndroidFormHeaderRight scan={androidScan} more={androidMore} />,
    }
  }, [
    t,
    title,
    subtitle,
    left,
    onClose,
    writing,
    scanLabel,
    scanPress,
    menuItems,
    menuLabel,
    menuStyle,
    openMenuSheet,
  ])

  return <Stack.Screen options={options} />
}
