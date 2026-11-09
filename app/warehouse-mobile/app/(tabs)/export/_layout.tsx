import { TabStackLayout } from '@/bootstrap/TabStackLayout'

// Mở thẳng màn xem phiếu (ghi xong khi modal mở thẳng, deep link) vẫn có danh sách nằm dưới để quay lại.
export const unstable_settings = { anchor: 'index' }

export default function ExportLayout() {
  return <TabStackLayout tab="export" />
}
