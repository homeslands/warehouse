import { Appearance } from 'react-native'
import { create } from 'zustand'

import { kv } from '@/shared/storage/kv'

export const APPEARANCES = ['system', 'light', 'dark'] as const
export type AppearancePreference = (typeof APPEARANCES)[number]

const STORAGE_KEY = 'warehouse.appearance'

/** Lựa chọn giao diện của máy này (không theo tài khoản — giữ nguyên khi đăng xuất, như ngôn ngữ). */
export const useAppearance = create<{ preference: AppearancePreference }>(() => ({
  preference: 'system',
}))

function isAppearance(value: unknown): value is AppearancePreference {
  return (APPEARANCES as readonly unknown[]).includes(value)
}

/**
 * Ghi đè giao diện ở tầng NATIVE (iOS `overrideUserInterfaceStyle`, Android night mode) để thanh tab,
 * header, sheet, hộp thoại gốc cũng đổi theo; `'unspecified'` = bỏ ghi đè, theo hệ thống.
 */
function apply(preference: AppearancePreference): void {
  useAppearance.setState({ preference })
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference)
}

/** Gọi một lần lúc khởi động (trong lúc còn splash, tránh nháy màu). Giá trị hỏng → theo hệ thống. */
export async function initAppearance(): Promise<void> {
  const saved = await kv.get<string>(STORAGE_KEY)
  apply(isAppearance(saved) ? saved : 'system')
}

export async function setAppearance(preference: AppearancePreference): Promise<void> {
  apply(preference)
  await kv.set(STORAGE_KEY, preference)
}
