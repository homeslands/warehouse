/** Trạng thái một bước của form 3 bước (vạch tiến độ `WizardProgress`). */
export type StepState = 'current' | 'done' | 'todo'

/** Bước của form 3 bước: 1 Thông tin, 2 Vật tư, 3 Xác nhận. */
export type WizardStep = 1 | 2 | 3

const STEPS: readonly WizardStep[] = [1, 2, 3]

/**
 * Trạng thái + chạm được của ba bước cho `WizardProgress` (spec §3.2). Một bước "đã xong" khi CHÍNH nó và mọi
 * bước trước đều đủ: bước 1 = `step1Ok`, bước 2 = `step1Ok && step2Ok`; bước 3 (Xác nhận) không bao giờ
 * "đã xong" — nó chỉ xong khi đã ghi. Bước hiện tại luôn `current` và không chạm được.
 * Chạm được: bước đã qua (< `current`). Phiếu đã có (mở thẳng bước 2): bước 1 và bước 2 luôn chạm được
 * (đều là trang đã mở của phiếu — đang ở bước 1 thì bước 2 nằm ngay dưới trong Stack), bước 3 chạm được
 * khi `canEnterStep3`. Phiếu mới chỉ tiến bằng "Tiếp tục".
 */
export function stepStatus(opts: {
  current: WizardStep
  step1Ok: boolean
  step2Ok: boolean
  existing: boolean
}): { state: StepState; pressable: boolean }[] {
  const { current, step1Ok, step2Ok, existing } = opts
  const done: Record<WizardStep, boolean> = { 1: step1Ok, 2: step1Ok && step2Ok, 3: false }
  return STEPS.map((step) => {
    if (step === current) return { state: 'current', pressable: false }
    const reachable =
      step < current || (existing && (step === 3 ? canEnterStep3(step1Ok, step2Ok) : true))
    return { state: done[step] ? 'done' : 'todo', pressable: reachable }
  })
}

/** Vào được bước 3 (bằng "Tiếp tục" hay chạm thanh bước) chỉ khi bước 1 VÀ bước 2 đều đủ. */
export function canEnterStep3(step1Ok: boolean, step2Ok: boolean): boolean {
  return step1Ok && step2Ok
}
