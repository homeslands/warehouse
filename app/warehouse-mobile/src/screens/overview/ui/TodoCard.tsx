import { useTranslation } from 'react-i18next'

import { useTheme } from '@/shared/theme/useTheme'
import { BigValue, CardHeader, CardRow, DashCard, Text } from '@/shared/ui'
import {
  ArrowDownToLine,
  Clock,
  ListChecks,
  Pencil,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from '@/shared/ui/icons'

import type { Todo, TodoKey, TodoTone } from '../model/todos'

const ICONS: Record<TodoKey, LucideIcon> = {
  importDraft: ArrowDownToLine,
  exportPending: Clock,
  exportDraft: Pencil,
  stockLow: TriangleAlert,
  stockHigh: TrendingUp,
}

/**
 * Tổng việc đang chờ: cộng các mục có số; còn mục đang tải / lỗi → `undefined` (không hiện tổng thiếu).
 */
export function pendingTotal(todos: Todo[]): number | undefined {
  let sum = 0
  for (const todo of todos) {
    if (todo.failed || todo.count === undefined) return undefined
    sum += todo.count
  }
  return sum
}

/**
 * Card "Việc cần làm" (cả kho, hiện tại): dòng chính "N việc đang chờ" (tổng; chưa đủ số → "–"; toàn 0 →
 * "Không có việc tồn") + một hàng cho mỗi mục có quyền (icon màu trạng thái, "14 phiếu chờ kiểm hàng ›").
 * Hàng 0 / chưa có số / lỗi hiện mờ nhưng vẫn chạm được. Nhãn a11y hàng dùng nhãn dài `todo.<key>`.
 */
export function TodoCard({ todos, onOpen }: { todos: Todo[]; onOpen: (todo: Todo) => void }) {
  const { t } = useTranslation('overview')
  const { colors } = useTheme()
  const tint: Record<TodoTone, string> = {
    muted: colors.mutedForeground,
    default: colors.foreground,
    accent: colors.accentText,
    warning: colors.warningText,
    info: colors.infoText,
  }
  const total = pendingTotal(todos)

  return (
    <DashCard testID="todo-card">
      <CardHeader icon={ListChecks} label={t('todoTitle')} heading />
      {total !== undefined && total > 0 ? (
        <BigValue
          testID="todo-total"
          value={String(total)}
          unit={t('todoMainUnit', { count: total })}
        />
      ) : (
        <Text
          numeric
          weight="bold"
          size={32}
          testID="todo-total"
          adjustsFontSizeToFit
          numberOfLines={1}
          minimumFontScale={0.6}
          style={{ color: total === undefined ? colors.mutedForeground : colors.foreground }}
        >
          {total === undefined ? '–' : t('todoNone')}
        </Text>
      )}
      {todos.map((todo) => {
        const value = todo.failed ? '!' : todo.count === undefined ? '–' : String(todo.count)
        const a11yName = t(`todo.${todo.key}`)
        const muted = todo.tone === 'muted'
        return (
          <CardRow
            key={todo.key}
            testID={`todo-${todo.key}`}
            icon={ICONS[todo.key]}
            iconColor={tint[todo.tone]}
            muted={muted}
            onPress={() => onOpen(todo)}
            accessibilityLabel={
              todo.failed ? `${a11yName}, ${t('loadError')}` : `${a11yName}, ${value}`
            }
            label={
              <>
                <Text
                  numeric
                  weight="bold"
                  size={17}
                  testID={todo.failed ? `todo-${todo.key}-error` : `todo-${todo.key}-count`}
                  accessibilityLabel={todo.failed ? t('loadError') : undefined}
                  style={{
                    color: todo.failed
                      ? colors.destructiveText
                      : muted
                        ? colors.mutedForeground
                        : colors.foreground,
                  }}
                >
                  {value}
                </Text>
                {` ${t(`todoRow.${todo.key}`)}`}
              </>
            }
          />
        )
      })}
    </DashCard>
  )
}
