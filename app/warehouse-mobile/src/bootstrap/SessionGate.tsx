import { Stack, type NativeStackNavigationOptions } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { useExportDraft } from '@/features/export-draft'
import { useReceiveDraft } from '@/features/receive-checklist'
import { canEditThresholds } from '@/features/stock-threshold'
import { OfflineScreen } from '@/screens/offline'
import { useTheme } from '@/shared/theme/useTheme'

import { destinationFor, hrefFor, type Destination } from './destination'
import { useAppBootstrap } from './providers'
import { tabsFor } from './tabs'
import { useLeaveSheetOnSessionChange } from './useLeaveSheetOnSessionChange'
import { sheetScreenOptions } from './sheet-options'

/**
 * `splash` thoáng qua SAU lần khởi động đầu (vd đang nạp hồ sơ ngay sau khi bấm Đăng nhập, đang
 * resolve kho) thì giữ màn đang đứng — không gỡ navigator, không chớp màn trống.
 */
function useStableDestination(current: Destination): Destination {
  const [stable, setStable] = useState(current)
  if (current !== 'splash' && current !== stable) setStable(current)
  return current === 'splash' ? stable : current
}

/**
 * Quyết định app đứng ở đâu theo `(status, kho)` — bảng ở task 8. Mỗi route chỉ mở khi đích tương
 * ứng đang đúng (`Stack.Protected`); route đang đứng bị khoá thì Expo Router chuyển tới `redirectTo`
 * (route của đích hiện tại, `hrefFor`) và xoá nó khỏi lịch sử.
 */
