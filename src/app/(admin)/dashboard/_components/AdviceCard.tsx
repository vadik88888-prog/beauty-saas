'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Sparkles, ChevronRight } from 'lucide-react'
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

export function AdviceCard({ tips, aiName }: { tips: SmartTip[]; aiName: string }) {
  const [idx, setIdx] = useState(0)
  if (!tips.length) return null

  const tip  = tips[idx]
  const href = buildPromoHref(tip)
  const next = () => setIdx(i => (i + 1) % tips.length)

  return (
    <div
      className="rounded-2xl border border-sage/30 p-4 flex flex-col gap-3"
      style={{ background: 'linear-gradient(135deg, #c8dfc3 0%, #f4efe5 70%)' }}
    >
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-white/70 border border-sage/30 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-sage" strokeWidth={2} />
        </span>
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
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? 'bg-sage w-3' : 'bg-sage/30'}`}
              aria-label={`Идея ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
