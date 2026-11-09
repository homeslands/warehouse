import type { ReactNode } from 'react'
import { Platform, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

/** Khoảng hở giữa các nút và mép dưới (thanh tab / đáy màn). */
const BOTTOM_GAP = 12

export type BottomDockProps = {
  children: ReactNode
  /** Chiều cao phần nội dung (không gồm inset) — màn chừa đúng chừng này ở đáy danh sách. */
  onContentHeight: (height: number) => void
  /** testID của vùng nổi; phần nội dung bên trong là `${testID}-content`. */
  testID?: string
}

/**
 * Vùng nổi ở đáy màn trong tab (nút chính viên thuốc…): TRONG SUỐT, đặt tuyệt đối đè lên nội dung
 * (không nền, không viền). Đo chiều cao phần nội dung (`onContentHeight`) để danh sách chừa đúng chỗ
 * ở đáy — nội dung có thể cao thêm (thông báo, câu chờ) nên không dùng hằng số.
 *
 * Vị trí như `FloatingCreateButton`: iOS bọc `SafeAreaView edges=['bottom']` — inset của CHÍNH view
 * này nên đã gồm thanh tab nổi nếu màn trải dưới thanh; Android dùng `View` thường (NativeTabs đã chừa
 * đáy, SafeAreaView sẽ đệm lần hai). Chiều cao đo là của phần nội dung BÊN TRONG (không gồm inset):
 * danh sách iOS đã tự chừa thanh tab qua `contentInsetAdjustmentBehavior="automatic"`.
 */
export function BottomDock({ children, onContentHeight, testID = 'bottom-dock' }: BottomDockProps) {
  const Container = Platform.OS === 'ios' ? SafeAreaView : View
  const containerProps = Platform.OS === 'ios' ? { edges: ['bottom' as const] } : null
  return (
    <Container
      testID={testID}
      {...containerProps}
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
    >
      <View
        testID={`${testID}-content`}
        pointerEvents="box-none"
        onLayout={(e) => onContentHeight(e.nativeEvent.layout.height)}
        style={{ gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: BOTTOM_GAP }}
      >
        {children}
      </View>
    </Container>
  )
}
