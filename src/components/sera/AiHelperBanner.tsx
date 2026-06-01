import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface AiHelperItem {
  icon: LucideIcon
  title: string
  text: string
}

interface AiHelperBannerProps {
  title: string
  items: AiHelperItem[]
  action?: ReactNode
}

export function AiHelperBanner({ title, items, action }: AiHelperBannerProps) {
  return (
    <>
      <style>{`
        .ai-helper-banner {
          background: var(--sage-tint);
          border: 1px solid var(--sage-soft);
          border-radius: var(--radius-lg);
          padding: var(--space-6);
          margin-top: var(--space-8);
        }
        .ai-helper-banner__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-4);
          margin-bottom: var(--space-5);
          flex-wrap: wrap;
        }
        .ai-helper-banner__title {
          font: 600 14px var(--font-body);
          color: var(--ink);
          margin: 0;
        }
        .ai-helper-banner__grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: var(--space-5);
        }
        .ai-helper-item {
          display: flex;
          gap: var(--space-3);
          align-items: flex-start;
        }
        .ai-helper-item__icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: var(--card);
          border-radius: var(--radius-sm);
          border: 1px solid var(--card-border);
          color: var(--sage);
          flex-shrink: 0;
        }
        .ai-helper-item__title {
          font: 600 13px var(--font-body);
          color: var(--ink);
          margin: 0 0 2px;
        }
        .ai-helper-item__text {
          font: 400 12px var(--font-body);
          color: var(--muted);
          margin: 0;
          line-height: 1.5;
        }
        @media (max-width: 768px) {
          .ai-helper-banner__grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div className="ai-helper-banner">
        <div className="ai-helper-banner__header">
          <p className="ai-helper-banner__title">{title}</p>
          {action}
        </div>
        <div className="ai-helper-banner__grid">
          {items.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="ai-helper-item">
                <div className="ai-helper-item__icon">
                  <Icon size={16} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="ai-helper-item__title">{item.title}</p>
                  <p className="ai-helper-item__text">{item.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
