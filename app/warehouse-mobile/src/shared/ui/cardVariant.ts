import { createContext, useContext } from 'react'

/**
 * `iconCard`: như `card` nhưng dòng có vòng icon được cân — lề trái = lề trên = lề dưới quanh vòng icon
 * (`ICON_CARD_INSET` 12, dòng cao 64). Dùng cho nhóm mà dòng nào cũng có icon (màn Tài khoản).
 */
export type ListVariant = 'default' | 'card' | 'iconCard'

/** `ListGroup variant="card" | "iconCard"` báo xuống `ListRow` để vẽ vòng icon 40pt + nhãn 17. */
export const ListVariantContext = createContext<ListVariant>('default')

export function useListVariant(): ListVariant {
  return useContext(ListVariantContext)
}
