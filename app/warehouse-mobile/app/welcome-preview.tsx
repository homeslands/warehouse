import { useRouter } from 'expo-router'

import { WelcomeScreen } from '@/screens/welcome'

/** Chỉ bản dev (`SessionGate` gác bằng `__DEV__`): xem lại màn chào từ tab Tài khoản. */
export default function WelcomePreviewRoute() {
  const router = useRouter()
  return <WelcomeScreen onPreviewClose={() => router.back()} />
}
