const CURRENCY_SYMBOLS: Record<string, string> = {
  BYN: 'руб.',
  RUB: '₽',
  USD: '$',
  EUR: '€',
  PLN: 'zł',
}

export function formatPrice(amount: number, currency = 'BYN'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency
  return `${amount.toLocaleString('ru-RU')} ${symbol}`
}
