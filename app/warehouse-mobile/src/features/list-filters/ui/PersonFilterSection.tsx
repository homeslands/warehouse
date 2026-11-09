import { Check, UserCheck, UserRound } from '@/shared/ui/icons'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { useAuthStore } from '@/entities/session'
import { fullName, personLabel, useUserSearch, type UserOption } from '@/entities/user'
import { haptics } from '@/shared/lib/haptics'
import { formatPhone } from '@/shared/lib/phone'
import { useTheme } from '@/shared/theme/useTheme'
import { Button, ROW_PRESS_DELAY_MS, SearchField, SegmentedControl, Text } from '@/shared/ui'

import { effectivePeople, type ListViewer, type PersonFilter } from '../people'
import type { ChipFilterStore } from '../store'
import { FilterSection, SECTION_HEADER_HEIGHT } from './FilterSection'

const SEARCH_DEBOUNCE_MS = 300

export type PersonRole = 'requester' | 'approver'
type Mode = 'me' | 'other'

function useDebouncedTerm(value: string): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [value])
  return debounced
}

/** Một dòng người trong kết quả: tên (hoặc SĐT) + SĐT, dấu tích khi đang chọn; cao ≥ 48. */
function PersonRow({
  title,
  phone,
  selected,
  onPress,
}: {
  title: string
  phone: string | null
  selected: boolean
  onPress: () => void
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={phone ? `${title}, ${phone}` : title}
      accessibilityState={{ selected }}
      onPress={onPress}
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 6,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.separator,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} weight={selected ? 'semibold' : 'regular'}>
          {title}
        </Text>
        {phone ? (
          <Text muted numeric size={13} numberOfLines={1}>
            {phone}
          </Text>
        ) : null}
      </View>
      {selected ? <Check size={18} strokeWidth={2.6} color={colors.accent} aria-hidden /> : null}
    </Pressable>
  )
}

/**
 * Thẻ "Người lập" / "Người xác nhận" của sheet Lọc. BẬT → chính mình (khi hồ sơ có `userSlug`; không
 * có thì vào thẳng "Người khác"); TẮT → tất cả. Có `USER_READ`: segmented [Phiếu của tôi / Tôi xác nhận |
 * Người khác]; "Người khác" = ô tìm + kết quả ngay trong thẻ (`GET /users` trang đầu 20, toàn chữ số →
 * `phonenumber`, còn lại → `name`, debounce 300ms — như `PersonFilter` web), chọn là ghi store. Chưa
 * chọn ai ở "Người khác" thì bộ lọc CHƯA áp dụng (store null, chỉ là chế độ của thẻ — đóng sheet rồi mở
 * lại thì công tắc TẮT). Thiếu `USER_READ`: chỉ một dòng "Chỉ phiếu do bạn lập", không bao giờ gọi
 * `/users`. Mọi trạng thái đọc theo bộ lọc THỰC SỰ được gửi (`effectivePeople`). Người đang chọn không
 * nằm trong trang kết quả → vẫn hiện bằng tên đã lưu lúc chọn.
 */
