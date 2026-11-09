import { useNavigation, useRoute, useRouter } from 'expo-router'
import {
  CommonActions,
  StackActions,
  useNavigationState,
  type NavigationAction,
} from 'expo-router/react-navigation'
import { useEffect, useMemo, useRef } from 'react'

import { releaseLeaveGuards } from './forced-leave'
import { useLeaveOnce } from './useLeaveOnce'
import type { WizardStep } from './wizard-steps'

type StackRoute = { key: string; name: string; params?: object; state?: StackState }
type StackState = { key: string; index: number; routes: StackRoute[] }

export type WizardNavOptions = {
  formSlug: string
  /** Tên route của tab trong `(tabs)` chứa danh sách + màn xem: 'import' | 'export'. */
  tab: 'import' | 'export'
  /** Tên route từng bước trong Stack MODAL — giữ '[formSlug]/info' | '/edit' | '/review'. */
  routes: Readonly<Record<WizardStep, string>>
  /** Pathname từng bước trong modal, vd `{ 1: '/import-form/[formSlug]/info', … }`. */
  paths: Readonly<Record<WizardStep, string>>
  /** Danh sách của tab, vd `'/import'` — chỉ dùng khi modal nằm đáy Stack gốc (mở thẳng). */
  listPath: string
  /** Màn xem phiếu, vd `'/import/[formSlug]'` — như trên (cần `anchor: 'index'` ở layout tab). */
  viewPath: string
}

export type WizardNav = {
  /**
   * Bước đó (đúng phiếu) nằm dưới màn hiện tại → pop về nó; không → pop các bước phía trên dãy bước
   * tăng dần (< bước đích) rồi đẩy bước đó, để các bước trong Stack luôn tăng dần (back = lùi một bước).
   */
  goToStep: (step: WizardStep) => void
  /** Rời luồng (✕): đóng modal, Stack tab giữ nguyên. */
  exit: () => void
  /** Sau khi ghi xong: đóng modal, đỉnh Stack tab là màn xem phiếu `slug`. */
  finish: (slug: string) => void
  /** Bỏ phiếu mới / Xoá nháp / tạo xong: đóng modal, Stack tab về danh sách. */
  finishToList: () => void
  /** Phiếu mới vừa tạo nhưng cần xem lại: màn xem `slug` lên đỉnh Stack tab; Stack modal = [bước 2 của `slug`]. */
  reopen: (slug: string) => void
  /** Màn này là route đầu (index 0) của Stack modal → header dùng ✕. */
  atRoot: boolean
}

/** Route nhóm tab trong Stack gốc. */
const TABS_ROUTE = '(tabs)'
/** Tên route danh sách / màn xem phiếu trong Stack của tab (`app/(tabs)/<tab>/…`). */
const LIST_ROUTE = 'index'
const VIEW_ROUTE = '[formSlug]/index'

const STEPS: readonly WizardStep[] = [1, 2, 3]

const slugOf = (r: StackRoute) => (r.params as { formSlug?: string } | undefined)?.formSlug

/**
 * Gửi `action` thẳng tới navigator có key `target`. `source: undefined` bỏ `source` mà navigation của
 * màn tự gắn: `POP` có `target` + `source` sẽ đếm từ route `source` (không có trong Stack đích → bỏ qua).
 */
const targeted = (action: NavigationAction, target: string): NavigationAction => ({
  ...action,
  source: undefined,
  target,
})

