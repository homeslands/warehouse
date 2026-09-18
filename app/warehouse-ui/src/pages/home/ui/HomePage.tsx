import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useNavLabel, type NavGroup } from '@/shared/lib/nav'
import { useAuthStore } from '@/entities/session'

type Props = {
  /** Menu đã lọc theo quyền — tầng app truyền vào (page không import app). */
  nav: NavGroup[]
}

export function HomePage({ nav }: Props) {
  const user = useAuthStore((s) => s.user)
  const { t } = useTranslation(['nav'])
  const label = useNavLabel()

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {user ? t('nav:greeting', { name: user.userName }) : t('nav:greetingNoName')}
      </h1>

      {nav.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('nav:noFeatures')}</p>
      ) : (
        nav.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`home-group-${group.key}`}
            className="space-y-3"
          >
            <h2
              id={`home-group-${group.key}`}
              className="text-muted-foreground text-sm font-medium"
            >
              {label(group.labelKey)}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="bg-card hover:bg-muted focus-visible:ring-ring flex items-center gap-3 rounded-lg border p-4 text-sm font-medium outline-none focus-visible:ring-2"
                  >
                    <item.icon className="text-muted-foreground size-5" aria-hidden />
                    {label(item.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
