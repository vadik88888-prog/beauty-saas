'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Неверный email или пароль')
      setIsLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">BeautySaaS</h1>
          <p className="text-muted-foreground text-sm mt-2">Войдите в панель управления</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Email</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@salon.ru"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Пароль</label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <Button type="submit" disabled={isLoading} className="mt-2 h-11">
            {isLoading ? 'Вход...' : 'Войти'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