/**
 * Điều hướng của form 3 bước. Luồng là một nhóm route modal trên Stack GỐC (`/<x>-form/[formSlug]/…`)
 * chứa Stack riêng (Stack modal, chỉ các bước của MỘT phiếu); danh sách / màn xem nằm trong Stack của
 * tab bên dưới. Trong modal, vuốt cạnh / back Android / ‹ lùi một bước là hành vi gốc của Stack; hook
 * này lo các bước nhảy (chạm thanh bước, "Tiếp tục") và rời luồng (✕, ghi xong, mở lại).
 *
 * - Bước: tác động lên Stack modal (`useNavigation()` + `StackActions`). Pop dùng `StackActions.pop(n)`
 *   với n tính từ state, không `popTo(name)` (lấy route cùng tên mà không xét `formSlug`, thay `params`).
 *   `router.push` / `router.replace` chỉ dùng khi phải tạo route mới.
 * - Rời luồng: đọc state gốc (`getParent()`), chỉnh Stack tab rồi pop route modal (và mọi route phía
 *   trên nó) khỏi Stack gốc — cả hai bằng action có `target` = key navigator đích. Stack tab chỉ dùng
 *   `pop` / `popToTop` / `reset` (đầy đủ state): `push` đổi focus sang `(tabs)` làm Stack gốc tự bỏ
 *   modal (sai với `reopen`). Không gửi action rỗng (đã đúng đích thì bỏ qua).
 * - Modal là route đầu Stack gốc (mở thẳng, không có `(tabs)` bên dưới): thay bằng danh sách
 *   (`router.replace(listPath)`); `finish` thay bằng màn xem (danh sách dưới nhờ `anchor` của tab).
 * Các thao tác liên tiếp chạy trong cùng lượt: router xử lý `dispatch` theo hàng đợi trên state mới
 * nhất, nhưng mọi tính toán dựa trên state đọc MỘT lần lúc gọi — mỗi navigator nhận tối đa một action.
 * Rời luồng chỉ MỘT lần mỗi route (`useLeaveOnce`); route modal đã không còn trong Stack gốc thì mọi
 * lần rời sau đó không làm gì (không pop nhầm màn của tab / sheet khác).
 */
