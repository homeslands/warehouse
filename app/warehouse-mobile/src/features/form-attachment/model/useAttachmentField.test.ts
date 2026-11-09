import { act, renderHook } from '@testing-library/react-native'
import * as DocumentPicker from 'expo-document-picker'
import { Linking, Platform } from 'react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'
import { chooseAction } from '@/shared/lib/native-confirm'

import { useAttachmentField } from './useAttachmentField'

jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('@/shared/lib/native-confirm', () => ({
  chooseAction: jest.fn(),
  confirmAction: jest.fn(),
}))

const URL_PDF = 'https://s3.example.com/files/hoa-don-1700000000000.pdf'

function setup(value: string | null) {
  return renderHook(() =>
    useAttachmentField({
      kind: 'import',
      warehouseSlug: 'wh-a',
      value,
      onChange: jest.fn(),
      getFormKey: () => 'k',
      disabled: false,
    }),
  )
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('useAttachmentField', () => {
  beforeAll(async () => {
    await initI18n()
    await changeLanguage('vi')
  })
  const original = Platform.OS
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true })
    jest.restoreAllMocks()
  })

  it('openURL bị từ chối: không rejection chưa bắt, hiện câu "Không mở được chứng từ."', async () => {
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'))
    // iOS: [camera, library, document, view, remove] → "view" ở chỉ số 3.
    jest.mocked(chooseAction).mockResolvedValueOnce(3)
    const { result } = await setup(URL_PDF)
    await act(async () => {
      result.current.open()
    })
    await flush()
    await flush()
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(result.current.error).toBe('Không mở được chứng từ.')
  })

  it('Android: bộ chọn tệp có thêm application/octet-stream; iOS thì không', async () => {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: true,
      assets: null,
    })
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    jest.mocked(chooseAction).mockResolvedValueOnce(2)
    let hook = await setup(null)
    await act(async () => {
      hook.result.current.open()
    })
    await flush()
    expect(jest.mocked(DocumentPicker.getDocumentAsync).mock.calls.at(-1)![0]!.type).toContain(
      'application/octet-stream',
    )

    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    jest.mocked(chooseAction).mockResolvedValueOnce(2)
    hook = await setup(null)
    await act(async () => {
      hook.result.current.open()
    })
    await flush()
    expect(jest.mocked(DocumentPicker.getDocumentAsync).mock.calls.at(-1)![0]!.type).not.toContain(
      'application/octet-stream',
    )
  })
})
