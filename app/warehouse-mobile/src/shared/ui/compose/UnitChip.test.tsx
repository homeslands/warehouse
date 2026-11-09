import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'
import { chooseAction } from '@/shared/lib/native-confirm'

import { UnitChip } from './UnitChip'

jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))
const mockChoose = chooseAction as jest.MockedFunction<typeof chooseAction>

const HOP = { slug: 'hop', name: 'hộp' }
const THUNG = { slug: 'thung', name: 'thùng' }
const LOC = { slug: 'loc', name: 'lốc' }
const KIEN = { slug: 'kien', name: 'kiện' }

const onPick = jest.fn()
const onAndroidOverflow = jest.fn()
function show(units: { slug: string; name: string; hint?: string }[], disabled = false) {
  return render(
    <UnitChip
      title="Vật tư 1"
      current={HOP}
      units={units}
      disabled={disabled}
      onPick={onPick}
      onAndroidOverflow={onAndroidOverflow}
    />,
  )
}
const chip = () => screen.getByRole('button', { name: 'Đơn vị hộp, chạm để đổi' })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(() => jest.clearAllMocks())

describe('UnitChip', () => {
  it('chạm → action sheet gốc các đơn vị (đơn vị đang chọn ghi rõ) → onPick(đơn vị mới)', async () => {
    mockChoose.mockResolvedValueOnce(1)
    await show([HOP, THUNG])
    await fireEvent.press(chip())
    await act(async () => {})
    expect(mockChoose).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Vật tư 1',
        actions: [{ label: 'hộp (đang chọn)' }, { label: 'thùng' }],
        cancelLabel: 'Huỷ',
      }),
    )
    expect(onPick).toHaveBeenCalledWith('thung')
  })

  it('chọn lại đơn vị đang có / huỷ → không gọi onPick', async () => {
    mockChoose.mockResolvedValueOnce(0).mockResolvedValueOnce(null)
    await show([HOP, THUNG])
    await fireEvent.press(chip())
    await act(async () => {})
    await fireEvent.press(chip())
    await act(async () => {})
    expect(onPick).not.toHaveBeenCalled()
  })

  it('Android, hơn 3 đơn vị (Alert chỉ chứa 3 nút) → mở bảng sửa dòng thay cho Alert', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    await show([HOP, THUNG, LOC, KIEN])
    await fireEvent.press(chip())
    expect(mockChoose).not.toHaveBeenCalled()
    expect(onAndroidOverflow).toHaveBeenCalled()
  })

  it('một đơn vị / đang khoá → chữ, không bấm được', async () => {
    await show([HOP])
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('hộp')).toBeOnTheScreen()
    await screen.rerender(
      <UnitChip
        title="Vật tư 1"
        current={HOP}
        units={[HOP, THUNG]}
        disabled
        onPick={onPick}
        onAndroidOverflow={onAndroidOverflow}
      />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('units chưa tải (null) → bấm được, tải rồi mới mở action sheet; tải không được → không mở', async () => {
    mockChoose.mockResolvedValueOnce(1)
    const loadUnits = jest.fn().mockResolvedValueOnce([HOP, THUNG]).mockResolvedValueOnce(null)
    await render(
      <UnitChip
        title="Vật tư 1"
        current={HOP}
        units={null}
        loadUnits={loadUnits}
        disabled={false}
        onPick={onPick}
        onAndroidOverflow={onAndroidOverflow}
      />,
    )
    await fireEvent.press(chip())
    await act(async () => {})
    expect(loadUnits).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('thung')
    await fireEvent.press(chip())
    await act(async () => {})
    expect(mockChoose).toHaveBeenCalledTimes(1)
  })
})

describe("UnitChip variant 'value'", () => {
  it('chữ accent "hộp ⌄" không nền, vùng chạm cao 44; vẫn mở action sheet', async () => {
    mockChoose.mockResolvedValueOnce(1)
    await render(
      <UnitChip
        variant="value"
        title="Vật tư 1"
        current={HOP}
        units={[HOP, THUNG]}
        disabled={false}
        onPick={onPick}
        onAndroidOverflow={onAndroidOverflow}
      />,
    )
    expect(chip()).toHaveStyle({ minHeight: 44 })
    expect(StyleSheet.flatten(chip().props.style).backgroundColor).toBeUndefined()
    await fireEvent.press(chip())
    await act(async () => {})
    expect(onPick).toHaveBeenCalledWith('thung')
  })
})

describe('UnitChip — tỉ lệ so với đơn vị gốc', () => {
  it('tuỳ chọn có `hint` ghi "gói (24 chai)"; đơn vị gốc giữ nguyên, đơn vị đang chọn vẫn có dấu', async () => {
    mockChoose.mockResolvedValueOnce(null)
    await show([HOP, { slug: 'goi', name: 'gói', hint: '24 hộp' }])
    await fireEvent.press(chip())
    await act(async () => {})
    expect(mockChoose.mock.calls[0]![0].actions).toEqual([
      { label: 'hộp (đang chọn)' },
      { label: 'gói (24 hộp)' },
    ])
  })
})
