import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { FlaskConical, Gauge, Github, Maximize, Minus, Network, Plus, RotateCcw, X } from "lucide-react"
import "./connection-map.css"

// Connection map: AI Agent Lab in the middle, registered projects (Lab runs Codex, CI and deploys)
// on the left, monitored apps (read-only reports) on the right. Nodes can be dragged; holding the
// mouse on the background pans; the toolbar or Ctrl/⌘ + wheel zooms. Layout is kept per browser.

const NODE_W = 236
const NODE_H = 96
const COL_X = 380
const ROW_GAP = 128
const LAYOUT_KEY = "lab-connection-map-v2"
// Space kept free when fitting: column titles above, toolbar and legend along the bottom edge.
const FIT_TOP = 64
const FIT_BOTTOM = 76

const number = (v) => new Intl.NumberFormat("vi-VN").format(v ?? 0)
const timestamp = (v) => (v ? new Date(v).toLocaleString("vi-VN") : "Chưa có tín hiệu")
const duration = (ms) => (ms == null ? "—" : ms < 1000 ? Math.round(ms) + " ms" : (ms / 1000).toFixed(1).replace(".", ",") + " giây")

const projectSignals = {
  ready: { label: "Sẵn sàng", tone: "success" },
  stale: { label: "Tín hiệu quá hạn", tone: "warning" },
  error: { label: "Lỗi checkout", tone: "error" },
  unknown: { label: "Chưa có tín hiệu", tone: "neutral" },
  paused: { label: "Đã tạm dừng", tone: "neutral" },
  disabled: { label: "Runner chưa bật", tone: "neutral" },
}
const appSignals = {
  ready: { label: "Đang báo cáo", tone: "success" },
  degraded: { label: "Báo cáo thiếu dữ liệu", tone: "warning" },
  unauthorized: { label: "Sai token", tone: "error" },
  unavailable: { label: "Mất tín hiệu", tone: "error" },
  loading: { label: "Đang kiểm tra", tone: "neutral" },
}

function Signal({ tone = "neutral", children }) {
  return <span className={"cmap-signal " + tone}><span aria-hidden="true" />{children}</span>
}

function readLayout() {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}") || {} } catch { return {} }
}
function saveLayout(layout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch {}
}

// Default world positions (node centres): hub at the origin, two columns stacked around y = 0.
function defaultPositions(projects, apps) {
  const column = (list, x) => list.map((item, i) => [item.key, { x, y: (i - (list.length - 1) / 2) * ROW_GAP }])
  return Object.fromEntries([["lab", { x: 0, y: 0 }], ...column(projects, -COL_X), ...column(apps, COL_X)])
}

// Cubic edge between two node centres, leaving and entering on the facing sides.
function edgePath(a, b) {
  const dir = b.x >= a.x ? 1 : -1
  const x1 = a.x + dir * NODE_W / 2, x2 = b.x - dir * NODE_W / 2
  const c = Math.max(60, Math.abs(x2 - x1) / 2)
  return { d: `M ${x1} ${a.y} C ${x1 + dir * c} ${a.y}, ${x2 - dir * c} ${b.y}, ${x2} ${b.y}`, mx: (x1 + x2) / 2, my: (a.y + b.y) / 2 }
}

