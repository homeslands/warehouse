import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'
import type { ReactNode } from 'react'
import { Platform, View } from 'react-native'

import { WarehouseHeaderButton } from './WarehouseHeaderButton'

/**
 * Nút kho của mọi tab ở góc PHẢI thanh (ngoài cùng); bên trái để trống (tiêu đề lớn nằm dưới).
 * - iOS: mục `custom` CUỐI của `unstable_headerRightItems` → hệ thống tự vẽ viên kính.
 * - Android: `headerRight` là một hàng [nút của màn…, nút kho].
 * Màn có nút riêng bên phải (Tồn kho: Quét, Lọc) PHẢI khai qua hàm này để thứ tự luôn là
 * [mục của màn…, kho]; đừng tự đặt `unstable_headerRightItems` / `headerRight` trên màn đầu tab.
 * `TabStackLayout` gọi `tabHeaderRight()` làm mặc định cho màn không có nút riêng.
 */
export function tabHeaderRight(
  screen: { ios?: NativeStackHeaderItem[]; android?: ReactNode } = {},
): Pick<NativeStackNavigationOptions, 'unstable_headerRightItems' | 'headerRight'> {
  if (Platform.OS === 'ios') {
    return {
      unstable_headerRightItems: () => [
        ...(screen.ios ?? []),
        // Có mục của màn: chừa khoảng 8 để nút kho là viên kính RIÊNG, không dính Quét/Lọc.
        // `index`: expo-router trả mục spacing nguyên trạng (không gắn `index` như button/menu) nên
        // native chèn nó ở vị trí 0 (ngoài cùng bên phải). Mảng bị đảo cho UIKit: kho = 0, spacing = 1.
        ...(screen.ios?.length ? [{ type: 'spacing' as const, spacing: 8, index: 1 }] : []),
        { type: 'custom' as const, element: <WarehouseHeaderButton /> },
      ],
    }
  }
  return {
    headerRight: () => (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {screen.android}
        <WarehouseHeaderButton />
      </View>
    ),
  }
}
