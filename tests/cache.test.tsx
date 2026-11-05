import { expect, test } from 'claude-code/testing'

import { clock, expiresAt, newestTtl, tokens, urgency } from '../hooks/cache'

const BAND = {
  plugin: 'cache-timer',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const usage = (written: object) =>
  JSON.stringify({ message: { usage: { cache_creation: written } } })

const seed = (values: Record<string, unknown>) => (_: unknown, e: { key?: string }) => ({
  value: { value: values[e.key ?? ''], version: 1 },
})

test('the newest write names the TTL', async () => {
  const older = usage({ ephemeral_5m_input_tokens: 9 })
  const newer = usage({
    ephemeral_1h_input_tokens: 9,
    ephemeral_5m_input_tokens: 0,
  })

  expect(newestTtl(`${older}\n${newer}\n`)).toBe('1h')
  expect(newestTtl(`${newer}\n${older}\n`)).toBe('5m')
})

test('a read-only step leaves the last write standing', async () => {
  const write = usage({ ephemeral_1h_input_tokens: 9 })
  const readOnly = usage({
    ephemeral_1h_input_tokens: 0,
    ephemeral_5m_input_tokens: 0,
  })

  expect(newestTtl(`${write}\n${readOnly}\n`)).toBe('1h')
})

test('quoted field names and cut lines are not usage', async () => {
  const quoted = JSON.stringify({
    message: { content: '"ephemeral_5m_input_tokens": 500' },
  })

  expect(newestTtl(`{"cut": "ephemeral_5m\n${quoted}\n`)).toBe(null)
})

test('a subagent write is not the main thread', async () => {
  const sub = JSON.stringify({
    isSidechain: true,
    message: {
      usage: { cache_creation: { ephemeral_5m_input_tokens: 9 } },
    },
  })

  expect(newestTtl(`${sub}\n`)).toBe(null)
})

test('an unknown TTL counts down the shorter life', async () => {
  const stamp = { refreshedAt: 1000, tokens: 1 }

  expect(expiresAt(stamp, null)).toBe(1000 + 300_000)
  expect(expiresAt(stamp, '1h')).toBe(1000 + 3_600_000)
})

test('the figures read as a person would say them', async () => {
  expect(clock(3_600_000)).toBe('60:00')
  expect(clock(61_000)).toBe('1:01')
  expect(clock(400)).toBe('0:01')
  expect(tokens(950)).toBe('950')
  expect(tokens(101_400)).toBe('101k')
  expect(urgency(30 * 60_000, '1h')).toBe('success')
  expect(urgency(10 * 60_000, '1h')).toBe('warning')
  expect(urgency(30_000, '1h')).toBe('error')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the band counts down`, async ($, on) => {
    on(
      'state.get',
      seed({
        stamp: { refreshedAt: 0, tokens: 101_400 },
        ttl: '1h',
        now: 120_000,
      }),
    )
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /warm/ }))?.text).toBe(
      'Cache warm 58:00 left',
    )
    expect((await ui.find({ type: 'Text', text: /TTL/ }))?.text).toContain(
      '1h TTL · 101k tokens',
    )
    await ui.unmount()
  })

  test(`${surface}: the band says when it lapsed`, async ($, on) => {
    on(
      'state.get',
      seed({
        stamp: { refreshedAt: 0, tokens: 2000 },
        ttl: '5m',
        now: 480_000,
      }),
    )
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /expired/ }))?.text).toBe(
      'Cache expired 3m ago',
    )
    await ui.unmount()
  })

  test(`${surface}: no cache yet`, async ($, on) => {
    on('state.get', seed({ stamp: null }))
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /cold/ }))?.text).toContain(
      'Cache cold',
    )
    await ui.unmount()
  })
}