export default function ConnectionMap({ projects, runner, monitored, onOpenApp }) {
  const apps = monitored?.targets || []
  const nodes = useMemo(() => {
    const p = projects.map((item) => ({ key: "p:" + item.id, kind: "project", item }))
    const a = apps.map((item) => ({ key: "a:" + item.id, kind: "app", item }))
    return { projects: p, apps: a, all: [{ key: "lab", kind: "lab" }, ...p, ...a] }
  }, [projects, apps])
  const defaults = useMemo(() => defaultPositions(nodes.projects, nodes.apps), [nodes])
  const [layout, setLayout] = useState(readLayout)
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const pos = (key) => layout[key] || defaults[key] || { x: 0, y: 0 }
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })
  const [selected, setSelected] = useState(null)
  const [panning, setPanning] = useState(false)
  const canvasRef = useRef(null)
  const drag = useRef(null)
  const fitted = useRef(false)

  // Fit all nodes in the canvas (centre, scale ≤ 1).
  const fit = (from = layoutRef.current) => {
    const el = canvasRef.current
    if (!el) return
    const pts = nodes.all.map((n) => from[n.key] || defaults[n.key] || { x: 0, y: 0 })
    const minX = Math.min(...pts.map((p) => p.x)) - NODE_W / 2 - 40, maxX = Math.max(...pts.map((p) => p.x)) + NODE_W / 2 + 40
    const minY = Math.min(...pts.map((p) => p.y)) - NODE_H / 2 - FIT_TOP, maxY = Math.max(...pts.map((p) => p.y)) + NODE_H / 2 + FIT_BOTTOM
    const z = Math.min(1, el.clientWidth / (maxX - minX), el.clientHeight / (maxY - minY))
    setView({ z, x: el.clientWidth / 2 - ((minX + maxX) / 2) * z, y: el.clientHeight / 2 - ((minY + maxY) / 2) * z })
  }
  useLayoutEffect(() => {
    if (!fitted.current || nodes.all.length) { fit(); fitted.current = true }
  }, [nodes.all.length])
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return undefined
    const onResize = () => fit()
    const observer = new ResizeObserver(onResize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [nodes.all.length])

  const zoomAt = (factor, cx, cy) => setView((v) => {
    const z = Math.min(1.8, Math.max(0.35, v.z * factor))
    return { z, x: cx - ((cx - v.x) / v.z) * z, y: cy - ((cy - v.y) / v.z) * z }
  })
  const zoomCentre = (factor) => {
    const el = canvasRef.current
    if (el) zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2)
  }
  // Ctrl/⌘ + wheel zooms; a plain wheel keeps scrolling the page.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  // Pointer handling: drag a node, or pan when the press starts on the background.
  const onPointerDown = (e) => {
    if (e.button !== 0 || e.target.closest(".cmap-tools, .cmap-details")) return
    const nodeEl = e.target.closest("[data-node]")
    drag.current = { key: nodeEl?.dataset.node || null, sx: e.clientX, sy: e.clientY, moved: false,
      start: nodeEl ? pos(nodeEl.dataset.node) : { x: view.x, y: view.y } }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    if (!nodeEl) setPanning(true)
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    d.moved = true
    if (d.key) setLayout((l) => ({ ...l, [d.key]: { x: d.start.x + dx / view.z, y: d.start.y + dy / view.z } }))
    else setView((v) => ({ ...v, x: d.start.x + dx, y: d.start.y + dy }))
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    setPanning(false)
    if (!d) return
    if (d.key && d.moved) setLayout((l) => { saveLayout(l); return l })
    else if (d.key && !d.moved) setSelected((s) => (s === d.key ? null : d.key))
  }
  const resetLayout = () => {
    setLayout({})
    saveLayout({})
    fit({})
  }

  const runnerSignal = runner.connected ? { label: "Mac đã kết nối", tone: "success" } : { label: "Mac chưa có tín hiệu mới", tone: "warning" }
  const signalOf = (n) => n.kind === "lab" ? runnerSignal : n.kind === "project"
    ? projectSignals[n.item.connection] || projectSignals.unknown
    : appSignals[n.item.status] || appSignals.unavailable
  const lab = pos("lab")
  const edges = [...nodes.projects, ...nodes.apps].map((n) => {
    const p = pos(n.key), sig = signalOf(n)
    // Projects: Lab → project (Codex, CI, deploy). Apps: app → Lab (read-only report).
    const path = n.kind === "project" ? edgePath(lab, p) : edgePath(p, lab)
    return { key: n.key, kind: n.kind, tone: sig.tone, ...path, label: n.kind === "project" ? "Codex · CI · Deploy" : "Báo cáo chỉ đọc" }
  })
  const columnTop = (list) => Math.min(...list.map((n) => pos(n.key).y)) - NODE_H / 2 - 34
  const sel = nodes.all.find((n) => n.key === selected)

  const details = !sel ? null : sel.kind === "app" ? [
    ["Loại kết nối", "Ứng dụng theo dõi · chỉ đọc số liệu"],
    ["Địa chỉ", sel.item.origin],
    ["Trạng thái báo cáo", <Signal tone={signalOf(sel).tone}>{signalOf(sel).label}</Signal>],
    ["App ID", sel.item.appId || "Chưa xác định"],
    ["Báo cáo gần nhất", sel.item.generatedAt ? timestamp(sel.item.generatedAt) : "Chưa đọc được"],
    ["App → Lab", duration(sel.item.fetchMs)],
    ["Quyền trong Lab", "Không nhận feedback, không chạy code, không deploy"],
  ] : sel.kind === "project" ? [
    ["Repository", sel.item.repository],
    ["Kết nối runner", <Signal tone={signalOf(sel).tone}>{signalOf(sel).label}</Signal>],
    ["Project", sel.item.enabled ? "Đang bật" : "Tạm dừng"],
    ["Mac runner cho project", sel.item.runnerEnabled ? "Đã bật" : "Chưa bật"],
    ["Request đang chạy", number(sel.item.running)],
    ["Request bị chặn trong hàng đợi", number(sel.item.blocked)],
  ] : [
    ["Mac runner", <Signal tone={runnerSignal.tone}>{runnerSignal.label}</Signal>],
    ["Heartbeat Mac gần nhất", timestamp(runner.lastSeenAt)],
    ["Project đã đăng ký", number(projects.length)],
    ["Ứng dụng theo dõi", monitored?.error ? "Chưa đọc được" : monitored ? number(apps.length) : "Đang tải"],
  ]

  return (
    <section className="perf-card cmap" aria-labelledby="cmap-title">
      <div className="perf-card-heading">
        <div>
          <h2 id="cmap-title">Sơ đồ kết nối</h2>
          <p>Kéo node để sắp xếp · giữ chuột trên nền để di chuyển · Ctrl/⌘ + cuộn để phóng to. Bấm một node để xem chi tiết.</p>
        </div>
        <Network size={18} aria-hidden="true" />
      </div>
      <div ref={canvasRef} className={"cmap-canvas" + (panning ? " is-panning" : "")}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onKeyDown={(e) => e.key === "Escape" && setSelected(null)}>
        <div className="cmap-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <svg className="cmap-edges" aria-hidden="true">
            {edges.map((e) => (
              <g key={e.key} className={"cmap-edge " + e.kind + " " + e.tone + (selected === e.key ? " is-selected" : "")}>
                <path className="cmap-edge-base" d={e.d} />
                <path className="cmap-edge-flow" d={e.d} />
              </g>
            ))}
          </svg>
          {/* Only the selected connection is labelled; the legend explains both kinds. */}
          {edges.filter((e) => e.key === selected).map((e) => (
            <span key={e.key} className={"cmap-edge-label " + e.kind} style={{ left: e.mx, top: e.my }}>{e.label}</span>
          ))}
          {nodes.projects.length > 0 && <span className="cmap-column-title" style={{ left: -COL_X, top: columnTop(nodes.projects) }}>Project · Lab chạy code</span>}
          {nodes.apps.length > 0 && <span className="cmap-column-title app" style={{ left: COL_X, top: columnTop(nodes.apps) }}>Ứng dụng theo dõi · chỉ đọc</span>}
          {nodes.all.map((n) => {
            const p = pos(n.key), sig = signalOf(n)
            const Icon = n.kind === "lab" ? FlaskConical : n.kind === "project" ? Github : Gauge
            const name = n.kind === "lab" ? "AI Agent Lab" : n.item.name
            const sub = n.kind === "lab" ? "Điều phối project" : n.kind === "project" ? n.item.repository : n.item.origin.replace(/^https:\/\//, "")
            return (
              <button key={n.key} type="button" data-node={n.key} className={"cmap-node " + n.kind + " " + sig.tone + (selected === n.key ? " is-selected" : "")}
                style={{ left: p.x, top: p.y }} aria-pressed={selected === n.key}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected((s) => (s === n.key ? null : n.key)) } }}>
                <span className="cmap-node-icon"><Icon size={18} aria-hidden="true" /></span>
                <span className="cmap-node-text">
                  <strong title={name}>{name}</strong>
                  <small title={sub}>{sub}</small>
                  <Signal tone={sig.tone}>{sig.label}</Signal>
                </span>
              </button>
            )
          })}
          {!nodes.projects.length && !nodes.apps.length && <p className="cmap-empty" style={{ top: NODE_H }}>Chưa có project hay ứng dụng theo dõi.</p>}
        </div>
        <div className="cmap-tools" role="group" aria-label="Điều khiển sơ đồ">
          <button type="button" className="icon-button" aria-label="Phóng to" title="Phóng to" onClick={() => zoomCentre(1.2)}><Plus size={16} /></button>
          <button type="button" className="icon-button" aria-label="Thu nhỏ" title="Thu nhỏ" onClick={() => zoomCentre(1 / 1.2)}><Minus size={16} /></button>
          <button type="button" className="icon-button" aria-label="Vừa khung" title="Vừa khung" onClick={() => fit()}><Maximize size={15} /></button>
          <button type="button" className="icon-button" aria-label="Sắp xếp lại" title="Sắp xếp lại" onClick={resetLayout}><RotateCcw size={15} /></button>
        </div>
        <div className="cmap-legend" aria-hidden="true">
          <span><i className="solid" />Lab chạy Codex, CI, deploy</span>
          <span><i className="dotted" />App gửi báo cáo chỉ đọc</span>
        </div>
        {sel && (
          <aside className="cmap-details" aria-label={"Chi tiết kết nối " + (sel.kind === "lab" ? "AI Agent Lab" : sel.item.name)}>
            <header>
              <div>
                <small className="eyebrow">CHI TIẾT KẾT NỐI</small>
                <h3>{sel.kind === "lab" ? "AI Agent Lab" : sel.item.name}</h3>
              </div>
              <button type="button" className="icon-button" aria-label="Đóng chi tiết" onClick={() => setSelected(null)}><X size={17} /></button>
            </header>
            <dl>
              {details.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
            {sel.kind === "app" && onOpenApp && (
              <button type="button" className="button cmap-open" onClick={() => onOpenApp(sel.item.id)}>Xem số liệu ứng dụng</button>
            )}
          </aside>
        )}
      </div>
    </section>
  )
}
