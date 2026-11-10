// Shared browser cache with background refresh (stale-while-revalidate).
// Switching tabs shows the last data at once; a refresh runs only when the data is older than
// `fresh`, then keeps polling every `interval`. Components reading the same key share one request.
import { useCallback, useEffect, useRef, useState } from "react"
import { startPolling } from "./polling.js"

const store = new Map()
const entry = (key) => {
  let e = store.get(key)
  if (!e) store.set(key, (e = { data: undefined, at: 0, promise: null, subs: new Set() }))
  return e
}

export function clearResourceCache() {
  store.clear()
}

// One request per key at a time; every subscriber re-renders when it lands.
export function fetchResource(key, load) {
  const e = entry(key)
  if (e.promise) return e.promise
  e.promise = Promise.resolve()
    .then(load)
    .then((data) => {
      e.data = data
      e.at = Date.now()
      e.subs.forEach((fn) => fn())
      return data
    })
    .finally(() => {
      e.promise = null
    })
  return e.promise
}

// Replace cached data after a save that returned the new value.
export function setResource(key, data) {
  const e = entry(key)
  e.data = data
  e.at = Date.now()
  e.subs.forEach((fn) => fn())
}

// Drop cached keys starting with `prefix` (after a change that makes them wrong).
export function invalidateResource(prefix) {
  for (const [key, e] of store) if (key.startsWith(prefix)) e.at = 0
}

export function useResource(key, load, { interval = 60000, fresh = 15000 } = {}) {
  const [, rerender] = useState(0)
  const [error, setError] = useState("")
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    if (!key) return undefined
    const e = entry(key)
    let alive = true
    const sub = () => alive && rerender((v) => v + 1)
    e.subs.add(sub)
    setError("")
    const run = () =>
      fetchResource(key, () => loadRef.current()).then(
        () => alive && setError(""),
        (err) => {
          if (alive) setError(err.message)
          throw err
        },
      )
    const age = Date.now() - e.at
    const polling = startPolling(run, { interval: () => interval, startDelay: e.at && age < fresh ? fresh - age : 0 })
    return () => {
      alive = false
      e.subs.delete(sub)
      polling.stop()
    }
  }, [key, interval, fresh])
  const reload = useCallback(
    () =>
      key
        ? fetchResource(key, () => loadRef.current()).then(
            () => setError(""),
            (err) => setError(err.message),
          )
        : Promise.resolve(),
    [key],
  )
  const e = key ? store.get(key) : null
  const set = useCallback((data) => key && setResource(key, data), [key])
  return { data: e?.data, error, updatedAt: e?.at || 0, loading: Boolean(e?.promise), reload, set }
}
