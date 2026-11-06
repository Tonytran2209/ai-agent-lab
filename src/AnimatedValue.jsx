import React, { useEffect, useRef, useState } from "react"
const count = (value) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(value))
export default function AnimatedValue({ value, format = count }) {
  const current = useRef(0)
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let frame
    const finish = () => {
      cancelAnimationFrame(frame)
      current.current = value
      setDisplay(value)
    }
    const from = current.current ?? 0
    if (value == null || motion.matches || from === value) {
      finish()
    } else {
      const started = performance.now()
      const tick = (now) => {
        const progress = Math.min(1, (now - started) / 650)
        const next = from + (value - from) * (1 - Math.pow(1 - progress, 3))
        current.current = next
        setDisplay(next)
        if (progress < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }
    const onMotion = () => {
      if (motion.matches) finish()
    }
    motion.addEventListener("change", onMotion)
    return () => {
      cancelAnimationFrame(frame)
      motion.removeEventListener("change", onMotion)
    }
  }, [value])
  return (
    <>
      <span aria-hidden="true">
        {value == null ? "—" : format(display ?? 0)}
      </span>
      <span className="sr-only">{value == null ? "—" : format(value)}</span>
    </>
  )
}
