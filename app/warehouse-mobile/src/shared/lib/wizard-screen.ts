import { useNavigation, useRoute } from 'expo-router'
import { useEffect } from 'react'

import { useFormNotice, type FormNotice } from './form-notice.store'

/**
 * Phần chung, không biết bản nháp nào, của hook nạp màn bước form 3 bước (`useExportWizardDraft` /
 * `useImportWizardDraft`).
 */

type StackState = { index: number; routes: { key: string }[] }

/**
 * Hàm hỏi "màn này đang ở ĐỈNH Stack modal?" — chưa có trong state (effect gắn đầu tiên chạy trước khi
 * Stack ghi route: màn đang được đẩy lên) cũng tính là đỉnh. Các bước của cùng phiếu có thể cùng gắn và
 * effect chạy cùng lượt: chỉ màn đỉnh được nạp / rời màn (không thì nạp / báo / pop hai lần).
 */
export function useIsStackTop(): () => boolean {
  const navigation = useNavigation()
  const routeKey = useRoute().key
  return () => {
    const state = navigation.getState() as StackState | undefined
    if (!state) return true
    const at = state.routes.findIndex((r) => r.key === routeKey)
    return at === -1 || at === state.index
  }
}

/**
 * Số màn bước đang gắn theo (loại, phiếu): về 0 (và vẫn 0 sau một nhịp) = đã rời luồng → bỏ thông báo
 * mức phiếu (`useFormNotice`) của phiếu đó.
 */
const mountedSteps = new Map<string, number>()

/** Số lần đã rời hẳn luồng theo (loại, phiếu) — xem `wizardVisit`. */
const leftCount = new Map<string, number>()

/**
 * Lượt mở luồng 3 bước của (loại, phiếu): đổi mỗi khi người dùng rời HẲN luồng (màn bước cuối cùng tháo
 * ra, xem `useStepNoticeLifetime`); đổi bước trong luồng không đổi. Kết quả async của một lượt (vd
 * chứng từ tải lên xong) so lượt này để không gắn vào lần mở sau.
 */
export function wizardVisit(kind: FormNotice['kind'], formSlug: string): number {
  return leftCount.get(`${kind}:${formSlug}`) ?? 0
}

/**
 * Gắn ở mọi màn bước: màn bước CUỐI CÙNG của phiếu tháo ra → `useFormNotice.dismiss(kind, formSlug)` và
 * lượt mới (`wizardVisit`).
 * Kiểm "về 0" HOÃN một nhịp: đổi bước (`goToStep` pop bước này + push bước kia, hay replace khi mở thẳng)
 * có thể tháo màn cũ trước khi effect gắn của màn mới chạy — bộ đếm qua 0 trong chốc lát mà người dùng
 * vẫn ở trong luồng. Mọi đường rời luồng (✕, back gốc từ bước thấp nhất, `finish*`, đổi kho) đều đi qua
 * việc tháo màn bước cuối cùng nên một chỗ này đủ.
 */
export function useStepNoticeLifetime(kind: FormNotice['kind'], formSlug: string): void {
  useEffect(() => {
    const key = `${kind}:${formSlug}`
    mountedSteps.set(key, (mountedSteps.get(key) ?? 0) + 1)
    return () => {
      const left = (mountedSteps.get(key) ?? 1) - 1
      if (left > 0) {
        mountedSteps.set(key, left)
        return
      }
      mountedSteps.delete(key)
      setTimeout(() => {
        if (mountedSteps.has(key)) return
        leftCount.set(key, (leftCount.get(key) ?? 0) + 1)
        useFormNotice.getState().dismiss(kind, formSlug)
      }, 0)
    }
  }, [kind, formSlug])
}
