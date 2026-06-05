'use client'
import { createContext, useContext } from 'react'

interface TmaContextValue {
  aiName: string
  welcomeText: string | null
}

export const TmaContext = createContext<TmaContextValue>({ aiName: 'SERA', welcomeText: null })

export function useTmaContext(): TmaContextValue {
  return useContext(TmaContext)
}
