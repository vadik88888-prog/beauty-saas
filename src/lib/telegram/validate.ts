import { createHmac, createHash } from 'crypto'

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  photo_url?: string
}

export interface ParsedInitData {
  user: TelegramUser
  chat_instance?: string
  chat_type?: string
  auth_date: number
  hash: string
}

/**
 * Validates Telegram WebApp initData using HMAC-SHA256.
 * Returns parsed data if valid, throws if invalid.
 *
 * Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string
): ParsedInitData {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')

  if (!hash) throw new Error('Missing hash in initData')

  // Build data_check_string: all params except hash, sorted alphabetically, joined by \n
  params.delete('hash')
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  // Compute secret key: HMAC-SHA256("WebAppData", botToken)
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()

  // Compute expected hash
  const expectedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (expectedHash !== hash) {
    throw new Error('Invalid initData signature')
  }

  // Check auth_date freshness (max 1 hour)
  const authDate = parseInt(params.get('auth_date') ?? '0', 10)
  const now = Math.floor(Date.now() / 1000)
  if (now - authDate > 3600) {
    throw new Error('initData expired')
  }

  const userRaw = params.get('user')
  if (!userRaw) throw new Error('No user in initData')

  const user = JSON.parse(userRaw) as TelegramUser

  return {
    user,
    chat_instance: params.get('chat_instance') ?? undefined,
    chat_type: params.get('chat_type') ?? undefined,
    auth_date: authDate,
    hash,
  }
}

/**
 * Validates webhook secret token to protect bot webhook endpoint
 */
export function validateWebhookSecret(
  headerValue: string | null,
  expectedSecret: string
): boolean {
  if (!headerValue) return false
  // Constant-time comparison to prevent timing attacks
  const expected = createHash('sha256').update(expectedSecret).digest()
  const actual = createHash('sha256').update(headerValue).digest()
  if (expected.length !== actual.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected[i] ^ actual[i]
  }
  return diff === 0
}
