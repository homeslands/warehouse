import { ActionSheetIOS, Alert, Platform } from 'react-native'

export type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  /** Thao tác nguy hiểm: nút xác nhận màu đỏ. */
  destructive?: boolean
}

/**
 * Hỏi lại bằng hộp thoại GỐC của hệ thống (mượt, đúng kiểu nền tảng): iOS là action sheet, Android
 * là Alert. Trả `true` chỉ khi người dùng bấm xác nhận; Huỷ / chạm ra ngoài → `false`.
 */
export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
}: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: [confirmLabel, cancelLabel],
          cancelButtonIndex: 1,
          destructiveButtonIndex: destructive ? 0 : undefined,
        },
        (index) => resolve(index === 0),
      )
      return
    }
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}

export type ActionChoice = { label: string; destructive?: boolean }

/**
 * Chọn một thao tác trong danh sách bằng hộp GỐC (nút `⋯` trên header — không dùng UIMenu vì chạm ra
 * ngoài để đóng menu lọt xuống dòng bấm được bên dưới). iOS: action sheet [các mục…, Huỷ], mục nguy
 * hiểm màu đỏ. Android: Alert — chỉ chứa được 3 nút, nên khi có 3 mục thì bỏ nút Huỷ (chạm ra ngoài
 * / nút Back để huỷ). Trả chỉ số mục đã chọn, huỷ → `null`. Tối đa 3 mục.
 */
export function chooseAction({
  title,
  message,
  actions,
  cancelLabel,
}: {
  title?: string
  message?: string
  actions: readonly ActionChoice[]
  cancelLabel: string
}): Promise<number | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      const destructive = actions.flatMap((a, i) => (a.destructive ? [i] : []))
      ActionSheetIOS.showActionSheetWithOptions(
        {
          ...(title !== undefined && { title }),
          ...(message !== undefined && { message }),
          options: [...actions.map((a) => a.label), cancelLabel],
          cancelButtonIndex: actions.length,
          ...(destructive.length > 0 && { destructiveButtonIndex: destructive }),
        },
        (index) => resolve(index >= 0 && index < actions.length ? index : null),
      )
      return
    }
    if (__DEV__ && actions.length > 3) {
      console.warn(
        `[chooseAction] Android Alert chỉ chứa 3 nút — ${actions.length} mục, mục thừa sẽ mất`,
      )
    }
    const buttons = actions.map((a, i) => ({
      text: a.label,
      style: a.destructive ? ('destructive' as const) : ('default' as const),
      onPress: () => resolve(i),
    }))
    Alert.alert(
      title ?? '',
      message,
      actions.length < 3
        ? [{ text: cancelLabel, style: 'cancel', onPress: () => resolve(null) }, ...buttons]
        : buttons,
      { cancelable: true, onDismiss: () => resolve(null) },
    )
  })
}
