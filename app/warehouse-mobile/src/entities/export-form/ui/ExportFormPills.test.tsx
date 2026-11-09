import { render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'
import { lightColors } from '@/shared/theme/tokens'

import { ExportFormStatusPill } from './ExportFormStatusPill'
import { ExportFormTypePill } from './ExportFormTypePill'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

describe('ExportFormStatusPill', () => {
  it.each([
    ['DRAFT', 'Nháp'],
    ['PENDING', 'Chờ duyệt'],
    ['CONFIRMED', 'Đã xuất'],
    ['CANCELLED', 'Đã huỷ'],
  ] as const)('%s → %s', async (status, label) => {
    await render(<ExportFormStatusPill status={status} />)
    expect(screen.getByText(label)).toBeTruthy()
  })

  // Nền thẻ đặc + viền 1pt (cùng kiểu viên chọn thời gian) để không chìm vào nền nhóm; nghĩa trạng
  // thái nằm ở chấm màu + chữ màu.
  it.each([
    ['DRAFT', 'Nháp', lightColors.warningText],
    ['PENDING', 'Chờ duyệt', lightColors.accentText],
    ['CONFIRMED', 'Đã xuất', lightColors.successText],
    ['CANCELLED', 'Đã huỷ', lightColors.mutedForeground],
  ] as const)(
    '%s (%s): nền card + viền border, chấm + chữ cùng màu trạng thái',
    async (status, label, color) => {
      await render(<ExportFormStatusPill status={status} />)
      expect(screen.getByTestId('export-form-status')).toHaveStyle({
        backgroundColor: lightColors.card,
        borderWidth: 1,
        borderColor: lightColors.border,
      })
      expect(screen.getByTestId('export-form-status-dot')).toHaveStyle({ backgroundColor: color })
      expect(StyleSheet.flatten(screen.getByText(label).props.style)).toMatchObject({ color })
    },
  )

  it('label thay chữ, giữ màu theo trạng thái (phiếu mới: "Chưa lưu" màu Nháp)', async () => {
    await render(<ExportFormStatusPill status="DRAFT" label="Chưa lưu" />)
    expect(screen.getByText('Chưa lưu')).toBeTruthy()
    expect(screen.queryByText('Nháp')).toBeNull()
  })
})

describe('ExportFormTypePill', () => {
  it.each([
    ['PRODUCTION', 'Sản xuất'],
    ['SALE', 'Bán'],
    ['TRANSFER', 'Chuyển kho'],
    ['DISPOSAL', 'Huỷ'],
    ['OTHER', 'Khác'],
  ] as const)('%s → %s', async (type, label) => {
    await render(<ExportFormTypePill type={type} />)
    expect(screen.getByText(label)).toBeTruthy()
  })

  it('nền card + viền border, chữ foreground', async () => {
    await render(<ExportFormTypePill type="SALE" />)
    expect(screen.getByTestId('export-form-type')).toHaveStyle({
      backgroundColor: lightColors.card,
      borderWidth: 1,
      borderColor: lightColors.border,
    })
    expect(StyleSheet.flatten(screen.getByText('Bán').props.style)).toMatchObject({
      color: lightColors.foreground,
    })
  })
})
