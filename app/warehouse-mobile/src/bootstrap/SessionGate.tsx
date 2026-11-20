import { Stack, type NativeStackNavigationOptions } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

import { can, useAuthStore } from '@/entities/session'
import { materialAbilities } from '@/entities/material'
import { materialTypeAbilities } from '@/entities/material-type'
import { unitAbilities } from '@/entities/unit'
import { useWarehouseStore } from '@/entities/warehouse'
import { useExportDraft } from '@/features/export-draft'
import { markWelcomeSeen, useWelcome } from '@/features/onboarding'
import { useReceiveDraft } from '@/features/receive-checklist'
import { canEditThresholds } from '@/features/stock-threshold'
import { canAssignWarehouse } from '@/features/warehouse-assign'
import { OfflineScreen } from '@/screens/offline'
import { markLaunchDone } from '@/shared/lib/launch'
import { useTheme } from '@/shared/theme/useTheme'

import { destinationFor, hrefFor, type Destination } from './destination'
import { LaunchOverlay } from './LaunchOverlay'
import { useAppBootstrap } from './providers'
import { tabsFor } from './tabs'
import { scanModalOptions } from './ScanStackLayout'
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
  const endReason = useAuthStore((s) => s.endReason)
  const seen = useWelcome((s) => s.seen)
  // Máy từng có phiên: đang đăng nhập / offline (có token sẵn) hoặc phiên vừa bị kết thúc (hết hạn, bị
  // khoá, đăng xuất) → coi như đã qua màn chào, kể cả người dùng cũ cập nhật app mà refresh bị từ chối
  // (màn đăng nhập phải báo lý do ngay, không bị màn chào chen trước).
  const hadSession = status === 'authenticated' || status === 'offline' || endReason !== null
  // Chưa nạp (`null`) hoặc lỗi đọc → coi như đã xem; chỉ `false` (máy chưa từng xem) mới ra màn chào.
  const welcomeSeen = seen !== false || hadSession
  const destination = useStableDestination(destinationFor(status, resolution, user, welcomeSeen))
  const visible = ready && destination !== 'splash'
  const home = hrefFor(destination, user) ?? undefined
  useLeaveSheetOnSessionChange(destination, home ?? null)

  // Lưu lại để lần mở sau / đăng xuất về sau không gặp màn chào. Phụ thuộc cả `seen`: cờ có thể nạp xong
  // SAU khi phiên đã có (đọc bộ nhớ chậm hơn mạng).
  useEffect(() => {
    if (hadSession && seen === false) void markWelcomeSeen()
  }, [hadSession, seen])

  // Khởi động nguội: lớp phủ logo (trùng splash gốc) gỡ splash gốc khi đã vẽ xong rồi chạy animation;
  // chỉ một lần trong đời app (SessionGate không bị gỡ khi về nền / mở lại).
  const [launching, setLaunching] = useState(true)
  const launch =
    visible && launching ? (
      <LaunchOverlay
        onShown={() => SplashScreen.hide()}
        onDone={() => {
          setLaunching(false)
          markLaunchDone()
        }}
      />
    ) : null

  if (!visible) return null
  if (destination === 'offline') {
    return (
      <>
        <StatusBar style="auto" />
        <OfflineScreen />
        {launch}
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
  // Màn quét mã: toàn màn camera tràn viền (`ScanScreen`), nền đen.
  const scanModal: NativeStackNavigationOptions = {
    ...scanModalOptions,
    contentStyle: { backgroundColor: '#000000' },
  }
  const canSeeStock = tabsFor(user).includes('stock')
  const canSeeImport = tabsFor(user).includes('import')
  const canSeeExport = tabsFor(user).includes('export')
  const canEditStockThreshold = canEditThresholds(user)
  const canCreateImport = !!user && can(user, 'IMPORT_FORM_CREATE')
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
            native (`app/<sheet>/_layout.tsx`), luôn nằm trên một màn khác (không là màn đầu stack). Đổi kho / đổi mật khẩu / giao diện: chỉ khi đang ở tab. */}
        <Stack.Protected redirectTo={home} guard={inTabs}>
          <Stack.Screen name="switch-warehouse" options={halfSheet} />
          <Stack.Screen name="change-password" options={fullSheet} />
          <Stack.Screen name="appearance" options={halfSheet} />
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
        {/* Đề xuất đặt hàng: sửa số / đơn vị / nơi đặt của một dòng. Như tab Tồn kho; hết cỡ (bàn phím). */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeStock}>
          <Stack.Screen name="reorder-line" options={fullSheet} />
        </Stack.Protected>
        {/* Danh mục: sheet tạo / sửa / xem Đơn vị và Loại vật tư — cần quyền đọc tương ứng (tạo / sửa / xoá do
            sheet tự kiểm). Hết cỡ (bàn phím). */}
        <Stack.Protected redirectTo={home} guard={inTabs && unitAbilities(user).read}>
          <Stack.Screen name="unit-form" options={fullSheet} />
        </Stack.Protected>
        <Stack.Protected redirectTo={home} guard={inTabs && materialTypeAbilities(user).read}>
          <Stack.Screen name="material-type-form" options={fullSheet} />
        </Stack.Protected>
        {/* Vật tư: sheet tạo / sửa (có màn con chọn loại / đơn vị gốc) — cần quyền đọc vật tư. Hết cỡ (bàn phím). */}
        <Stack.Protected redirectTo={home} guard={inTabs && materialAbilities(user).read}>
          <Stack.Screen name="material-form" options={fullSheet} />
        </Stack.Protected>
        {/* Lọc danh sách Vật tư theo loại (nút Lọc trên header màn Vật tư): cần quyền đọc vật tư. Nửa màn. */}
        <Stack.Protected redirectTo={home} guard={inTabs && materialAbilities(user).read}>
          <Stack.Screen name="material-filter" options={halfSheet} />
        </Stack.Protected>
        {/* Đơn vị quy đổi của vật tư: thêm / sửa / gỡ — cần `manageConversions`. Hết cỡ (bàn phím). */}
        <Stack.Protected
          redirectTo={home}
          guard={inTabs && materialAbilities(user).manageConversions}
        >
          <Stack.Screen name="conversion-unit-form" options={fullSheet} />
        </Stack.Protected>
        {/* Gắn vật tư vào kho: cần xem vật tư + MATERIAL_UPDATE và WAREHOUSE_UPDATE. */}
        <Stack.Protected
          redirectTo={home}
          guard={inTabs && materialAbilities(user).read && canAssignWarehouse(user)}
        >
          <Stack.Screen name="warehouse-assign" options={fullSheet} />
        </Stack.Protected>
        {/* Lô quá hạn / sắp hết hạn (ô Hạn dùng ở Tổng quan): đọc tồn kho nên cần thấy tab Tồn kho. Nửa màn. */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeStock}>
          <Stack.Screen name="expiry-batches" options={halfSheet} />
        </Stack.Protected>
        {/* Quét mã tìm vật tư trong danh mục (danh sách Vật tư, tab Tài khoản): cần xem vật tư. Toàn màn camera. */}
        <Stack.Protected redirectTo={home} guard={inTabs && materialAbilities(user).read}>
          <Stack.Screen name="scan-catalog-material" options={scanModal} />
        </Stack.Protected>
        {/* Quét mã mở vật tư: khi thấy được tab Tồn kho (so mã với tồn của kho). Toàn màn camera. */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeStock}>
          <Stack.Screen name="scan-material" options={scanModal} />
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
        {/* Bảng sửa dòng / quét mã / chọn Loại, Người nhận trong phiếu xuất đang lập: cần thấy tab Xuất + có
            bản nháp phiếu xuất đang mở (sửa thẳng bản nháp). Bảng sửa dòng hết cỡ (bàn phím); chọn Loại /
            Người nhận nửa màn (kéo lên hết cỡ); quét mã toàn màn camera. */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeExport && hasExportDraft}>
          <Stack.Screen name="export-line" options={fullSheet} />
          <Stack.Screen name="export-type" options={halfSheet} />
          <Stack.Screen name="export-receiver" options={halfSheet} />
          <Stack.Screen name="scan-export-line" options={scanModal} />
        </Stack.Protected>
        {/* Quét mã trong phiếu: như bảng sửa dòng + phải có bản nháp đang mở (so mã với các dòng của nó).
            Toàn màn camera. */}
        <Stack.Protected redirectTo={home} guard={inTabs && canSeeImport && hasReceiveDraft}>
          <Stack.Screen name="scan-line" options={scanModal} />
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
        {/* Màn chào một lần (máy mới cài, chưa đăng nhập): bấm "Bắt đầu" ghi cờ → đích thành `login`. */}
        <Stack.Protected redirectTo={home} guard={destination === 'welcome'}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        {/* Chỉ bản dev: xem lại màn chào khi đã đăng nhập (dòng ở tab Tài khoản), modal toàn màn. */}
        <Stack.Protected redirectTo={home} guard={inTabs && __DEV__}>
          <Stack.Screen name="welcome-preview" options={formModal} />
        </Stack.Protected>
        <Stack.Protected redirectTo={home} guard={destination === 'login'}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        {/* `/` không phải một màn: luôn khoá, nên đi tới `/` = chuyển tới `redirectTo` (đích hiện tại). */}
        <Stack.Protected redirectTo={home} guard={false}>
          <Stack.Screen name="index" />
        </Stack.Protected>
      </Stack>
      {launch}
    </>
  )
}
