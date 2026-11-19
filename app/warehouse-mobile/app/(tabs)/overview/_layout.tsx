import { TabStackLayout } from '@/bootstrap/TabStackLayout'

// Mở thẳng màn chi tiết (link sâu) vẫn có Tóm tắt nằm dưới để quay lại / để màn chi tiết lạ quay về.
export const unstable_settings = { anchor: 'index' }

export default function OverviewLayout() {
  return <TabStackLayout tab="overview" />
}
