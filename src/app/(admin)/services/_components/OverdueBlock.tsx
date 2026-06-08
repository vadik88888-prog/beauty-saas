'use client'

import { useEffect, useState } from 'react'
import { Send, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/shared/Avatar'
import { formatPrice } from '@/lib/utils/format'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type OverdueService = {
  serviceId: string
  serviceName: string
  currency: string
  price: number
  clientCount: number
  missedRevenue: number
}

type OverdueClient = {
  clientId: string
  clientName: string
  phone: string | null
  telegramId: number | null
  lastVisitDate: string
  daysOverdue: number
}

export function OverdueBlock() {
  const [services, setServices] = useState<OverdueService[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [selected, setSelected] = useState<OverdueService | null>(null)
  const [clients, setClients] = useState<OverdueClient[] | null>(null)
  const [clientsLoading, setClientsLoading] = useState(false)

  const [winback, setWinback] = useState<{ clientId: string; clientName: string } | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetch('/api/admin/services/overdue')
      .then(r => r.ok ? r.json() : null)
      .then(j => setServices(j?.data?.services ?? []))
      .catch(() => setServices([]))
      .finally(() => setIsLoading(false))
  }, [])

  async function openService(svc: OverdueService) {
    setSelected(svc)
    setClients(null)
    setClientsLoading(true)
    try {
      const res = await fetch(`/api/admin/services/overdue?serviceId=${encodeURIComponent(svc.serviceId)}`)
      const json = res.ok ? await res.json() : {}
      setClients(json?.data?.clients ?? [])
    } finally {
      setClientsLoading(false)
    }
  }

  async function sendWinback() {
    if (!winback) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/trigger-client-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: winback.clientId, template: 'winback' }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Сообщение отправлено ${winback.clientName} через SERA`)
      setWinback(null)
    } catch {
      toast.error('Не удалось отправить. Проверьте, подключён ли бот.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="flex items-center mt-1">
        <span className="sera-label">Совет от SERA</span>
      </div>

      <div className="sera-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Считаем упущенную выручку…
          </div>
        ) : !services || services.length === 0 ? (
          <div className="p-5 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--sage-deep)' }} strokeWidth={1.5} />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>Всё под контролем</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Нет просроченных повторных визитов
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {services.slice(0, 5).map((svc, i) => (
              <div
                key={svc.serviceId}
                className="flex items-center gap-2 px-4 py-3"
                style={{ borderTop: i > 0 ? '1px solid var(--line-soft)' : 'none' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--ink)' }}>
                    {svc.serviceName}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {svc.clientCount} {plurClient(svc.clientCount)} · ~{formatPrice(svc.missedRevenue, svc.currency)}
                  </p>
                </div>
                <button
                  onClick={() => openService(svc)}
                  className="sera-btn sera-btn--secondary sera-btn--sm shrink-0"
                  style={{ height: 28, padding: '0 10px', fontSize: 11 }}
                >
                  Вернуть
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Client list dialog */}
      <Dialog
        open={!!selected}
        onOpenChange={open => { if (!open) { setSelected(null); setClients(null) } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Просрочили повтор</DialogTitle>
          </DialogHeader>
          {selected && (
            <p className="text-[12px] -mt-2 mb-1" style={{ color: 'var(--text-muted)' }}>
              {selected.serviceName} · {selected.clientCount} {plurClient(selected.clientCount)} · ~{formatPrice(selected.missedRevenue, selected.currency)}
            </p>
          )}
          <div className="flex flex-col max-h-[55vh] overflow-y-auto -mx-6 px-0">
            {clientsLoading ? (
              <p className="text-[13px] text-center py-8" style={{ color: 'var(--text-muted)' }}>Загружаем…</p>
            ) : !clients || clients.length === 0 ? (
              <p className="text-[13px] text-center py-8" style={{ color: 'var(--text-muted)' }}>Нет клиентов</p>
            ) : (
              clients.map((c, i) => (
                <div
                  key={c.clientId}
                  className="flex items-center gap-3 px-6 py-3"
                  style={{ borderTop: i > 0 ? '1px solid var(--line-soft)' : 'none' }}
                >
                  <Avatar name={c.clientName} id={c.clientId} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{c.clientName}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {formatVisitDate(c.lastVisitDate)} · просрочил {c.daysOverdue} дн.
                    </p>
                  </div>
                  <button
                    onClick={() => setWinback({ clientId: c.clientId, clientName: c.clientName })}
                    disabled={!c.telegramId}
                    className="sera-btn sera-btn--secondary sera-btn--sm shrink-0"
                    style={{ height: 28, padding: '0 10px', fontSize: 11 }}
                    title={!c.telegramId ? 'У клиента нет Telegram' : undefined}
                  >
                    Написать
                  </button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Winback send dialog */}
      <Dialog open={!!winback} onOpenChange={open => { if (!open) setWinback(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Написать клиенту</DialogTitle>
          </DialogHeader>
          {winback && (
            <div className="flex flex-col gap-4 py-1">
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                SERA отправит сообщение{' '}
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>{winback.clientName}</span>{' '}
                в Telegram от вашего бота
              </p>
              <div
                className="p-3 rounded-xl text-[13px] leading-relaxed whitespace-pre-line"
                style={{ background: 'var(--sage-tint)', color: 'var(--ink)' }}
              >
                {winbackPreview(winback.clientName)}
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Ответ появится в разделе «Сообщения».
              </p>
              <div className="flex gap-2">
                <button onClick={() => setWinback(null)} className="sera-btn sera-btn--secondary flex-1">
                  Отмена
                </button>
                <button
                  onClick={sendWinback}
                  disabled={sending}
                  className="sera-btn sera-btn--sera flex-[2] inline-flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sending ? 'Отправляем…' : 'Отправить через SERA'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function winbackPreview(fullName: string): string {
  const first = fullName.split(' ')[0] || fullName
  return `${first}, мы скучаем по вам! 💚\n\nЗапишитесь на процедуру и получите скидку 10% — только для вас как для постоянного клиента.\n\nЖдём вас! 🌸`
}

function plurClient(n: number): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return 'клиентов'
  if (last > 1 && last < 5) return 'клиента'
  if (last === 1) return 'клиент'
  return 'клиентов'
}

function formatVisitDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}
