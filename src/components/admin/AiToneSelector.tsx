'use client'

export type Tone = 'friendly' | 'formal' | 'luxury' | 'casual'

type ToneCard = {
  id: Tone
  label: string
  sample: string
}

const TONE_CARDS: ToneCard[] = [
  {
    id: 'friendly',
    label: 'Дружелюбный',
    sample: 'Привет 🌸 Хочу помочь подобрать что-то идеальное для вас.',
  },
  {
    id: 'formal',
    label: 'Официальный',
    sample: 'Добрый день. Готова помочь с выбором услуги и записью.',
  },
  {
    id: 'luxury',
    label: 'Премиальный',
    sample: 'Добрый день. Подскажу процедуру, идеально подходящую вам.',
  },
]

type AiToneSelectorProps = {
  value: Tone
  onChange: (value: Tone) => void
  className?: string
  /** Optional 4th 'casual' card */
  includeCasual?: boolean
}

export function AiToneSelector({
  value,
  onChange,
  className = '',
  includeCasual = false,
}: AiToneSelectorProps) {
  const cards = includeCasual
    ? [
        ...TONE_CARDS,
        {
          id: 'casual' as Tone,
          label: 'Лёгкий',
          sample: 'Привет! Готова посоветовать процедуру 😊',
        },
      ]
    : TONE_CARDS

  return (
    <div
      className={`grid gap-3 ${className}`}
      style={{
        gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`,
      }}
      role="radiogroup"
    >
      {cards.map((card) => {
        const selected = card.id === value
        return (
          <button
            key={card.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(card.id)}
            className={`text-left rounded-2xl border p-4 transition-all ${
              selected
                ? 'bg-sage-tint border-sage'
                : 'bg-cream border-line hover:bg-cream-2'
            }`}
          >
            <div
              className={`font-medium text-sm mb-1.5 ${
                selected ? 'text-sage' : 'text-ink'
              }`}
            >
              {card.label}
            </div>
            <p className="font-serif italic text-sm text-ink-2 leading-snug">
              {card.sample}
            </p>
          </button>
        )
      })}
    </div>
  )
}
