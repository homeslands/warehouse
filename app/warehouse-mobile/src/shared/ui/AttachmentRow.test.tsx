import { fireEvent, render, screen } from '@testing-library/react-native'
import { Alert, Linking } from 'react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'

import { AttachmentRow } from './AttachmentRow'

const IMG = 'https://s3.example.com/files/hoa-don-1700000000000.jpg'
const PDF = 'https://s3.example.com/files/hoa-don-1700000000000.pdf'

describe('AttachmentRow', () => {
  beforeAll(async () => {
    await initI18n()
    await changeLanguage('vi')
  })
  let open: jest.SpyInstance
  beforeEach(() => {
    open = jest.spyOn(Linking, 'openURL').mockResolvedValue()
  })
  afterEach(() => open.mockRestore())

  it('URL ảnh: có Image, hiện tên, bấm mở URL', async () => {
    await render(<AttachmentRow value={IMG} label="Chứng từ" testID="att" />)
    expect(screen.getByTestId('att-image', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('hoa-don.jpg')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Chứng từ, hoa-don.jpg' }))
    expect(open).toHaveBeenCalledWith(IMG)
  })

  it('URL PDF: không có Image, có tên, bấm mở URL', async () => {
    await render(<AttachmentRow value={PDF} label="Chứng từ" testID="att" />)
    expect(screen.queryByTestId('att-image', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByText('hoa-don.pdf')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button'))
    expect(open).toHaveBeenCalledWith(PDF)
  })

  it('key cũ (không phải URL): hiện tên, không phải nút, bấm không mở', async () => {
    await render(
      <AttachmentRow value="folder/hoa-don-1700000000000.png" label="Chứng từ" testID="att" />,
    )
    expect(screen.getByText('hoa-don.png')).toBeOnTheScreen()
    expect(screen.queryByTestId('att-image', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    await fireEvent.press(screen.getByTestId('att'))
    expect(open).not.toHaveBeenCalled()
  })

  it('Image onError: về icon tệp', async () => {
    await render(<AttachmentRow value={IMG} label="Chứng từ" testID="att" />)
    await fireEvent(screen.getByTestId('att-image', { includeHiddenElements: true }), 'error')
    expect(screen.queryByTestId('att-image', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByText('hoa-don.jpg')).toBeOnTheScreen()
  })

  it('openURL bị từ chối: không rejection chưa bắt, hiện câu báo', async () => {
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    open.mockRejectedValue(new Error('no browser'))
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await render(<AttachmentRow value={PDF} label="Chứng từ" testID="att" />)
    await fireEvent.press(screen.getByRole('button'))
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(alert).toHaveBeenCalledWith('Không mở được chứng từ.')
    alert.mockRestore()
  })
})
