import React, { useId } from "react"
import { m, LazyMotion, domMax, MotionConfig, AnimatePresence } from "motion/react"

// Shared Motion presets for the whole app. Effects follow the Animate UI style
// (spring highlights that slide between items, soft pop-in surfaces) using the
// `motion` library only; presentation never changes app state or authority.
// `m` + LazyMotion(domMax) keeps only the features used here (animations, exit, layout).
export { m as motion, AnimatePresence }

export const spring = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 }
export const softSpring = { type: "spring", stiffness: 260, damping: 30 }

// reducedMotion="user" turns transform/layout animations off when the OS asks for it.
export function MotionProvider({ children }) {
  return <LazyMotion features={domMax} strict><MotionConfig reducedMotion="user" transition={spring}>{children}</MotionConfig></LazyMotion>
}

// Sliding highlight behind the active item of a nav or segmented control.
// Render it inside the active item only; Motion animates it between items via layoutId.
export function ActivePill({ group, className = "" }) {
  return <m.span layoutId={group} className={"motion-pill " + className} aria-hidden="true" transition={spring} />
}

// Unique layoutId per component instance, so two copies of the same control never share a pill.
export function usePillGroup(prefix) {
  return prefix + useId()
}

export const pageEnter = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: softSpring,
}

export const popIn = {
  initial: { opacity: 0, scale: 0.96, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } },
  transition: spring,
}

export const drawerPanel = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%", transition: { type: "tween", duration: 0.2, ease: "easeIn" } },
  transition: softSpring,
}

export const backdropFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18 },
}
