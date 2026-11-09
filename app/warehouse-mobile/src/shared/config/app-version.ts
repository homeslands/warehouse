import Constants from 'expo-constants'
import { Platform } from 'react-native'

/** "1.0.0 (12)"; thiếu số build thì chỉ phiên bản; thiếu cả hai thì "—". */
export function appVersion(): string {
  const cfg = Constants.expoConfig
  const version = cfg?.version
  if (!version) return '—'
  const build =
    Platform.OS === 'ios'
      ? cfg?.ios?.buildNumber
      : Platform.OS === 'android'
        ? cfg?.android?.versionCode
        : undefined
  return build ? `${version} (${build})` : version
}
