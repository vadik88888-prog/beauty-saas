import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CheckCircle2, ArrowRight, QrCode } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { CopyButton } from '@/components/onboarding/CopyButton'

async function getData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tenantUser } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!tenantUser) redirect('/login')

  const tenantId = (tenantUser as { tenant_id: string }).tenant_id
  const admin = createAdminClient()
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, slug')
    .eq('id', tenantId)
    .single()

  return { tenant: tenant as { name: string; slug: string } | null }
}

export default async function OnboardingCompletePage() {
  const { tenant } = await getData()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'
  const tmaLink = `${appUrl}/${tenant?.slug ?? ''}`

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <Card className="p-8 text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Ваш салон готов к работе!</h1>
        <p className="text-muted-foreground">
          {tenant?.name} успешно настроен. Клиенты могут записываться прямо сейчас.
        </p>

        {/* TMA Link */}
        <div className="bg-muted/50 rounded-2xl p-5 mt-8 text-left">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2">
            <QrCode className="w-4 h-4" />
            Ссылка для клиентов
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-background rounded-lg px-3 py-2 border break-all">{tmaLink}</code>
            <CopyButton text={tmaLink} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Поделитесь этой ссылкой с клиентами или разместите QR-код в салоне
          </p>
        </div>

        {/* Next steps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 text-left">
          <NextStepCard
            title="Добавьте услуги"
            desc="Настройте цены и категории"
            href="/services"
          />
          <NextStepCard
            title="Управляйте мастерами"
            desc="Расписание и профили"
            href="/masters"
          />
          <NextStepCard
            title="Смотрите расписание"
            desc="Все записи в одном месте"
            href="/calendar"
          />
        </div>

        <Link href="/dashboard">
          <Button className="mt-8 px-8 gap-2">
            Перейти в панель управления
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </Card>
    </div>
  )
}

function NextStepCard({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="block p-4 rounded-xl border hover:bg-muted/40 transition-colors group">
      <p className="text-sm font-semibold group-hover:text-primary transition-colors">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </Link>
  )
}

