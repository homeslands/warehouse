import { useNavigation, useRoute } from 'expo-router'
import { StackActions } from 'expo-router/react-navigation'
import { useEffect, useRef } from 'react'

/**
 * Màn con trong Stack của một tab hiện dữ liệu theo kho (chi tiết vật tư, xem phiếu, kiểm phiếu): kho
 * đổi → về màn đầu của Stack (`popToTop`). Thường kho đổi từ TAB KHÁC hoặc qua sheet `/switch-warehouse`
 * trong lúc màn vẫn nằm trong Stack → `router.*` (chỉ tác động màn đang hiện) không dùng được; dispatch
 * lên CHÍNH Stack của màn. Không `replace` (chồng thêm màn đầu thứ hai).
 *
 * Chỉ màn đang ở ĐỈNH Stack của nó dispatch: nhiều màn cùng Stack (xem phiếu → kiểm phiếu) đều chạy
 * effect trong cùng một lượt, mà `dispatch` chỉ xếp hàng (state chưa đổi) → nếu cả hai dispatch, action
 * thứ hai không navigator nào xử lý hoặc nổi lên Stack GỐC (đóng sheet đang mở). Không dùng
 * `isFocused()`: nó xét cả navigator cha → đổi kho từ tab khác / qua sheet thì không màn nào pop.
 * Lần hiện đầu không điều hướng; kho bị xoá (hết phiên) để SessionGate lo.
 */
export function useLeaveOnWarehouseChange(warehouseSlug: string | undefined) {
  const navigation = useNavigation()
  const route = useRoute()
  const shown = useRef(warehouseSlug)
  useEffect(() => {
    if (warehouseSlug === shown.current) return
    shown.current = warehouseSlug
    if (!warehouseSlug) return
    const state = navigation.getState()
    if (state && state.index > 0 && state.routes[state.index]?.key === route.key) {
      navigation.dispatch(StackActions.popToTop())
    }
  }, [warehouseSlug, navigation, route.key])
}
