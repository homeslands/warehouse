import { TabStackLayout } from '@/bootstrap/TabStackLayout'

// Mở thẳng chi tiết danh mục (link sâu) vẫn có màn Tài khoản nằm dưới để quay lại.
export const unstable_settings = { anchor: 'index' }

export default function AccountLayout() {
  return <TabStackLayout tab="account" />
}