export function PersonFilterSection({
  store,
  role,
  viewer,
  onRevealSearch,
}: {
  store: ChipFilterStore
  role: PersonRole
  viewer: ListViewer
  /** Ô tìm được chạm: `y` của ô tìm trong vùng cuộn của sheet. */
  onRevealSearch: (y: number) => void
}) {
  const { t } = useTranslation(['importForms', 'common'])
  const { colors } = useTheme()
  const user = useAuthStore((s) => s.user)
  const me = viewer.userSlug
  const stored = store((s) => s[role])
  const sent = effectivePeople({ requester: null, approver: null, [role]: stored }, viewer)
  const current = sent.requesterSlug || sent.approverSlug ? stored : null

  const [pendingOther, setPendingOther] = useState(false)
  const on = current !== null || pendingOther
  const mode: Mode =
    !me || pendingOther || (current !== null && current.slug !== me) ? 'other' : 'me'
  const searching = viewer.canReadUsers && on && mode === 'other'

  const [text, setText] = useState('')
  const term = useDebouncedTerm(text)
  const search = useUserSearch(term, searching)
  const others = (search.data ?? []).filter((u) => u.slug !== me)
  // Người đang chọn (không phải mình) mà trang kết quả không có → đưa lên đầu, đọc tên đã lưu.
  const keepSelected =
    current !== null && current.slug !== me && !others.some((u) => u.slug === current.slug)

  const sectionY = useRef(0)
  const searchY = useRef(0)

  const write = (person: PersonFilter | null) => {
    const { setApprover, setRequester } = store.getState()
    if (role === 'approver') setApprover(person)
    else setRequester(person)
  }
  const mine = (): PersonFilter | null =>
    me && user ? { slug: me, name: fullName(user) || user.userName } : null

  const toggle = (next: boolean) => {
    if (!next) {
      write(null)
      setPendingOther(false)
    } else if (me) {
      write(mine())
      setPendingOther(false)
    } else {
      setPendingOther(true)
    }
  }
  const switchMode = (next: Mode) => {
    if (next === mode) return
    if (next === 'me') {
      write(mine())
      setPendingOther(false)
    } else {
      // "Người khác": bỏ lọc "của tôi" tới khi chọn được một người.
      write(null)
      setPendingOther(true)
    }
  }
  const pickUser = (u: UserOption) => {
    haptics.selection()
    write({ slug: u.slug, name: personLabel(u) })
    setPendingOther(false)
  }

  const label = t(
    role === 'approver' ? 'importForms:filterApprover' : 'importForms:filterRequester',
  )
  const mineLabel = t(
    role === 'approver' ? 'importForms:list.person.approvedByMe' : 'importForms:list.person.mine',
  )

  return (
    <FilterSection
      testID={`filter-section-${role}`}
      icon={role === 'approver' ? UserCheck : UserRound}
      label={label}
      on={on}
      onToggle={toggle}
      onLayout={(e) => {
        sectionY.current = e.nativeEvent.layout.y
      }}
    >
      {!viewer.canReadUsers ? (
        <Text muted size={14}>
          {t('importForms:list.filters.onlyMine')}
        </Text>
      ) : (
        <>
          {me ? (
            <SegmentedControl
              testID={`filter-${role}-mode`}
              items={[
                { value: 'me' as Mode, label: mineLabel },
                { value: 'other' as Mode, label: t('importForms:list.filters.otherPerson') },
              ]}
              value={mode}
              onChange={switchMode}
            />
          ) : null}
          {mode === 'other' ? (
            <>
              {current === null ? (
                <Text muted size={14}>
                  {t('importForms:list.filters.pickPerson')}
                </Text>
              ) : null}
              <View
                testID={`filter-${role}-search`}
                onLayout={(e) => {
                  searchY.current = e.nativeEvent.layout.y
                }}
              >
                <SearchField
                  value={text}
                  onChangeText={setText}
                  placeholder={t('importForms:filterPersonSearch')}
                  shape="pill"
                  onFocus={() =>
                    onRevealSearch(sectionY.current + SECTION_HEADER_HEIGHT + searchY.current)
                  }
                />
              </View>
              <View>
                {keepSelected && current ? (
                  <PersonRow title={current.name} phone={null} selected onPress={() => {}} />
                ) : null}
                {search.isError ? (
                  <View style={{ gap: 12, alignItems: 'center', paddingTop: 12 }}>
                    <Text muted>{t('importForms:list.person.loadError')}</Text>
                    <Button
                      variant="outline"
                      loading={search.isFetching}
                      onPress={() => void search.refetch({ cancelRefetch: false })}
                    >
                      {t('common:retry')}
                    </Button>
                  </View>
                ) : !search.data ? (
                  <ActivityIndicator
                    accessibilityLabel={t('importForms:list.person.loading')}
                    color={colors.mutedForeground}
                    style={{ paddingTop: 12 }}
                  />
                ) : others.length === 0 ? (
                  <Text muted style={{ textAlign: 'center', paddingTop: 12 }}>
                    {t('importForms:list.person.empty')}
                  </Text>
                ) : (
                  others.map((u) => (
                    <PersonRow
                      key={u.slug}
                      title={personLabel(u)}
                      phone={u.name ? formatPhone(u.phonenumber) : null}
                      selected={current?.slug === u.slug}
                      onPress={() => pickUser(u)}
                    />
                  ))
                )}
              </View>
            </>
          ) : null}
        </>
      )}
    </FilterSection>
  )
}
