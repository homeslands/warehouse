import { listChipQuery, type ChipFilters, type ListViewer } from '@/features/list-filters'
import type {
  ImportFormFilters,
  ImportFormSearchField,
  ImportFormStatus,
} from '@/entities/import-form'

/** Bộ lọc trạng thái của danh sách; `ALL` = không gửi tham số `status`. */
export type ImportStatusFilter = ImportFormStatus | 'ALL'

export type ListFilterState = ChipFilters & {
  status: ImportStatusFilter
  field: ImportFormSearchField
  /** Từ khoá đã debounce + trim. */
  query: string
}

/** Bộ lọc gửi lên `GET import-forms` (cũng là query key). Mốc thời gian tính theo `now`. */
export function listQueryFilters(
  state: ListFilterState,
  viewer: ListViewer,
  now: Date,
): ImportFormFilters {
  return {
    ...(state.status === 'ALL' ? {} : { status: state.status }),
    ...(state.query ? { field: state.field, query: state.query } : {}),
    ...listChipQuery(state, viewer, now),
  }
}
