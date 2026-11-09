import { ActionSheetIOS, Alert, Platform } from 'react-native'

import { chooseAction, confirmAction } from './native-confirm'

const opts = {
  title: 'Đăng xuất?',
  message: 'Bạn sẽ phải đăng nhập lại.',
  confirmLabel: 'Đăng xuất',
  cancelLabel: 'Huỷ',
}

afterEach(() => jest.restoreAllMocks())

describe('confirmAction (iOS)', () => {
  it('action sheet: [xác nhận, Huỷ], Huỷ là cancel, nút xác nhận đỏ khi destructive', async () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_o, cb) => cb(0))
    await expect(confirmAction({ ...opts, destructive: true })).resolves.toBe(true)
    expect(sheet.mock.calls[0]![0]).toEqual({
      title: 'Đăng xuất?',
      message: 'Bạn sẽ phải đăng nhập lại.',
      options: ['Đăng xuất', 'Huỷ'],
      cancelButtonIndex: 1,
      destructiveButtonIndex: 0,
    })
  })

  it('không destructive → không có nút đỏ', async () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_o, cb) => cb(0))
    await confirmAction(opts)
    expect(sheet.mock.calls[0]![0].destructiveButtonIndex).toBeUndefined()
  })

  it('Huỷ → false', async () => {
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_o, cb) => cb(1))
    await expect(confirmAction(opts)).resolves.toBe(false)
  })
})

describe('confirmAction (Android)', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'))

  it('Alert: [Huỷ (cancel), xác nhận (destructive)]; bấm xác nhận → true', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const result = confirmAction({ ...opts, destructive: true })
    const [title, message, buttons] = alert.mock.calls[0]!
    expect(title).toBe('Đăng xuất?')
    expect(message).toBe('Bạn sẽ phải đăng nhập lại.')
    expect(buttons!.map((b) => [b.text, b.style])).toEqual([
      ['Huỷ', 'cancel'],
      ['Đăng xuất', 'destructive'],
    ])
    buttons![1]!.onPress!()
    await expect(result).resolves.toBe(true)
  })

  it('bấm Huỷ hoặc chạm ra ngoài → false', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const cancelled = confirmAction(opts)
    alert.mock.calls[0]![2]![0]!.onPress!()
    await expect(cancelled).resolves.toBe(false)

    const dismissed = confirmAction(opts)
    alert.mock.calls[1]![3]!.onDismiss!()
    await expect(dismissed).resolves.toBe(false)
    expect(alert.mock.calls[1]![2]![1]!.style).toBe('default')
  })
})

describe('chooseAction', () => {
  const actions = [
    { label: 'Thông tin phiếu' },
    { label: 'Xoá nháp', destructive: true },
    { label: 'Bỏ thay đổi trên máy', destructive: true },
  ]

  it('iOS: action sheet [các mục…, Huỷ], mục nguy hiểm đỏ; trả chỉ số mục đã chọn', async () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_o, cb) => cb(1))
    await expect(chooseAction({ title: 'PX-1', actions, cancelLabel: 'Huỷ' })).resolves.toBe(1)
    expect(sheet.mock.calls[0]![0]).toEqual({
      title: 'PX-1',
      options: ['Thông tin phiếu', 'Xoá nháp', 'Bỏ thay đổi trên máy', 'Huỷ'],
      cancelButtonIndex: 3,
      destructiveButtonIndex: [1, 2],
    })
  })

  it('iOS: Huỷ → null', async () => {
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_o, cb) => cb(3))
    await expect(chooseAction({ actions, cancelLabel: 'Huỷ' })).resolves.toBeNull()
  })

  describe('Android', () => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'))

    it('≤ 2 mục: Alert [Huỷ, mục…]; bấm mục → chỉ số, chạm ra ngoài → null', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
      const chosen = chooseAction({
        title: 'PX-1',
        actions: actions.slice(0, 2),
        cancelLabel: 'Huỷ',
      })
      const buttons = alert.mock.calls[0]![2]!
      expect(buttons.map((b) => [b.text, b.style])).toEqual([
        ['Huỷ', 'cancel'],
        ['Thông tin phiếu', 'default'],
        ['Xoá nháp', 'destructive'],
      ])
      buttons[2]!.onPress!()
      await expect(chosen).resolves.toBe(1)

      const dismissed = chooseAction({ actions: actions.slice(0, 1), cancelLabel: 'Huỷ' })
      alert.mock.calls[1]![3]!.onDismiss!()
      await expect(dismissed).resolves.toBeNull()
    })

    it('> 3 mục: cảnh báo lúc dev (Alert sẽ bỏ mất mục thừa)', () => {
      jest.spyOn(Alert, 'alert').mockImplementation(() => {})
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      void chooseAction({ actions: [...actions, { label: 'Thứ tư' }], cancelLabel: 'Huỷ' })
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]![0])).toMatch(/chooseAction/)
    })

    it('≤ 3 mục: không cảnh báo', () => {
      jest.spyOn(Alert, 'alert').mockImplementation(() => {})
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      void chooseAction({ actions, cancelLabel: 'Huỷ' })
      expect(warn).not.toHaveBeenCalled()
    })

    it('3 mục: Alert chỉ chứa được 3 nút → bỏ nút Huỷ (chạm ra ngoài / Back để huỷ)', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
      const chosen = chooseAction({ actions, cancelLabel: 'Huỷ' })
      const buttons = alert.mock.calls[0]![2]!
      expect(buttons.map((b) => b.text)).toEqual([
        'Thông tin phiếu',
        'Xoá nháp',
        'Bỏ thay đổi trên máy',
      ])
      expect(alert.mock.calls[0]![3]).toMatchObject({ cancelable: true })
      buttons[0]!.onPress!()
      await expect(chosen).resolves.toBe(0)
    })
  })
})