export function SessionGate() {
  const ready = useAppBootstrap()
  const { colors } = useTheme()
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const resolution = useWarehouseStore((s) => s.resolution)
  // Quét trong phiếu: chỉ khi có bản nháp của một phiếu đang mở (màn phiếu đã nạp).
  const hasReceiveDraft = useReceiveDraft((s) => !!s.ctx && !!s.draft)
  // Sheet của màn lập / sửa phiếu xuất: chỉ khi có bản nháp phiếu xuất đang mở (màn phiếu đã nạp).
  const hasExportDraft = useExportDraft((s) => !!s.ctx && !!s.draft)
  const destination = useStableDestination(destinationFor(status, resolution, user))
  const visible = ready && destination !== 'splash'
  const home = hrefFor(destination, user) ?? undefined
  useLeaveSheetOnSessionChange(destination, home ?? null)

  useEffect(() => {
    if (visible) SplashScreen.hide()
  }, [visible])

  if (!visible) return null
  if (destination === 'offline') {
    return (
      <>
        <StatusBar style="auto" />
        <OfflineScreen />
      </>
    )
  }

  const inTabs = destination === 'tabs'
  // Sheet trình bày giống nhau (`sheetScreenOptions`), khác nấc cao (đã chốt): ngôn ngữ / lọc / đổi kho
  // mở nửa màn, kéo lên được hết cỡ; đổi mật khẩu và các sheet nhập liệu luôn hết cỡ (bàn phím).
  const halfSheet = sheetScreenOptions([0.5, 1], colors)
  const fullSheet = sheetScreenOptions([1], colors)
  // Android: màn toàn màn trên Stack gốc, trượt từ dưới lên.
  const formModal: NativeStackNavigationOptions = {
    presentation: 'fullScreenModal',
    gestureEnabled: false,
    ...(Platform.OS === 'android' ? { animation: 'slide_from_bottom' } : null),
  }
  const canSeeStock = tabsFor(user).includes('stock')
  const canSeeImport = tabsFor(user).includes('import')
  const canSeeExport = tabsFor(user).includes('export')
  const canEditStockThreshold = canEditThresholds(user)
  const canCreateImport = !!user && can(user, 'IMPORT_FORM_CREATE')
  // Thêm dòng vào phiếu xuất: tạo phiếu mới, hoặc sửa nháp (quyền theo người lập do sheet tự kiểm trên phiếu).
  const canEditExport =
    !!user &&
    (can(user, 'EXPORT_FORM_CREATE') ||
      can(user, 'EXPORT_FORM_UPDATE_DRAFT') ||
      can(user, 'EXPORT_FORM_UPDATE_DRAFT_OWN'))
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Protected redirectTo={home} guard={inTabs}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        {/* Lần đầu sau đăng nhập (nhiều kho, chưa chọn): màn đầy đủ, là màn đầu stack nên KHÔNG
            trình bày dạng modal (RN Screens cảnh báo modal làm màn đầu). */}
        <Stack.Protected redirectTo={home} guard={destination === 'select-warehouse'}>
          <Stack.Screen name="select-warehouse" />
        </Stack.Protected>
        {/* Form 3 bước (tạo / sửa phiếu nhập, xuất): modal toàn màn che thanh tab, không vuốt xuống để đóng
            (chỉ ✕ / ghi xong). Cần thấy tab tương ứng; quyền tạo / sửa do màn bước tự kiểm. Sheet con của
            luồng được đẩy lên Stack gốc sau modal nên nằm trên modal. */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeImport}>
          <Stack.Screen name="import-form" options={formModal} />
        </Stack.Protected>
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeExport}>
          <Stack.Screen name="export-form" options={formModal} />
        </Stack.Protected>
        {/* MỌI bottom sheet là một route trình bày giống nhau (`sheet(...)`), có Stack lồng cho header
            native (`app/<sheet>/_layout.tsx`), luôn nằm trên một màn khác (không là màn đầu stack). Đổi kho / đổi mật khẩu: chỉ khi đang ở tab. */}
        <Stack.Protected redirectTo={home} guard={inTabs}>
          <Stack.Screen name="switch-warehouse" options={halfSheet} />
          <Stack.Screen name="change-password" options={fullSheet} />
        </Stack.Protected>
        {/* Lọc tồn kho dạng sheet: CHỈ Android (iOS dùng menu gốc trên header của tab Tồn kho), và chỉ
            khi được thấy tab Tồn kho — deep link không được dựng `useInventory` cho người thiếu quyền. */}
        <Stack.Protected
          redirectTo={home}
          guard={inTabs && Platform.OS === 'android' && canSeeStock}
        >
          <Stack.Screen name="stock-filter" options={halfSheet} />
        </Stack.Protected>
        {/* Sửa ngưỡng tồn của một vật tư: thấy tab Tồn kho + đủ MATERIAL_UPDATE và WAREHOUSE_UPDATE (BE đòi
            cả hai). Hết cỡ (bàn phím). */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeStock && canEditStockThreshold}>
          <Stack.Screen name="stock-threshold" options={fullSheet} />
        </Stack.Protected>
        {/* Quét mã mở vật tư: khi thấy được tab Tồn kho (so mã với tồn của kho). Hết cỡ cho khung camera. */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeStock}>
          <Stack.Screen name="scan-material" options={fullSheet} />
        </Stack.Protected>
        {/* Bảng sửa dòng khi nhận hàng: cần thấy tab Nhập (bản nháp kiểm nằm ở màn phiếu). Hết cỡ (bàn phím). */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeImport}>
          <Stack.Screen name="import-line" options={fullSheet} />
        </Stack.Protected>
        {/* Thêm dòng vào phiếu đang kiểm: như bảng sửa dòng + IMPORT_FORM_CREATE (available-materials gác
            bằng quyền này). Hết cỡ (danh sách + bàn phím). */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeImport && canCreateImport}>
          <Stack.Screen name="import-add-line" options={fullSheet} />
        </Stack.Protected>
        {/* Soạn phiếu nhập: bộ chọn nhiều vật tư (hết cỡ: danh sách + bàn phím) và chọn Bên bán (nửa màn). Cần
            thấy tab Nhập + có bản nháp đang mở (ghi thẳng vào bản nháp); bộ chọn vật tư thêm IMPORT_FORM_CREATE
            (backend gác `available-materials` bằng quyền này; sheet tự kiểm thêm quyền sửa phiếu). */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeImport && hasReceiveDraft}>
          <Stack.Screen name="import-supplier" options={halfSheet} />
        </Stack.Protected>
        <Stack.Protected
          redirectTo={home}
          guard={inTabs && canSeeImport && hasReceiveDraft && canCreateImport}
        >
          <Stack.Screen name="import-pick" options={fullSheet} />
        </Stack.Protected>
        {/* Lọc danh sách phiếu nhập (nút "Lọc" trên header tab Nhập): cần thấy tab Nhập. Nửa màn, MỘT
            trang công tắc (cuộn được ở nấc nửa màn). */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeImport}>
          <Stack.Screen name="import-filter" options={halfSheet} />
        </Stack.Protected>
        {/* Lọc danh sách phiếu xuất (nút "Lọc" trên header tab Xuất): cần thấy tab Xuất. Nửa màn, MỘT
            trang công tắc như bộ lọc của tab Nhập (thêm thẻ "Loại"). */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeExport}>
          <Stack.Screen name="export-filter" options={halfSheet} />
        </Stack.Protected>
        {/* Bảng sửa dòng / quét mã trong phiếu xuất đang lập: cần thấy tab Xuất + có bản nháp phiếu xuất đang
            mở (sửa thẳng bản nháp). Hết cỡ (bàn phím / khung camera). */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeExport && hasExportDraft}>
          <Stack.Screen name="export-line" options={fullSheet} />
          <Stack.Screen name="scan-export-line" options={fullSheet} />
        </Stack.Protected>
        {/* Thêm vật tư vào phiếu xuất: như trên + được tạo / sửa phiếu xuất. Hết cỡ (danh sách + bàn phím). */}
        <Stack.Protected
          redirectTo={home}
          guard={inTabs && canSeeExport && hasExportDraft && canEditExport}
        >
          <Stack.Screen name="export-add-line" options={fullSheet} />
        </Stack.Protected>
        {/* Quét mã trong phiếu: như bảng sửa dòng + phải có bản nháp đang mở (so mã với các dòng của nó).
            Hết cỡ cho khung camera. */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeImport && hasReceiveDraft}>
          <Stack.Screen name="scan-line" options={fullSheet} />
        </Stack.Protected>
        {/* Ngôn ngữ: mở được cả từ màn đăng nhập (chưa đăng nhập) lẫn tab Tài khoản. */}
        <Stack.Protected redirectTo={home} guard={inTabs || destination === 'login'}>
          <Stack.Screen name="language" options={halfSheet} />
        </Stack.Protected>
        <Stack.Protected
          redirectTo={home}
          guard={destination === 'noWarehouse' || destination === 'noAccess'}
        >
          <Stack.Screen name="no-access" />
        </Stack.Protected>
        <Stack.Protected redirectTo={home} guard={destination === 'login'}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        {/* `/` không phải một màn: luôn khoá, nên đi tới `/` = chuyển tới `redirectTo` (đích hiện tại). */}
        <Stack.Protected redirectTo={home} guard={false}>
          <Stack.Screen name="index" />
        </Stack.Protected>
      </Stack>
    </>
  )
}
