import type { ReactNode } from 'react'

interface RightRailProps {
  children: ReactNode
}

export function RightRail({ children }: RightRailProps) {
  return (
    <>
      <style>{`
        .right-rail {
          width: 320px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
        }
        @media (max-width: 1024px) {
          .right-rail {
            width: 100%;
          }
        }
      `}</style>
      <aside className="right-rail">{children}</aside>
    </>
  )
}
