/**
 * Test màn bước / hook bản nháp với `expo-router` giả (không có navigator thật):
 * - `useNavigationState` (dùng cho `atRoot`) đọc state giả của Stack modal.
 * - Rời luồng của `useWizardNav` (`exit` / `finish` / `finishToList` / `reopen`) chỉ được ghi lại vào
 *   `leaveSpies` — đóng modal thật kiểm ở `useWizardNav.test.tsx` / `routing.test.tsx`. Mỗi route rời
 *   MỘT lần như thật (`useLeaveOnce`). `goToStep` và `atRoot` là thật.
 *
 *   jest.mock('expo-router/react-navigation', () =>
 *     jest.requireActual('@/shared/lib/testing/wizard-nav').reactNavigationWith(() => mockState()),
 *   )
 *   jest.mock('@/shared/lib/useWizardNav', () =>
 *     jest.requireActual('@/shared/lib/testing/wizard-nav').wizardNavWithLeaveSpies(),
 *   )
 */
import { useMemo } from 'react'

import { useLeaveOnce } from '../useLeaveOnce'
import type { WizardNav, WizardNavOptions } from '../useWizardNav'

type Leave = 'exit' | 'finish' | 'finishToList' | 'reopen'

export const leaveSpies: Record<Leave, jest.Mock> = {
  exit: jest.fn(),
  finish: jest.fn(),
  finishToList: jest.fn(),
  reopen: jest.fn(),
}

/** Tổng số lần đã rời luồng (mọi kiểu). */
export const leaveCount = () =>
  Object.values(leaveSpies).reduce((n, spy) => n + spy.mock.calls.length, 0)

/** Module `expo-router/react-navigation` thật, `useNavigationState` đọc `state()`. */
export function reactNavigationWith(state: () => unknown) {
  return {
    ...jest.requireActual('expo-router/react-navigation'),
    useNavigationState: (select: (s: unknown) => unknown) => select(state()),
  }
}

/** Module `useWizardNav` thật, các thao tác rời luồng thay bằng `leaveSpies` (một lần mỗi route). */
export function wizardNavWithLeaveSpies() {
  const actual = jest.requireActual('../useWizardNav') as typeof import('../useWizardNav')
  return {
    ...actual,
    useWizardNav: (opts: WizardNavOptions): WizardNav => {
      const nav = actual.useWizardNav(opts)
      const once = useLeaveOnce()
      return useMemo(() => {
        const spy =
          (name: Leave) =>
          (...args: unknown[]) => {
            if (once()) leaveSpies[name](...args)
          }
        return {
          ...nav,
          exit: spy('exit'),
          finish: spy('finish'),
          finishToList: spy('finishToList'),
          reopen: spy('reopen'),
        }
      }, [nav, once])
    },
  }
}
