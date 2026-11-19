import { render, screen } from '@testing-library/react-native'

import { makeLine } from '@/features/receive-checklist/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { ReceiveRow } from './ReceiveRow'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const line = makeLine(1, { base: null, supplierSlug: 's1', materialSupplierSlugs: [] })
const show = (over: Partial<React.ComponentProps<typeof ReceiveRow>> = {}) =>
  render(
    <ReceiveRow
      line={line}
      status="unchecked"
      locale="vi"
      mode="review"
      onToggle={jest.fn()}
      onOpen={jest.fn()}
      {...over}
    />,
  )

describe('ReceiveRow — viên "Mới với NCC"', () => {
  it('nhãn đọc gồm tên bên bán của dòng', async () => {
    await show({ newToSupplier: true, newToSupplierName: 'Minh Phát' })
    expect(screen.getByText('Mới với NCC')).toBeOnTheScreen()
    expect(screen.getByLabelText('Mới với Minh Phát')).toBeOnTheScreen()
  })

  it('không có tên → "Mới với bên bán"', async () => {
    await show({ newToSupplier: true })
    expect(screen.getByLabelText('Mới với bên bán')).toBeOnTheScreen()
  })

  it('không gắn → không có viên', async () => {
    await show()
    expect(screen.queryByText('Mới với NCC')).toBeNull()
  })
})
