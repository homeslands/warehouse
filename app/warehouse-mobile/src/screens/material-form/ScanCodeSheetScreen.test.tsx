import { cleanup, fireEvent, render, screen } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'

import { useMaterialDraft } from '@/features/material-form'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { SafeAreaWrapper } from '@/shared/ui/testing/safe-area'

import { ScanCodeSheetScreen } from './ScanCodeSheetScreen'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), canGoBack: () => true }),
  Stack: { Screen: () => null },
}))
const camera = jest.requireMock('expo-camera').__permission as { reset: () => void }

const scan = (data: string) =>
  fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data, type: 'ean13' })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(() => {
  jest.clearAllMocks()
  camera.reset()
  useMaterialDraft.getState().reset()
})
afterEach(() => cleanup())

describe('ScanCodeSheetScreen', () => {
  it('có gợi ý quét; ✕ quay lại', async () => {
    await render(<ScanCodeSheetScreen />, { wrapper: SafeAreaWrapper })
    expect(screen.getByText('Đưa mã vạch hoặc mã QR vào khung')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }))
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('quét mã → scannedCode (đã trim) + rung success + back đúng 1 lần', async () => {
    await render(<ScanCodeSheetScreen />, { wrapper: SafeAreaWrapper })
    await scan(' 8934563138161 ')
    await scan('999999')
    expect(useMaterialDraft.getState().scannedCode).toBe('8934563138161')
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success')
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('✕ khoá camera: quét sau đó không ghi mã, back đúng 1 lần', async () => {
    await render(<ScanCodeSheetScreen />, { wrapper: SafeAreaWrapper })
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }))
    await scan('123456')
    expect(useMaterialDraft.getState().scannedCode).toBeNull()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })
})
