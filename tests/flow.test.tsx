import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'cache-timer',
  surface: 'desktop',
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

const STEP = { turnId: 't', index: 0, model: 'm', messageCount: 1 }

const usage = {
  model: 'm',
  input_tokens: 1,
  output_tokens: 1,
  cache_read_input_tokens: 100_000,
  cache_creation_input_tokens: 2000,
}

const engine = (on: On, answer: typeof usage | null) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.step', async function* () {
    return {
      turnId: 't',
      index: 0,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: answer,
    }
  })
}

const step = async (stream: AsyncGenerator<unknown, unknown>) => {
  for await (const _ of stream) {
    // The test reads the step to its end, as the engine does.
  }
}

test('a step starts the timer, the ticker runs it down, and it lapses', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on, usage)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await step($.turn.step(STEP))
  await clock.settle()

  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /warm/ }))?.text).toBe(
    'Cache warm 5:00 left',
  )

  await clock.advance(60_000)
  expect((await ui.find({ type: 'Text', text: /warm/ }))?.text).toBe(
    'Cache warm 4:00 left',
  )

  await clock.advance(241_000)
  expect((await ui.find({ type: 'Text', text: /expired/ }))?.text).toBe(
    'Cache expired just now',
  )
  await ui.unmount()
})

test('a failed request leaves the timer alone', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on, null)

  await step($.turn.step(STEP))
  await clock.settle()

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /cold/ })).toBeTruthy()
  await ui.unmount()
})

test('a subagent step is not the main thread', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on, usage)

  await step($.turn.step({ ...STEP, agentId: 'a' }))
  await clock.settle()

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /cold/ })).toBeTruthy()
  await ui.unmount()
})
