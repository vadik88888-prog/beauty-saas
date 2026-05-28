import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ArrowRight, QrCode, Sparkles, Calendar, Scissors, UserCheck } from 'lucide-react'
import Link from 'next/link'
import { CopyButton } from '@/components/onboarding/CopyButton'
import { AiActivityDot } from '@/components/shared/AiActivityDot'

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
  const [tenantRes, aiRes] = await Promise.all([
    admin.from('tenants').select('name, slug').eq('id', tenantId).single(),
    admin.from('tenant_ai_settings').select('admin_name').eq('tenant_id', tenantId).single(),
  ])

  return {
    tenant: tenantRes.data as { name: string; slug: string } | null,
    aiName: (aiRes.data as { admin_name?: string } | null)?.admin_name ?? 'Алина',
  }
}

export default async function OnboardingCompletePage() {
  const { tenant, aiName } = await getData()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'
  const tmaLink = `${appUrl}/${tenant?.slug ?? ''}`

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      <div className="max-w-2xl mx-auto px-5 py-8 md:py-12 flex flex-col gap-6">
        {/* AI Hero — Алина готова работать */}
        <div className="relative rounded-2xl border border-ai-border overflow-hidden p-6 md:p-8 text-center bg-[linear-gradient(135deg,var(--ai-soft)_0%,var(--surface-elevated)_60%,var(--accent-soft)_100%)]" style={{ boxShadow: 'var(--shadow-sm)' }}>
          {/* Pulse avatar */}
          <div className="relative inline-flex mb-4">
            <div className="absolute inset-0 rounded-full bg-ai animate-ping opacity-30" />
            <div className="relative w-20 h-20 rounded-full bg-ai flex items-center justify-center text-white">
              <Sparkles className="w-9 h-9" strokeWidth={1.6} />
            </div>
            <AiActivityDot className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5 scale-110" />
          </div>

          <h1 className="text-display text-foreground">{aiName} готова работать</h1>
          <p className="text-body text-muted-foreground mt-2 max-w-md mx-auto">
            {tenant?.name ? `${tenant.name} настроен. ` : ''}
            Поделитесь ссылкой с клиентами — {aiName} начнёт отвечать и записывать прямо сейчас.
          </p>
        </div>

        {/* TMA Link card */}
        <div className="card-elevated p-5">
          <div className="flex items-center gap-2 mb-2.5">
            <QrCode className="w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ссылка для клиентов
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[12px] bg-surface-sunken rounded-xl px-3 py-2.5 border border-border break-all font-mono">
              {tmaLink}
            </code>
            <CopyButton text={tmaLink} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Поделитесь через мессенджер или разместите QR-код в салоне
          </p>
        </div>

        {/* Next steps */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Что дальше
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <NextStepCard
              icon={Scissors}
              title="Услуги"
              desc="Цены и категории"
              href="/services"
            />
            <NextStepCard
              icon={UserCheck}
              title="Мастера"
              desc="Профили и расписание"
              href="/masters"
            />
            <NextStepCard
              icon={Calendar}
              title="Календарь"
              desc="Все записи"
              href="/calendar"
            />
          </div>
        </div>

        {/* Primary action */}
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-foreground text-background text-[14px] font-semibold hover:opacity-90 transition-opacity"
        >
          Открыть панель управления
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}

function NextStepCard({
  icon: Icon, title, desc, href,
}: {
  icon: typeof Calendar
  title: string
  desc: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 p-4 rounded-2xl border border-border bg-surface-elevated hover:bg-surface-sunken transition-colors"
      style={{ boxShadow: 'var(--shadow-xs)' }}
    >
      <div className="w-9 h-9 rounded-xl bg-surface-sunken flex items-center justify-center">
        <Icon className="w-4 h-4 text-foreground" strokeWidth={1.8} />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </Link>
  )
}
