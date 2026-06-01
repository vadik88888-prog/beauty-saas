import { PageHeader } from '@/components/sera'
import { EmptyState } from '@/components/sera'

export default function RecommendationsPage() {
  return (
    <div style={{ padding: '24px 24px 32px', maxWidth: 900 }}>
      <PageHeader
        title="Рекомендации SERA"
        subtitle="Советы по заполнению расписания, удержанию клиентов и росту выручки"
      />
      <EmptyState
        orbState="thinking"
        title="Скоро здесь появятся все советы SERA"
        description="SERA анализирует расписание, клиентов и выручку — и формирует персональные рекомендации для вашего салона."
      />
    </div>
  )
}
