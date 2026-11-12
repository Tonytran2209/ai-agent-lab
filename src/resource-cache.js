// Shared browser cache with background refresh (stale-while-revalidate).
// Switching tabs shows the last data at once; a refresh runs only when the data is older than
// `fresh`, then keeps polling every `interval`. Components reading the same key share one request.
import { useCallback, useEffect, useRef, useState } from "react"
import { startPolling } from "./polling.js"

const store = new Map()
// Keys passed with { persist: true } are also kept in this browser (per signed-in user, ≤ 24 h),
// so a page reload shows the last data at once while the fresh read runs.
const PERSIST_PREFIX = "lab-cache:v1:"
const PERSIST_MAX_AGE = 24 * 3600000
const PERSIST_MAX_CHARS = 1500000
let owner = ""
const persistKey = (key) => PERSIST_PREFIX + owner + ":" + key
function readPersisted(key) {
  if (!owner) return null
  try {
    const v = JSON.parse(localStorage.getItem(persistKey(key)) || "null")
    return v && Number.isFinite(v.at) && Date.now() - v.at <= PERSIST_MAX_AGE ? v : null
  } catch {
    return null
  }
}
// Storage full: drop the oldest kept copy (any key but `keep`) so newer data still fits.
// Returns false when nothing else can be removed.
function evictOldest(keep) {
  let oldest = null,
    oldestAt = Infinity
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || k === keep || !k.startsWith(PERSIST_PREFIX)) continue
    // Copies start with {"at":<ms>, so the age is read without parsing the whole report.
    const at = Number(/^\{"at":(\d+)/.exec(localStorage.getItem(k) || "")?.[1] || 0)
    if (at < oldestAt) (oldest = k), (oldestAt = at)
  }
  if (oldest === null) return false
  localStorage.removeItem(oldest)
  return true
}
export function writePersisted(key, data, at) {
  if (!owner) return
  const name = persistKey(key)
  try {
    const text = JSON.stringify({ at, data })
    if (text.length > PERSIST_MAX_CHARS) return localStorage.removeItem(name)
    for (;;) {
      try {
        return localStorage.setItem(name, text)
      } catch {
        // Never wipe every copy: removing all of them left Status and Project empty after the
        // next reload. Drop the oldest ones until this one fits, or give up on this key only.
        if (!evictOldest(name)) return localStorage.removeItem(name)
      }
    }
  } catch {
    // Storage blocked: keep working from memory only.
  }
}
const entry = (key) => {
  let e = store.get(key)
  if (!e) store.set(key, (e = { data: undefined, at: 0, promise: null, subs: new Set(), persist: false, restored: false }))
  return e
}

// Who the persisted copies belong to; another user never sees them.
export function setCacheOwner(id) {
  owner = id ? String(id) : ""
}

export function clearResourceCache() {
  store.clear()
}

// Remove every copy kept in this browser (sign-out).
export function forgetPersisted() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PERSIST_PREFIX)) localStorage.removeItem(k)
    }
  } catch {}
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
      e.restored = false
      if (e.persist) writePersisted(key, data, e.at)
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
  e.restored = false
  if (e.persist) writePersisted(key, data, e.at)
  e.subs.forEach((fn) => fn())
}

// Drop cached keys starting with `prefix` (after a change that makes them wrong).
export function invalidateResource(prefix) {
  for (const [key, e] of store) if (key.startsWith(prefix)) e.at = 0
}

// Restore a persisted copy into memory once (shown as-is; `restored` marks it as not yet refreshed).
function restore(key) {
  const e = entry(key)
  e.persist = true
  if (e.data === undefined && !e.restoredOnce) {
    e.restoredOnce = true
    const v = readPersisted(key)
    if (v) {
      e.data = v.data
      e.at = v.at
      e.restored = true
    }
  }
  return e
}

export function useResource(key, load, { interval = 60000, fresh = 15000, persist = false } = {}) {
  if (key && persist) restore(key)
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
    // A restored copy is always refreshed at once.
    const polling = startPolling(run, { interval: () => interval, startDelay: e.at && !e.restored && age < fresh ? fresh - age : 0 })
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
  return { data: e?.data, error, updatedAt: e?.at || 0, restored: Boolean(e?.restored), loading: Boolean(e?.promise), reload, set }
}
