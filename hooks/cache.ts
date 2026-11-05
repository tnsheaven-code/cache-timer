import type { CacheStamp, Ttl } from '../types'

const MINUTE = 60_000
const TTL_MS: Record<Ttl, number> = { '5m': 5 * MINUTE, '1h': 60 * MINUTE }

// Until the transcript has said, count down the shorter life: a timer that
// runs out early costs nothing, one that promises a warm cache it lost does.
export const expiresAt = (stamp: CacheStamp, ttl: Ttl | null): number =>
  stamp.refreshedAt + TTL_MS[ttl ?? '5m']

type UsageRecord = {
  isSidechain?: boolean
  message?: {
    usage?: {
      cache_creation?: {
        ephemeral_5m_input_tokens?: number
        ephemeral_1h_input_tokens?: number
      }
    }
  }
}

/**
 * The TTL of the newest cache write in the tail of a transcript. The usage the
 * engine hands a hook has no TTL; the transcript's record of the API's does.
 * The first line of a tail may be cut short, so a line that does not parse is
 * passed over. Only the parsed path counts: a tool result quoting these field
 * names is not a usage record.
 */
export const newestTtl = (tail: string): Ttl | null => {
  const lines = tail.split('\n')

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]

    if (line === undefined || !line.includes('"ephemeral_')) {
      continue
    }

    let record: UsageRecord

    try {
      record = JSON.parse(line) as UsageRecord
    } catch {
      continue
    }

    const written = record.message?.usage?.cache_creation

    if (record.isSidechain === true || written === undefined) {
      continue
    }

    // Where one write has both, the five-minute part lapses first.
    if ((written.ephemeral_5m_input_tokens ?? 0) > 0) {
      return '5m'
    }

    if ((written.ephemeral_1h_input_tokens ?? 0) > 0) {
      return '1h'
    }
  }

  return null
}

export const clock = (ms: number): string => {
  const seconds = Math.ceil(ms / 1000)
  const rest = seconds % 60

  return `${Math.floor(seconds / 60)}:${rest < 10 ? '0' : ''}${rest}`
}

export const tokens = (count: number): string =>
  count < 1000 ? `${count}` : `${Math.round(count / 1000)}k`

export const ago = (ms: number): string => {
  const minutes = Math.floor(ms / MINUTE)

  if (minutes < 1) {
    return 'just now'
  }

  return minutes < 60
    ? `${minutes}m ago`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`
}

export const urgency = (
  left: number,
  ttl: Ttl | null,
): 'success' | 'warning' | 'error' => {
  if (left <= MINUTE) {
    return 'error'
  }

  return left <= TTL_MS[ttl ?? '5m'] / 5 ? 'warning' : 'success'
}
