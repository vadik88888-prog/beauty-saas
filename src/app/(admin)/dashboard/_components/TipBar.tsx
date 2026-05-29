'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lightbulb, X } from 'lucide-react'

interface Props {
  tip: { text: string; action: string; href: string }
  aiName: string
}

export function TipBar({ tip, aiName }: Props) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className="fixed bottom-0 left-0 md:left-60 right-0 z-20 p-3 md:p-4 pointer-events-none">
      <div className="flex items-center gap-3 rounded-2xl bg-cream border border-sage-soft shadow-lg p-3.5 md:p-4 pointer-events-auto">
        <span className="w-8 h-8 rounded-xl bg-sage-tint flex items-center justify-center shrink-0">
          <Lightbulb className="w-4 h-4 text-sage" strokeWidth={1.8} />
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-[0.75rem] font-semibold text-ink">Совет от {aiName} · </span>
          <span className="text-[0.75rem] text-ink-2">{tip.text}</span>
        </div>
        <Link
          href={tip.href}
          className="shrink-0 rounded-xl bg-ink text-page text-[0.75rem] font-medium px-4 py-2 whitespace-nowrap hover:bg-ink/90 transition-colors"
        >
          {tip.action}
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 w-7 h-7 rounded-lg hover:bg-cream-2 flex items-center justify-center text-ink-2 hover:text-ink transition-colors"
          aria-label="Закрыть"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
