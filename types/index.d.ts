export type Ttl = '5m' | '1h'

/** The last main-thread request that used the prompt cache. */
export type CacheStamp = { refreshedAt: number; tokens: number }

declare module 'claude-code' {
  interface PluginState {
    'cache-timer': {
      /** Null while there is no live cache: a new session, /clear, a compaction or a model switch. */
      stamp: CacheStamp | null
      /** What the transcript says the newest cache write used; null until one is seen. */
      ttl: Ttl | null
      /** The clock the drawing reads, moved by the ticker. */
      now: number
    }
  }
}
