import React, { useEffect, useRef, useState } from "react"
import { animate, useReducedMotion } from "motion/react"
const count = (value) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(value))
// Counting number (Animate UI style) driven by Motion; screen readers get the final value only.
export default function AnimatedValue({ value, format = count }) {
  const current = useRef(0)
  const [display, setDisplay] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    const from = current.current ?? 0
    if (value == null || reduce || from === value) {
      current.current = value
      setDisplay(value)
      return undefined
    }
    const controls = animate(from, value, {
      type: "spring",
      stiffness: 90,
      damping: 20,
      restDelta: 0.01,
      onUpdate: (next) => {
        current.current = next
        setDisplay(next)
      },
      onComplete: () => {
        current.current = value
        setDisplay(value)
      },
    })
    return () => controls.stop()
  }, [value, reduce])
  return (
    <>
      <span aria-hidden="true">
        {value == null ? "—" : format(display ?? 0)}
      </span>
      <span className="sr-only">{value == null ? "—" : format(value)}</span>
    </>
  )
}
