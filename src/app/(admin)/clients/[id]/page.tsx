import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/sera'

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await params

  return (
    <div style={{ padding: '24px 20px', maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Link
          href="/clients"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none', marginBottom: 12 }}
        >
          <ChevronLeft size={14} strokeWidth={1.8} />
          Клиенты
        </Link>
        <PageHeader title="Профиль клиента" />
      </div>

      <EmptyState
        orbState="idle"
        title="Профиль в разработке"
        description="Полная карточка клиента — история визитов, диалоги, предпочтения — появится в следующей фазе"
      />
    </div>
  )
}