export function useWizardNav(opts: WizardNavOptions): WizardNav {
  const navigation = useNavigation()
  const route = useRoute()
  const router = useRouter()
  const once = useLeaveOnce()
  const { formSlug, tab, listPath, viewPath } = opts
  const [r1, r2, r3] = [opts.routes[1], opts.routes[2], opts.routes[3]]
  const [p1, p2, p3] = [opts.paths[1], opts.paths[2], opts.paths[3]]
  const routeKey = route.key
  const routeName = route.name
  const atRoot = useNavigationState((s) => s.routes[0]?.key === routeKey)
  /** Route của màn đã từng có trong state của Stack (sau đó mất = màn đã rời Stack). */
  const seen = useRef(false)
  /** Route modal đã từng thấy trong Stack gốc / đã rời luồng (sau đó mất = modal đã đóng). */
  const inRoot = useRef(false)
  /** Màn còn gắn — lời gọi rời luồng sau khi màn đã gỡ không làm gì. */
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => void (mounted.current = false)
  }, [])

  const actions = useMemo(() => {
    const names: Record<WizardStep, string> = { 1: r1, 2: r2, 3: r3 }
    const paths: Record<WizardStep, string> = { 1: p1, 2: p2, 3: p3 }
    const flowNames = new Set([r1, r2, r3])
    const isFlow = (r: StackRoute) => flowNames.has(r.name) && slugOf(r) === formSlug
    /** Bước của route nếu là một bước của phiếu này, không thì `undefined`. */
    const stepOf = (r: StackRoute): WizardStep | undefined =>
      isFlow(r) ? STEPS.find((s) => names[s] === r.name) : undefined

    /**
     * Các route từ đáy Stack modal tới màn này (màn này ở cuối); `null` = màn đã rời Stack (không điều
     * hướng gì nữa).
     */
    const below = (): StackRoute[] | null => {
      const state = navigation.getState() as StackState | undefined
      if (!state) return []
      const at = state.routes.findIndex((r) => r.key === routeKey)
      if (at !== -1) {
        seen.current = true
        return state.routes.slice(0, at + 1)
      }
      if (seen.current) return null
      // Màn chưa từng có trong state: đang được đẩy lên — effect gắn đầu tiên (vd bước 3 tự về bước
      // thiếu) chạy trước khi Stack ghi route của nó. Nó sẽ ở trên cùng, nên tính từ nó (không thì pop
      // thiếu một màn). Trường hợp màn được `replace` vào, pop thừa bị Stack chặn ở route đầu.
      const self: StackRoute = { key: routeKey, name: routeName, params: { formSlug } }
      return [...state.routes.slice(0, state.index + 1), self]
    }
    /**
     * Pop tới route ở vị trí `target` trong `stack`. `pop(n)` (không `target`) tác động từ ĐỈNH Stack,
     * nên đếm từ đỉnh thật — màn gọi có thể không còn ở đỉnh: mọi route phía trên `target` đều bị bỏ.
     */
    const popTo = (stack: StackRoute[], target: number) => {
      const state = navigation.getState() as StackState | undefined
      const count = Math.max(stack.length - 1, state?.index ?? 0) - target
      if (count > 0) navigation.dispatch(StackActions.pop(count))
    }
    /** Vị trí bước thấp nhất của phiếu trong `stack` (màn này luôn là một bước của phiếu). */
    const lowestFlow = (stack: StackRoute[]) => {
      const i = stack.findIndex(isFlow)
      return i === -1 ? stack.length - 1 : i
    }

    /**
     * Stack gốc (navigation + state), vị trí route modal (`at`) và đỉnh (`top`) trong đó; `null` = modal
     * đã đóng (màn đã rời). `tabStack`: Stack của tab bên dưới; `straight` = không có `(tabs)` dưới
     * modal (mở thẳng).
     */
    const rootOf = () => {
      const modal = navigation.getState() as StackState | undefined
      const parent = navigation.getParent()
      const root = parent?.getState() as StackState | undefined
      if (!modal || !parent || !root || !mounted.current) return null
      let at = root.routes.findIndex((r, i) => i <= root.index && r.state?.key === modal.key)
      let top = root.index
      if (at !== -1) inRoot.current = true
      else if (inRoot.current) return null
      // Modal chưa từng có trong state gốc: đang được đẩy lên — effect gắn đầu tiên của màn đầu modal
      // chạy trước khi state gốc ghi route modal. Nó sẽ ở đỉnh Stack gốc, nên tính như đã ở đó.
      else at = top = root.index + 1
      const tabs = root.routes.slice(0, at).findLast((r) => r.name === TABS_ROUTE)
      const tabStack = tabs?.state?.routes.find((r) => r.name === tab)?.state
      return { parent, root, at, top, tabStack, straight: !tabs }
    }
    type Root = NonNullable<ReturnType<typeof rootOf>>
    /**
     * Rời luồng MỘT lần: chỉ dùng `once()` khi đã xác định được modal (không thì ✕ về sau bị khoá).
     * Sau lần rời, modal không còn trong state gốc → mọi lời gọi sau không làm gì.
     */
    const leave = (run: (root: Root) => void) => {
      const root = rootOf()
      if (!root || !once()) return
      inRoot.current = true
      run(root)
    }

    /**
     * Bỏ route modal và mọi route phía trên nó khỏi Stack gốc. Có sheet phía trên: nhả guard "Bỏ thay
     * đổi?" trước (rời bắt buộc), không thì pop bị chặn mà `once()` đã dùng → ✕ / Lưu của bước chết.
     */
    const close = ({ parent, root, at, top }: Root) => {
      if (top > at) releaseLeaveGuards()
      parent.dispatch(targeted(StackActions.pop(top - at + 1), root.key))
    }
    /** Gửi `action` lên Stack tab (nếu có, và có việc để làm). */
    const toTab = ({ parent, tabStack }: Root, action: NavigationAction | undefined) => {
      if (tabStack && action) parent.dispatch(targeted(action, tabStack.key))
    }
    /** Action đưa màn xem `slug` lên đỉnh Stack tab: pop tới màn xem CUỐI của `slug`, không có → thêm. */
    const showView = (tabStack: StackState | undefined, slug: string) => {
      if (!tabStack) return undefined
      const active = tabStack.routes.slice(0, tabStack.index + 1)
      const at = active.findLastIndex((r) => r.name === VIEW_ROUTE && slugOf(r) === slug)
      if (at === tabStack.index) return undefined
      if (at !== -1) return StackActions.pop(tabStack.index - at)
      return CommonActions.reset({
        ...tabStack,
        index: active.length,
        routes: [...active, { name: VIEW_ROUTE, params: { formSlug: slug } }],
      })
    }
    /** Action đưa Stack tab về danh sách. */
    const showList = (tabStack: StackState | undefined) => {
      if (!tabStack) return undefined
      if (tabStack.routes[0]?.name === LIST_ROUTE) {
        return tabStack.index > 0 ? StackActions.popToTop() : undefined
      }
      return CommonActions.reset({
        ...tabStack,
        index: 0,
        routes: [{ name: LIST_ROUTE }],
      })
    }
    const view = (slug: string) => ({ pathname: viewPath as never, params: { formSlug: slug } })

    return {
      goToStep: (step: WizardStep) => {
        const stack = below()
        if (!stack) return
        const top = stack.length - 1
        if (stack[top]?.name === names[step]) return
        const target = stack.findLastIndex((r, i) => i < top && stepOf(r) === step)
        if (target !== -1) return popTo(stack, target)
        // Không nằm dưới: giữ các bước của phiếu thành một dãy TĂNG dần từ đáy luồng để back gốc luôn
        // lùi đúng một bước — giữ dãy tăng dài nhất (tính từ bước thấp nhất) gồm các bước < `step`, pop
        // phần bước phía trên nó, rồi đẩy `step`. Vd [2] → bước 1 = [1]; [2, 1] → bước 3 = [2, 3];
        // [2, 3] → bước 1 = [1].
        const lowest = lowestFlow(stack)
        let keep = lowest - 1
        for (let i = lowest, prev = 0; i <= top; i++) {
          const s = stepOf(stack[i])
          if (s === undefined || s <= prev || s >= step) break
          prev = s
          keep = i
        }
        const href = { pathname: paths[step] as never, params: { formSlug } }
        if (keep >= 0) {
          popTo(stack, keep)
          router.push(href)
        } else {
          // Không giữ bước nào (luồng ở đáy Stack modal): bước thấp nhất thành bước `step`.
          popTo(stack, 0)
          router.replace(href)
        }
      },
      exit: () =>
        leave((root) => {
          if (root.straight) return router.replace(listPath as never)
          close(root)
        }),
      finish: (slug: string) =>
        leave((root) => {
          if (root.straight) {
            // MỘT lần `replace`: Stack tab chưa gắn nên `push` tiếp theo không tới được nó (đẩy thêm
            // `(tabs)`). `withAnchor` đặt danh sách dưới màn xem khi layout tab khai `anchor: 'index'`.
            return router.replace(view(slug), { withAnchor: true })
          }
          toTab(root, showView(root.tabStack, slug))
          close(root)
        }),
      finishToList: () =>
        leave((root) => {
          if (root.straight) return router.replace(listPath as never)
          toTab(root, showList(root.tabStack))
          close(root)
        }),
      reopen: (slug: string) =>
        leave((root) => {
          const modal = navigation.getState() as StackState
          toTab(root, showView(root.tabStack, slug))
          const reset = CommonActions.reset({
            ...modal,
            index: 0,
            routes: [{ name: r2, params: { formSlug: slug } }],
          })
          navigation.dispatch(targeted(reset, modal.key))
        }),
    }
  }, [
    navigation,
    router,
    once,
    routeKey,
    routeName,
    formSlug,
    tab,
    listPath,
    viewPath,
    r1,
    r2,
    r3,
    p1,
    p2,
    p3,
  ])

  return useMemo(() => ({ ...actions, atRoot }), [actions, atRoot])
}
