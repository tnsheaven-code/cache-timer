import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { ago, clock, expiresAt, newestTtl, tokens, urgency } from './cache'

const stamp = atom({ plugin: 'cache-timer', key: 'stamp' } as const, null)
const ttl = atom({ plugin: 'cache-timer', key: 'ttl' } as const, null)
const now = atom({ plugin: 'cache-timer', key: 'now' } as const, 0)

const TAIL_BYTES = '1048576'
const COLD_REDRAW_MS = 30_000

const readTtl = async ($: EngineInterface, transcript: string) => {
  try {
    const { exitCode, stdout } = await $.process.run([
      'tail',
      '-c',
      TAIL_BYTES,
      '--',
      transcript,
    ])
    const found = exitCode === 0 ? newestTtl(stdout) : null

    if (found !== null) {
      await update($, ttl, () => found)
    }
  } catch {
    // No tail, or the transcript has gone: the last TTL known stands.
  }
}

// A redraw a second while the cache is warm, then one a half minute for the
// "expired 3m ago" line.
const tick = async ($: EngineInterface) => {
  const current = await read($, stamp)

  if (current === null) {
    return
  }

  const time = await $.clock.now()
  const shown = await read($, now)
  const ends = expiresAt(current, await read($, ttl))

  if (time < ends || shown < ends || time - shown >= COLD_REDRAW_MS) {
    await update($, now, () => time)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(1000, () => void tick($))

    return next(e)
  })

  // Reads and writes both give the cache a full TTL again, from when the
  // request went out. Counting from then errs early on a long response.
  on('turn.step', async function* ($, e, next) {
    const sentAt = await $.clock.now()
    const response = yield* next(e)
    const used = response.usage

    if (e.agentId === undefined && used !== null) {
      const cached =
        used.cache_read_input_tokens + used.cache_creation_input_tokens

      if (cached > 0) {
        await update($, stamp, () => ({ refreshedAt: sentAt, tokens: cached }))
        await update($, now, () => sentAt)
      }
    }

    return response
  })

  // The TTL can change mid-session (usage overage drops it to five minutes),
  // so every turn's end looks again. The first turn looks sooner, at its first
  // tools, so a long turn does not count down the wrong length.
  on('classic.Stop', async ($, e, next) => {
    await readTtl($, e.transcript_path)

    return next(e)
  })

  on('classic.PostToolBatch', async ($, e, next) => {
    if ((await read($, ttl)) === null) {
      await readTtl($, e.transcript_path)
    }

    return next(e)
  })

  // Each of these leaves the next request with nothing to read.
  on('classic.PostCompact', async ($, e, next) => {
    await update($, stamp, () => null)

    return next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    await update($, stamp, () => null)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, stamp, () => null)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const current = await read($, stamp)

    if (current === null) {
      return (
        <Box>
          <Text dimColor>Cache cold · the next message starts a new one</Text>
        </Box>
      )
    }

    const known = await read($, ttl)
    const time = await read($, now)
    const left = expiresAt(current, known) - time

    if (left <= 0) {
      return (
        <Box>
          <Text color="error">Cache expired {ago(-left)}</Text>
          <Text dimColor>
            {' '}
            · the next message rewrites {tokens(current.tokens)} tokens
          </Text>
        </Box>
      )
    }

    return (
      <Box>
        <Text color={urgency(left, known)}>
          Cache warm {clock(left)} left
        </Text>
        <Text dimColor>
          {' '}
          · {known ?? '?'} TTL · {tokens(current.tokens)} tokens
        </Text>
      </Box>
    )
  })
}
