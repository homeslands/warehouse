export {
  fetchWarehouses,
  createWarehouse,
  updateWarehouse,
  removeWarehouse,
  assignWarehouseManager,
  fetchWarehouse,
} from './api/warehouse.api'
export {
  useWarehouses,
  useCreateWarehouse,
  useUpdateWarehouse,
  useDeleteWarehouse,
  useAssignWarehouseManager,
  useWarehouse,
} from './api/hooks'
export { warehouseKeys } from './api/query-keys'
export { buildWarehouseColumns } from './ui/columns'
export { WarehouseStatusBadge } from './ui/WarehouseStatusBadge'
export type {
  Warehouse,
  WarehouseInput,
  WarehouseUpdateInput,
  WarehouseFilters,
  AssignWarehouseManagerInput,
  WarehouseManager,
} from './model/types'
export type { DetailLink } from './ui/columns'
