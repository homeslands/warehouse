import { render, screen, within } from '@testing-library/react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'
import { lightColors } from '@/shared/theme/tokens'

import { LevelGauge, type LevelGaugeProps } from './LevelGauge'

async function show(props: Partial<LevelGaugeProps>) {
  await render(<LevelGauge quantity={168} min={200} max={800} unit="bao" locale="vi" {...props} />)
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

describe('LevelGauge — câu tình trạng', () => {
  it('dưới min: "Thiếu 32 bao so với tối thiểu" (màu cảnh báo)', async () => {
    await show({})
    expect(screen.getByText('Thiếu 32 bao so với tối thiểu')).toHaveStyle({
      color: lightColors.warningText,
    })
  })

  it('trong ngưỡng: "Còn 300 bao tới tối đa"', async () => {
    await show({ quantity: 500 })
    expect(screen.getByText('Còn 300 bao tới tối đa')).toBeOnTheScreen()
  })

  it('vượt max: "Vượt tối đa 4.200 bao" (màu thông tin, số theo locale)', async () => {
    await show({ quantity: 5000 })
    expect(screen.getByText('Vượt tối đa 4.200 bao')).toHaveStyle({ color: lightColors.infoText })
  })

  it('chỉ có min và đã đủ: "Cao hơn tối thiểu 50 bao"', async () => {
    await show({ quantity: 250, max: 0 })
    expect(screen.getByText('Cao hơn tối thiểu 50 bao')).toBeOnTheScreen()
    expect(screen.queryByTestId('level-gauge-max')).toBeNull()
  })

  it('không có đơn vị gốc → câu không kèm đơn vị', async () => {
    await show({ unit: undefined })
    expect(screen.getByText('Thiếu 32 so với tối thiểu')).toBeOnTheScreen()
  })
})

describe('LevelGauge — thanh kiểu Slider + hàng chú thích', () => {
  it('chú thích min/max: nhãn trên, giá trị kèm đơn vị dưới', async () => {
    await show({})
    const min = within(screen.getByTestId('level-gauge-min'))
    expect(min.getByText('Tối thiểu')).toBeOnTheScreen()
    expect(min.getByText('200 bao')).toBeOnTheScreen()
    const max = within(screen.getByTestId('level-gauge-max'))
    expect(max.getByText('Tối đa')).toBeOnTheScreen()
    expect(max.getByText('800 bao')).toBeOnTheScreen()
  })

  it('chỉ có min → không có chú thích max; chỉ có max → không có chú thích min', async () => {
    await show({ max: 0 })
    expect(screen.getByTestId('level-gauge-min')).toBeOnTheScreen()
    expect(screen.queryByTestId('level-gauge-max')).toBeNull()
    await screen.unmount()
    await show({ min: 0 })
    expect(screen.queryByTestId('level-gauge-min')).toBeNull()
    expect(screen.getByTestId('level-gauge-max')).toBeOnTheScreen()
  })

  it('không đơn vị → giá trị chỉ có số', async () => {
    await show({ unit: undefined })
    expect(within(screen.getByTestId('level-gauge-min')).getByText('200')).toBeOnTheScreen()
  })

  it('nhãn đọc màn hình gộp chứa "Tối thiểu 200 bao" và "Tối đa 800 bao"', async () => {
    await show({})
    const label = screen.getByTestId('level-gauge').props.accessibilityLabel as string
    expect(label).toContain('Tối thiểu 200 bao')
    expect(label).toContain('Tối đa 800 bao')
  })

  it('nút tròn tồn là hình tròn đường kính 18, thanh cao 6', async () => {
    await show({})
    expect(screen.getByTestId('level-gauge-mark', { includeHiddenElements: true })).toHaveStyle({
      width: 18,
      height: 18,
      borderRadius: 9,
    })
  })

  it('không còn nhãn lơ lửng đo kích thước', async () => {
    await show({})
    expect(screen.queryByText(/^(min|max) /)).toBeNull()
  })
})
