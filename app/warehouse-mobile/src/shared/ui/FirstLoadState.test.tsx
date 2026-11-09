import { fireEvent, render, screen } from '@testing-library/react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'

import { FirstLoadState } from './FirstLoadState'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const props = {
  errorTitle: 'Không tải được',
  errorMessage: 'Mất mạng',
  loadingLabel: 'Đang tải',
  fetching: false,
  onRetry: jest.fn(),
}

describe('FirstLoadState', () => {
  it('failed → tiêu đề lỗi + nút Thử lại gọi onRetry', async () => {
    const onRetry = jest.fn()
    await render(<FirstLoadState {...props} failed onRetry={onRetry} />)
    expect(screen.getByText('Không tải được')).toBeOnTheScreen()
    expect(screen.getByText('Mất mạng')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('không failed → vòng quay có nhãn, không nút', async () => {
    await render(<FirstLoadState {...props} failed={false} />)
    expect(screen.getByLabelText('Đang tải')).toBeOnTheScreen()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
