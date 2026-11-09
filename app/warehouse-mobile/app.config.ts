import type { ConfigContext, ExpoConfig } from 'expo/config'

type Variant = 'development' | 'preview' | 'production'

const BASE_ID = 'com.homeslands.warehouse'

const VARIANTS: Record<Variant, { name: string; id: string }> = {
  development: { name: 'Kho (Dev)', id: `${BASE_ID}.dev` },
  preview: { name: 'Kho (Preview)', id: `${BASE_ID}.preview` },
  production: { name: 'Kho', id: BASE_ID },
}

function resolveVariant(): Variant {
  const v = process.env.APP_VARIANT
  return v === 'preview' || v === 'production' ? v : 'development'
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant()
  const { name, id } = VARIANTS[variant]
  return {
    ...config,
    name,
    slug: 'warehouse-mobile',
    version: '1.0.0',
    scheme: 'warehouse',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    ios: { supportsTablet: false, bundleIdentifier: id },
    android: {
      package: id,
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: { favicon: './assets/favicon.png' },
    plugins: [
      'expo-router',
      'expo-status-bar',
      ['expo-localization', { supportedLocales: ['vi', 'en'] }],
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          // Nền tối khớp token `background` của theme tối.
          dark: { image: './assets/splash-icon.png', backgroundColor: '#0a0a0a' },
        },
      ],
      // Không dùng sinh trắc học: tắt quyền Face ID mà plugin thêm mặc định.
      ['expo-secure-store', { faceIDPermission: false }],
      // Quét mã vạch / QR để mở vật tư, chụp chứng từ. Không quay video: tắt quyền micro (iOS) và
      // RECORD_AUDIO.
      [
        'expo-camera',
        {
          cameraPermission: 'Cho phép dùng camera để quét mã vạch và chụp chứng từ.',
          microphonePermission: false,
          recordAudioAndroid: false,
        },
      ],
      // Chụp / chọn ảnh chứng từ đính kèm phiếu. Chỉ ảnh, không video: tắt micro.
      [
        'expo-image-picker',
        {
          photosPermission: 'Cho phép chọn ảnh chứng từ từ thư viện.',
          cameraPermission: 'Cho phép dùng camera để quét mã vạch và chụp chứng từ.',
          microphonePermission: false,
        },
      ],
    ],
    extra: {
      ...config.extra,
      EXPO_PUBLIC_APP_VARIANT: variant,
      // Dự án EAS (build trên máy chủ Expo) — tạo 2026-11-08 dưới tài khoản cá nhân, chuyển sang tài
      // khoản công ty khi có.
      eas: { projectId: '6276dbff-4d87-4db5-8006-8013f6759645' },
    },
  }
}
