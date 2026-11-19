import { render, screen } from '@testing-library/react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'

import { AttentionCard } from './AttentionCard'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const label = () => screen.getByTestId('attention-expiry-main').props.accessibilityLabel as string
const show = (expired: { count?: number; failed: boolean }, soon: typeof expired) =>
  render(
    <AttentionCard
      expired={expired}
      soon={soon}
      today={new Date(2026, 10, 12)}
      onOpen={jest.fn()}
    />,
  )

describe('AttentionCard — a11y', () => {
  it('đang tải số sắp hết hạn: đọc "đang tải", không đọc "tải lỗi"', async () => {
    await show({ count: 2, failed: false }, { count: undefined, failed: false })
    expect(label()).toBe('Hạn dùng: 2 quá hạn, đang tải số sắp hết hạn')
  })

  it('số sắp hết hạn lỗi: đọc "không tải được"', async () => {
    await show({ count: 2, failed: false }, { count: undefined, failed: true })
    expect(label()).toBe('Hạn dùng: 2 quá hạn, số sắp hết hạn không tải được')
  })

  it('số quá hạn lỗi: "!" cỡ lớn, nhãn riêng', async () => {
    await show({ count: undefined, failed: true }, { count: undefined, failed: true })
    expect(screen.getByTestId('attention-expired-error')).toHaveTextContent('!')
    expect(label()).toBe('Hạn dùng: số lô quá hạn không tải được')
  })

  it('không quá hạn + sắp hết hạn lỗi: "!" thay vì "0"', async () => {
    await show({ count: 0, failed: false }, { count: undefined, failed: true })
    expect(screen.getByTestId('attention-soon-error')).toHaveTextContent('!')
  })
})

describe('AttentionCard — số ít / số nhiều (en)', () => {
  afterEach(() => changeLanguage('vi'))

  it('1 lô: dạng số ít; nhiều lô: dạng số nhiều', async () => {
    await changeLanguage('en')
    const view = await show({ count: 1, failed: false }, { count: 1, failed: false })
    expect(screen.getByTestId('attention-expiry-expired')).toHaveTextContent('1 batch expired')
    expect(screen.getByText('and 1 batch expiring within 60 days')).toBeOnTheScreen()
    await view.unmount()
    await show({ count: 2, failed: false }, { count: 3, failed: false })
    expect(screen.getByTestId('attention-expiry-soon')).toHaveTextContent('3 batches expiring soon')
  })
})
