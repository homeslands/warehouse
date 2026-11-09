import { TabStackLayout } from '@/bootstrap/TabStackLayout'

// Mở thẳng một vật tư (quét mã, deep link) vẫn có danh sách nằm dưới để quay lại.
export const unstable_settings = { anchor: 'index' }

export default function StockLayout() {
  return <TabStackLayout tab="stock" />
}
