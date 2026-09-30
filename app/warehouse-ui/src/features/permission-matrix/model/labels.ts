import { useTranslation } from 'react-i18next'
import type { Authority } from '@/entities/authority'
import { isAuthorityCode } from '@/shared/api/authority-codes'

/**
 * Tên nhóm backend → khoá i18n. Tên nhóm là định danh ổn định phía backend (migration `down()` xoá
 * nhóm THEO TÊN), nên map theo tên được; nhóm mới chưa có ở đây thì hiện nguyên tên backend.
 */
export const GROUP_KEYS = {
  Example: 'example',
  'Permission Management': 'permissionManagement',
  Role: 'role',
  System: 'system',
  'User Management': 'userManagement',
  'Import Form': 'importForm',
  'Export Form': 'exportForm',
  'Balance Form': 'balanceForm',
  'Warehouse Payment': 'warehousePayment',
  Warehouse: 'warehouse',
  Unit: 'unit',
  Material: 'material',
  Store: 'store',
  'Tax Profile': 'taxProfile',
} as const

function isGroupName(name: string): name is keyof typeof GROUP_KEYS {
  return Object.hasOwn(GROUP_KEYS, name)
}

/**
 * Tên hiển thị của quyền và nhóm quyền theo ngôn ngữ đang chọn. Tên backend trả về lẫn Anh–Việt
 * ("Create user" cạnh "Tạo phiếu nhập kho") nên FE dịch theo MÃ; mã (`authority.code`) vẫn hiện nguyên
 * ở dòng dưới, không dịch. Mã/nhóm FE chưa biết → rơi về tên backend, không vỡ màn.
 */
export function useAuthorityLabels() {
  const { t } = useTranslation(['permissions'])
  return {
    authorityName: (authority: Authority): string =>
      isAuthorityCode(authority.code)
        ? t(`permissions:authorityNames.${authority.code}`)
        : authority.name,
    groupName: (name: string): string =>
      isGroupName(name) ? t(`permissions:groupNames.${GROUP_KEYS[name]}`) : name,
  }
}
