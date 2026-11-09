import { render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { numericStyle } from '../../theme/fonts'
import { lightColors } from '../../theme/tokens'
import { ReviewInfoGroup, ReviewInfoRow, ReviewNotes, ReviewTotal } from './ReviewParts'

describe('ReviewInfoRow', () => {
  it('nhãn trái, giá trị phải; ghi chú tối đa 2 dòng', async () => {
    await render(<ReviewInfoRow label="Ghi chú" value="dài" lines={2} first />)
    expect(screen.getByText('Ghi chú')).toBeOnTheScreen()
    expect(screen.getByText('dài').props.numberOfLines).toBe(2)
  })
})

describe('ReviewNotes', () => {
  it('"Lưu ý" = chữ cam 13 ở chân nhóm (không thẻ) chỉ khi có cảnh báo; câu ghi chú luôn có', async () => {
    const { rerender } = await render(
      <ReviewNotes
        title="Lưu ý"
        warnings={['1 dòng có đơn giá 0 đ', '2 dòng vượt tồn hiện có: A, B']}
        footnote="Ghi chú"
        warningsTestID="w"
        footnoteTestID="f"
      />,
    )
    const footer = screen.getByTestId('w')
    expect(StyleSheet.flatten(footer.props.style)).not.toHaveProperty('borderWidth')
    expect(StyleSheet.flatten(footer.props.style)).not.toHaveProperty('backgroundColor')
    expect(screen.queryByText('Lưu ý')).toBeNull()
    expect(footer.props.accessibilityLabel).toBe(
      'Lưu ý: 1 dòng có đơn giá 0 đ. 2 dòng vượt tồn hiện có: A, B',
    )
    expect(screen.getByText('1 dòng có đơn giá 0 đ')).toHaveStyle({
      color: lightColors.warningText,
      fontSize: 13,
    })
    expect(screen.getByTestId('f')).toHaveTextContent('Ghi chú')
    await rerender(
      <ReviewNotes
        title="Lưu ý"
        warnings={[]}
        footnote="Ghi chú"
        warningsTestID="w"
        footnoteTestID="f"
      />,
    )
    expect(screen.queryByTestId('w')).toBeNull()
  })
})

describe('ReviewTotal', () => {
  it('nhãn + tổng', async () => {
    await render(<ReviewTotal testID="t" label="Tổng cộng" total={20000} locale="vi" />)
    expect(screen.getByTestId('t')).toHaveTextContent(/^Tổng cộng20\.000\s?đ$/)
  })
})

describe('ReviewInfoGroup', () => {
  it('vẽ đủ dòng theo thứ tự, testID theo key, dòng numeric dùng font số', async () => {
    await render(
      <ReviewInfoGroup
        testID="grp"
        rows={[
          { key: 'a', label: 'Mã', value: 'PN-1', format: 'code' },
          { key: 'b', label: 'Ngày', value: '08/11/2026', format: 'numeric' },
          { key: 'c', label: 'Ghi chú', value: 'xin chào', lines: 2 },
        ]}
      />,
    )
    expect(screen.getByTestId('grp')).toBeOnTheScreen()
    expect(screen.getByTestId('grp-a')).toBeOnTheScreen()
    expect(screen.getByTestId('grp-b')).toBeOnTheScreen()
    expect(screen.getByTestId('grp-c')).toBeOnTheScreen()
    expect(screen.getByText('xin chào').props.numberOfLines).toBe(2)
    const numeric = StyleSheet.flatten(screen.getByText('08/11/2026').props.style)
    const plain = StyleSheet.flatten(screen.getByText('xin chào').props.style)
    expect(numeric).toMatchObject(numericStyle('medium'))
    expect(plain).not.toMatchObject(numericStyle('medium'))
  })
})
