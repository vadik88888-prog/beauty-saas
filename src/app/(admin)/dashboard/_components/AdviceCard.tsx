'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { SmartTip } from '@/lib/admin/get-ai-stats'

function buildPromoHref(tip: SmartTip): string {
  if (!tip.promoTitle) return tip.href
  const params = new URLSearchParams({
    new: '1',
    title: tip.promoTitle,
    description: tip.promoDescription ?? '',
    discount: String(tip.promoDiscount ?? ''),
    type: tip.promoType ?? 'percent',
  })
  return `/promo?${params.toString()}`
}

export function AdviceCard({ tips, aiName, dark }: { tips: SmartTip[]; aiName: string; dark?: boolean }) {
  const [idx, setIdx] = useState(0)
  if (!tips.length) return null

  const tip  = tips[idx]
  const href = buildPromoHref(tip)
  const next = () => setIdx(i => (i + 1) % tips.length)

  if (dark) {
    return (
      <div className="flex flex-col gap-3 flex-1">
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.80)' }}>{tip.text}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={href}
            className="inline-flex items-center rounded-xl text-xs font-bold px-4 py-2 transition-colors"
            style={{ background: 'rgba(94,125,93,0.55)', color: '#c8e8c4', border: '1px solid rgba(94,125,93,0.5)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(94,125,93,0.75)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(94,125,93,0.55)' }}
          >
            {tip.action}
          </Link>
          {tips.length > 1 && (
            <button
              onClick={next}
              className="text-xs font-medium inline-flex items-center gap-0.5 transition-colors"
              style={{ color: 'rgba(255,255,255,0.40)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.70)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.40)' }}
            >
              Другой совет <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
        {tips.length > 1 && (
          <div className="flex gap-1 mt-0.5">
            {tips.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === idx ? '12px' : '6px',
                  height: '6px',
                  background: i === idx ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.20)',
                }}
                aria-label={`Совет ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl border border-sage/30 p-4 flex flex-col gap-3"
      style={{ background: 'linear-gradient(135deg, #c8dfc3 0%, #f4efe5 70%)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-ink">Совет от {aiName}</span>
      </div>

      <p className="text-sm text-ink leading-relaxed min-h-[3rem]">{tip.text}</p>

      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={href}
          className="inline-flex items-center rounded-xl bg-sage text-page text-xs font-semibold px-4 py-2 hover:bg-sage-2 transition-colors"
        >
          {tip.action}
        </Link>
        {tips.length > 1 && (
          <button
            onClick={next}
            className="text-xs text-ink-2 font-medium hover:text-ink transition-colors inline-flex items-center gap-0.5"
          >
            Другая идея <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {tips.length > 1 && (
        <div className="flex gap-1 mt-0.5">
          {tips.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`h-1.5 rounded-full transition-all ${i === idx ? 'bg-sage w-3' : 'bg-sage/30 w-1.5'}`}
              aria-label={`Идея ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
