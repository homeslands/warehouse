import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'

import { lightColors } from '../../theme/tokens'
import { Package } from '../icons'
import { LIST_GUTTER, ListSectionTitle, PlainListRow, RowLine, RowStatus } from './PlainListRow'

const tile = { icon: Package, testID: 'row-tile' }

describe('PlainListRow', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('dòng đầu nhóm: không đường kẻ; nền phẳng `background`, tràn ngang bù lề danh sách', async () => {
    await render(
      <PlainListRow testID="row" first onPress={jest.fn()}>
        <RowLine end={<Text>1 đ</Text>}>
          <Text>PN-1</Text>
        </RowLine>
      </PlainListRow>,
    )
    expect(screen.queryByTestId('row-separator')).toBeNull()
    const style = StyleSheet.flatten(screen.getByTestId('row').props.style)
    expect(style).toMatchObject({ backgroundColor: lightColors.background, paddingHorizontal: 16 })
    expect(StyleSheet.flatten(screen.getByTestId('row').parent!.props.style)).toMatchObject({
      marginHorizontal: -LIST_GUTTER,
    })
  })

  it('dòng sau: đường kẻ hairline thụt tới chữ (16 không ô icon; 16 + 44 + 14 có ô icon)', async () => {
    await render(
      <PlainListRow first={false}>
        <RowLine>
          <Text>x</Text>
        </RowLine>
      </PlainListRow>,
    )
    expect(screen.getByTestId('row-separator')).toHaveStyle({
      marginLeft: 16,
      height: StyleSheet.hairlineWidth,
      // Đậm hơn `separator` (#e4e4e7 gần như vô hình trên nền trắng) — gần opaqueSeparator của iOS.
      backgroundColor: lightColors.listSeparator,
    })
  })

  it('có ô icon: ô 44 bo 12 TRUNG TÍNH (nền fill, nơi gọi không đổi màu được); đường kẻ thụt 74', async () => {
    await render(
      <PlainListRow first={false} tile={tile}>
        <RowLine>
          <Text>x</Text>
        </RowLine>
      </PlainListRow>,
    )
    expect(screen.getByTestId('row-tile')).toHaveStyle({
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: lightColors.fill,
    })
    expect(screen.getByTestId('row-separator')).toHaveStyle({ marginLeft: 74 })
  })

  it('giữ yên một nhịp mới tô rowPressed; chạm nhanh gọi onPress', async () => {
    const onPress = jest.fn()
    await render(
      <PlainListRow testID="row" first onPress={onPress}>
        <RowLine>
          <Text>x</Text>
        </RowLine>
      </PlainListRow>,
    )
    const bg = () => StyleSheet.flatten(screen.getByTestId('row').props.style).backgroundColor
    await fireEvent(screen.getByTestId('row'), 'responderGrant', {
      nativeEvent: { touches: [] },
      persist: jest.fn(),
    })
    expect(bg()).not.toBe(lightColors.rowPressed)
    await act(async () => {
      jest.advanceTimersByTime(130)
    })
    expect(bg()).toBe(lightColors.rowPressed)
  })

  it('chạm nhanh gọi onPress', async () => {
    const onPress = jest.fn()
    await render(
      <PlainListRow testID="row" first onPress={onPress}>
        <RowLine>
          <Text>x</Text>
        </RowLine>
      </PlainListRow>,
    )
    fireEvent.press(screen.getByTestId('row'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('ListSectionTitle', () => {
  it('tiêu đề 20 đậm (header) + dòng phụ 13 xám bên dưới; không kẻ', async () => {
    await render(<ListSectionTitle title="Tháng 11/2026" subtitle="6 phiếu" />)
    expect(screen.getByRole('header')).toHaveTextContent('Tháng 11/2026')
    expect(screen.getByText('Tháng 11/2026')).toHaveStyle({ fontSize: 20, fontWeight: '700' })
    expect(screen.getByText('6 phiếu')).toHaveStyle({
      fontSize: 13,
      color: lightColors.mutedForeground,
    })
    expect(screen.queryByTestId('section-rule-top')).toBeNull()
  })
})

describe('RowStatus', () => {
  it('chỉ chữ: 13 medium nghiêng, màu do nơi gọi truyền, không nền', async () => {
    await render(<RowStatus testID="st" label="Nháp" color={lightColors.statusWarning} />)
    expect(screen.getByTestId('st')).toHaveTextContent('Nháp')
    expect(screen.getByTestId('st')).toHaveStyle({
      fontSize: 13,
      fontWeight: '500',
      fontStyle: 'italic',
      color: lightColors.statusWarning,
    })
  })
})
