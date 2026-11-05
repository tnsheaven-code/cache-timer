# Cache timer

A Claude Code mod that shows, above your prompt, how long your prompt cache stays warm.

| State | What you see |
| --- | --- |
| Warm | `Cache warm 58:12 left · 1h TTL · 102k tokens` |
| Expired | `Cache expired 3m ago · the next message rewrites 102k tokens` |
| No cache | `Cache cold · the next message starts a new one` |

The line turns amber for the last fifth of the time and red for the last minute.

## How it works

- The timer restarts with each main-conversation request that reads or writes the cache, counted from when the request was sent. It can run out slightly early, but it should not show a warm cache that has already gone.
- Subagent requests do not reset it.
- The cache length (5 minutes or 1 hour) is read from the end of your session transcript, on your own computer, with `tail`. Until a reading comes through, the timer counts down from 5 minutes and shows `? TTL`.
- A new session, `/clear`, a compaction or a model switch shows the cache as cold.

The line appears in the terminal and the desktop app, not in VS Code or on mobile. The mod sends nothing over the network.

## Install

At the prompt of a terminal session:

```
/plugin install cache-timer --marketplace tnsheaven-code/cache-timer
```

From a shell:

```bash
claude plugin install cache-timer --marketplace tnsheaven-code/cache-timer
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `tnsheaven-code/cache-timer`, then Add plugin.
