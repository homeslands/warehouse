import { render, screen } from '@testing-library/react-native'

import { ReviewInfoCard } from './ReviewInfoCard'
import type { ReviewInfoRowData } from './ReviewParts'

const rows: ReviewInfoRowData[] = [
  { key: 'code', label: 'Mã phiếu', value: 'PN-0001', format: 'code' },
  { key: 'date', label: 'Ngày', value: '08/11/2026', format: 'numeric' },
  { key: 'by', label: 'Người lập', value: 'Nguyễn Văn A' },
]

describe('ReviewInfoCard', () => {
  it('mỗi dòng có testID info-key, nhãn + giá trị', async () => {
    await render(<ReviewInfoCard testID="info" rows={rows} />)
    expect(screen.getByTestId('info')).toBeOnTheScreen()
    expect(screen.getByTestId('info-code')).toBeOnTheScreen()
    expect(screen.getByText('Mã phiếu')).toBeOnTheScreen()
    expect(screen.getByText('Nguyễn Văn A')).toBeOnTheScreen()
  })

  it('format quyết định font: code → đơn cách, numeric → tabular-nums, còn lại → không numeric', async () => {
    await render(<ReviewInfoCard testID="info" rows={rows} />)
    expect(screen.getByText('PN-0001')).toHaveStyle({ fontFamily: expect.stringMatching(/mono/i) })
    expect(screen.getByText('08/11/2026')).toHaveStyle({ fontVariant: ['tabular-nums'] })
    const flat = [screen.getByText('Nguyễn Văn A').props.style].flat(Infinity)
    expect(flat.some((st: { fontVariant?: string[] } | null) => st?.fontVariant?.length)).toBe(
      false,
    )
  })
})
