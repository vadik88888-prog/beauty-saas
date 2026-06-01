'use client'

import type { ReactNode, ChangeEvent } from 'react'
import { Search } from 'lucide-react'

interface FiltersBarProps {
  searchPlaceholder?: string
  onSearch?: (value: string) => void
  filters?: ReactNode
  sort?: ReactNode
}

export function FiltersBar({
  searchPlaceholder = 'Поиск...',
  onSearch,
  filters,
  sort,
}: FiltersBarProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onSearch?.(e.target.value)
  }

  return (
    <>
      <style>{`
        .filters-bar {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          margin-bottom: var(--space-6);
          flex-wrap: wrap;
        }
        .filters-bar__search {
          position: relative;
          flex: 1;
          min-width: 200px;
        }
        .filters-bar__search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted);
          pointer-events: none;
          display: flex;
        }
        .filters-bar__search input {
          padding-left: 36px;
        }
        .filters-bar__slots {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          flex-wrap: wrap;
        }
        @media (max-width: 768px) {
          .filters-bar {
            flex-direction: column;
            align-items: stretch;
          }
          .filters-bar__search {
            min-width: unset;
          }
          .filters-bar__slots {
            width: 100%;
          }
        }
      `}</style>
      <div className="filters-bar">
        {onSearch !== undefined && (
          <div className="filters-bar__search">
            <span className="filters-bar__search-icon">
              <Search size={16} />
            </span>
            <input
              className="sera-input"
              type="search"
              placeholder={searchPlaceholder}
              onChange={handleChange}
            />
          </div>
        )}
        {(filters || sort) && (
          <div className="filters-bar__slots">
            {filters}
            {sort}
          </div>
        )}
      </div>
    </>
  )
}
