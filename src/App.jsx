import React, { useEffect, useRef, useState } from "react";
import { FlaskConical, Inbox, ListChecks, Library, Plug, Plus, ArrowRight, ArrowUpRight, Search, RefreshCw, ShieldCheck, Sparkles, Copy, X, LogOut, ChevronRight, Check, Clock, FileCode2, AlertTriangle, MessageSquare, LoaderCircle, GitBranch, Send, PanelLeftClose, Menu, CircleDot } from "lucide-react";

const labels = { feedback: "Feedback mới", "needs-triage": "Cần làm rõ", draft: "Bản nháp", "awaiting-approval": "Chờ duyệt", approved: "Sẵn sàng", claimed: "Đã claim", running: "Đang thực thi", review: "Chờ nghiệm thu", completed: "Hoàn tất", failed: "Kiểm tra thất bại", rejected: "Đã từ chối" };
const editableStates = ["feedback", "needs-triage", "draft", "awaiting-approval"];
const date = v => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(v));
function Badge({ status }) { return <span className={"badge status-" + status}><span />{labels[status] || status}</span>; }
function Empty({ icon: Icon = Inbox, title, children, action }) { return <div className="empty"><div className="empty-icon"><Icon size={26}/></div><h2>{title}</h2><p>{children}</p>{action}</div>; }
function Button({ children, busy, className = "", ...props }) { return <button className={"button " + className} disabled={busy || props.disabled} {...props}>{busy && <LoaderCircle size={15} className="spin"/>}{children}</button>; }

export default function App() {
  const [user, setUser] = useState(null), [boot, setBoot] = useState(true), [view, setView] = useState("inbox");
  const [requests, setRequests] = useState([]), [config, setConfig] = useState(null), [library, setLibrary] = useState(null);
  const [selected, setSelected] = useState(null), [detail, setDetail] = useState(null), [tab, setTab] = useState("request");
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"), [compose, setCompose] = useState(false);
  const [busy, setBusy] = useState(""), [toast, setToast] = useState(null), [loadError, setLoadError] = useState(""), [mobileNav, setMobileNav] = useState(false);
  async function api(url, init = {}) {
    const res = await fetch("/api" + url, { ...init, headers: { "Content-Type": "application/json", ...(user ? { "X-CSRF-Token": user.csrf } : {}), ...init.headers } });
    const body = await res.json().catch(() => ({ error: "Không đọc được phản hồi từ server." }));
    if (!res.ok) {
      if (res.status === 401 && user) setUser(null);
      throw new Error(body.error || "Yêu cầu thất bại.");
    }
    return body;
  }
  async function refresh() {
    const [r, c, l] = await Promise.all([api("/requests"), api("/config"), api("/library")]);
    setRequests(r.requests); setConfig(c); setLibrary(l); setLoadError("");
  }
  useEffect(() => { fetch("/api/auth/me").then(async r => { if (r.ok) setUser((await r.json()).user); }).catch(() => setLoadError("Không kết nối được server.")).finally(() => setBoot(false)); }, []);
  useEffect(() => {
    if (!user) return;
    refresh().catch(e => setLoadError(e.message));
    const timer = setInterval(() => refresh().catch(e => setLoadError(e.message)), 15000);
    return () => clearInterval(timer);
  }, [user]);
  useEffect(() => {
    if (!user || !selected) { setDetail(null); return; }
    let cancelled = false;
    setDetail(old => old?.request.id === selected ? old : null);
    api("/requests/" + selected).then(r => { if (!cancelled) setDetail(r); }).catch(e => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [selected, requests, user]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);
  async function act(key, fn, message) {
    setBusy(key);
    try { const result = await fn(); await refresh(); if (message) setToast({ message, type: "success" }); return result; }
    catch (e) { setToast({ message: e.message, type: "error" }); }
    finally { setBusy(""); }
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); setToast({ message: "Đã sao chép.", type: "success" }); }
    catch { setToast({ message: "Trình duyệt không cho phép clipboard. Hãy chọn và sao chép nội dung.", type: "error" }); }
  }
  function choose(id) { setSelected(id); setTab("request"); }
  function navigate(v) { setView(v); setMobileNav(false); setFilter("all"); }
  if (boot) return <div className="center-screen"><LoaderCircle className="spin" size={24}/><p>Đang mở workspace…</p></div>;
  if (!user) return <Login onLogin={setUser} error={loadError}/>;
  const active = requests.filter(r => ["claimed", "running"].includes(r.status)).length;
  const ready = requests.filter(r => r.status === "approved").length;
  const reviews = requests.filter(r => r.status === "review").length;
  const list = requests.filter(r => (view !== "queue" || !["feedback", "needs-triage", "rejected"].includes(r.status)) && (filter === "all" || r.status === filter) && (r.title + " " + r.id + " " + r.feedback).toLowerCase().includes(query.toLowerCase()));
  const r = detail?.request;
  return <div className="app-shell">
    {mobileNav && <button className="nav-backdrop" aria-label="Đóng menu" onClick={() => setMobileNav(false)}/>}
    <aside className={"sidebar " + (mobileNav ? "open" : "")}>
      <a className="brand" href="/" aria-label="AI Agent Lab"><span className="brand-icon"><FlaskConical size={22}/></span><span>Agent Lab<small>AI WORKSPACE</small></span></a>
      <div className="project-switch"><span className="project-avatar">W</span><div><strong>Writer Studio</strong><small>Project connected</small></div><ChevronRight size={14}/></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>
        {[["inbox", Inbox, "Feedback inbox", requests.filter(r => r.status === "feedback").length], ["queue", ListChecks, "Request queue", ready], ["library", Library, "MD Library", null], ["connection", Plug, "Kết nối Codex", null]].map(([key, Icon, title, count]) => <button key={key} className={"nav-item " + (view === key ? "active" : "")} onClick={() => navigate(key)}><Icon size={17}/><span>{title}</span>{count > 0 && <span className="nav-count">{count}</span>}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="pull-mode"><span className="connection-dot"/><div><strong>Codex pull workflow</strong><small>Chỉ request đã duyệt</small></div></div><div className="account"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role === "admin" ? "Workspace admin" : "Team member"}</small></div><button className="icon-button" aria-label="Đăng xuất" onClick={() => act("logout", async () => { await api("/auth/logout", { method: "POST" }); setUser(null); setRequests([]); setSelected(null); }, null)}><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-only" aria-label="Mở menu" onClick={() => setMobileNav(true)}><Menu size={19}/></button><span>Workspace</span><ChevronRight size={13}/><strong>{view === "inbox" ? "Feedback inbox" : view === "queue" ? "Request queue" : view === "library" ? "MD Library" : "Kết nối Codex"}</strong></div><span className="subtle desktop-only"><GitBranch size={13}/> main · Writer Studio</span></header>
      <div className="page-heading"><div><div className="eyebrow">AI AGENT LAB / WRITER STUDIO</div><h1>{view === "inbox" ? "Từ feedback đến thay đổi." : view === "queue" ? "Request có phạm vi rõ ràng." : view === "library" ? "Tri thức của project." : "Đưa request vào Codex."}</h1><p>{view === "inbox" ? "Ghi nhận vấn đề, làm rõ ý định và chuẩn bị request để bạn duyệt." : view === "queue" ? "Theo dõi request đã chuẩn bị, tiến trình Codex và kết quả kiểm tra." : view === "library" ? "Design, backend và database contract được ghim theo phiên bản Git." : "Codex chat chủ động lấy công việc đã duyệt qua MCP."}</p></div>{["inbox", "queue"].includes(view) && <Button className="primary" onClick={() => setCompose(true)}><Plus size={16}/>Gửi feedback</Button>}</div>
      {loadError && <div className="alert error" role="alert">{loadError}<button onClick={() => refresh().catch(e => setLoadError(e.message))}>Thử lại</button></div>}
      {["inbox", "queue"].includes(view) && <>
        <div className="overview">
          {[["Feedback", requests.length, MessageSquare, "Ý kiến được lưu"], ["Sẵn sàng", ready, ShieldCheck, "Đã duyệt phạm vi"], ["Đang thực thi", active, CircleDot, "Codex đã claim"], ["Chờ nghiệm thu", reviews, ListChecks, "Có kết quả kiểm tra"]].map(([title, count, Icon, sub]) => <div className="metric" key={title}><div><span>{title}</span><Icon size={15}/></div><strong>{count.toString().padStart(2, "0")}</strong><small>{sub}</small></div>)}
        </div>
        <div className="workflow-strip"><span><MessageSquare size={14}/> Feedback</span><ArrowRight size={13}/><span><Sparkles size={14}/> Làm rõ request</span><ArrowRight size={13}/><span><ShieldCheck size={14}/> Duyệt</span><ArrowRight size={13}/><span><FileCode2 size={14}/> Codex thực thi</span><ArrowRight size={13}/><span><Check size={14}/> Nghiệm thu</span></div>
        <div className="workspace-grid">
          <section className="request-list panel"><div className="panel-heading"><h2>{view === "inbox" ? "Inbox" : "Requests"} <span className="counter">{list.length}</span></h2><button className="icon-button" aria-label="Làm mới" onClick={() => act("refresh", refresh)}><RefreshCw size={15} className={busy === "refresh" ? "spin" : ""}/></button></div>
            <div className="list-controls"><label className="search-field"><Search size={15}/><input placeholder="Tìm feedback hoặc request…" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="Lọc trạng thái" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Tất cả trạng thái</option>{Object.entries(labels).map(([k, v]) => <option value={k} key={k}>{v}</option>)}</select></div>
            <div className="list-body">{list.length ? list.map(item => <button key={item.id} className={"request-row " + (selected === item.id ? "selected" : "")} onClick={() => choose(item.id)}><div className="row-top"><span className="mono">{item.id}</span><span className="row-date">{date(item.createdAt)}</span></div><h3>{item.title}</h3><p>{item.feedback}</p><div className="row-bottom"><Badge status={item.status}/>{item.draft && <span className="layer-label">{item.draft.layer}</span>}</div></button>) : <Empty title={query || filter !== "all" ? "Không có kết quả" : "Inbox đã sẵn sàng"}>Gửi feedback đầu tiên để bắt đầu một thay đổi có thể kiểm tra.</Empty>}</div>
          </section>
          <section className="detail panel">
            {!r ? <Empty icon={FileCode2} title="Mỗi thay đổi bắt đầu từ một ý kiến." action={<Button onClick={() => setCompose(true)}><Plus size={15}/>Gửi feedback đầu tiên</Button>}>Chọn một feedback để xem thông tin, chuẩn bị phạm vi sửa và theo dõi Codex.</Empty> : <>
              <div className="detail-heading"><div className="row-top"><span className="mono">{r.id}</span><Badge status={r.status}/></div><h2>{r.title}</h2><p>{r.author} · {date(r.createdAt)} · Writer Studio</p></div>
              <div className="tabs" role="tablist" aria-label="Chi tiết request">{[["request", "Request"], ["feedback", "Feedback gốc"], ["activity", "Hoạt động"], ["result", "Kết quả"]].map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{v}</button>)}</div>
              <div className="detail-body">
                {tab === "feedback" && <FeedbackDetail request={r} onClarify={note => act("clarify", () => api("/requests/" + r.id + "/clarify", { method: "POST", body: JSON.stringify({ note }) }), "Đã lưu bổ sung. Request cần được chuẩn bị lại.")} busy={busy}/>}
                {tab === "activity" && <div className="timeline">{detail.events.map((event, i) => <div className="timeline-event" key={i}><span className="timeline-dot"/><div><strong>{event.type.replaceAll("_", " ")}</strong><small>{event.actor} · {date(event.at)}</small>{event.detail && <p>{event.detail}</p>}</div></div>)}</div>}
                {tab === "result" && <Result request={r} admin={user.role === "admin"} busy={busy} onAccept={() => act("accept", () => api("/requests/" + r.id + "/accept", { method: "POST" }), "Đã nghiệm thu kết quả.")}/>}
                {tab === "request" && <>
                  <div className="version-card"><GitBranch size={15}/><div><span>Source và library được ghim</span><small className="mono">{r.baseCommit.slice(0, 12)} / {r.libraryVersionId.slice(0, 12)}</small></div><a href={"https://github.com/" + r.repository + "/tree/" + r.baseCommit} target="_blank" rel="noreferrer" aria-label="Mở source commit"><ArrowUpRight size={16}/></a></div>
                  {r.lease && <div className="alert"><Clock size={16}/><div><strong>{r.lease.owner} đang giữ claim</strong><p>Hết hạn {date(r.lease.expiresAt)}. Agent cần cập nhật tiến trình để gia hạn.</p></div></div>}
                  {editableStates.includes(r.status) && user.role === "admin" && <div className="analysis-card"><div><Sparkles size={18}/><div><strong>Chuẩn bị request với AI</strong><p>Đọc feedback và contract; bạn kiểm tra trước khi duyệt.</p></div></div><Button busy={busy === "analyze"} disabled={!config?.aiConfigured || Boolean(busy)} onClick={() => act("analyze", () => api("/requests/" + r.id + "/analyze", { method: "POST" }), "AI đã soạn request. Hãy kiểm tra phạm vi và tiêu chí.")}>Phân tích <ArrowRight size={14}/></Button>{!config?.aiConfigured && <small>Chưa cấu hình AI. Bạn vẫn có thể chuẩn bị request thủ công bên dưới.</small>}</div>}
                  {r.draft?.questions.length > 0 && <div className="alert warning"><AlertTriangle size={17}/><div><strong>Cần làm rõ trước khi duyệt</strong><ul>{r.draft.questions.map((q, i) => <li key={i}>{q}</li>)}</ul><button className="text-button" onClick={() => setTab("feedback")}>Bổ sung thông tin <ArrowRight size={13}/></button></div></div>}
                  {editableStates.includes(r.status) && user.role === "admin" ? <DraftEditor key={r.id + ":" + r.updatedAt} request={r} busy={busy} onSave={draft => act("save", () => api("/requests/" + r.id + "/draft", { method: "PUT", body: JSON.stringify(draft) }), "Đã lưu bản request.")}/> :
                    r.draft ? <DraftView draft={r.draft}/> : <Empty icon={Sparkles} title="Feedback đang chờ chuẩn bị">Admin sẽ phân tích feedback và xác định phạm vi thay đổi.</Empty>}
                  {r.status === "awaiting-approval" && user.role === "admin" && <div className="approval-card"><ShieldCheck size={20}/><div><strong>Duyệt để Codex có thể lấy request</strong><p>Approval áp dụng cho nội dung, phạm vi file và phiên bản hiện tại. Merge/deploy cần được xử lý riêng.</p></div><Button className="primary" busy={busy === "approve"} disabled={Boolean(busy)} onClick={() => { if (window.confirm("Duyệt phạm vi và tiêu chí của request này để Codex có thể claim?")) act("approve", () => api("/requests/" + r.id + "/approve", { method: "POST" }), "Request đã sẵn sàng cho Codex."); }}>Duyệt request</Button></div>}
                  {r.status === "approved" && <div className="approval-card"><ShieldCheck size={20}/><div><strong>Sẵn sàng cho Codex chat</strong><p>Mở repo trong Codex, kết nối MCP và dùng lệnh lấy request.</p></div><Button onClick={() => copy("Lấy request " + r.id + " từ AI Agent Lab qua MCP. Đọc pinned library, xác minh repo/HEAD, claim_request trước khi sửa. Thực thi đúng allowedPaths, chạy kiểm tra và báo kết quả về Lab. Không merge/deploy.")}><Copy size={14}/>Copy lệnh</Button></div>}
                  {user.role === "admin" && <div className="secondary-actions">
                    {!["claimed", "running", "completed", "review"].includes(r.status) && <button className="text-button" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Cập nhật base/library sẽ xóa bản request và approval cũ. Tiếp tục?")) act("rebase", () => api("/requests/" + r.id + "/rebase", { method: "POST" }), "Đã cập nhật base. Hãy chuẩn bị request lại."); }}>Cập nhật base theo library mới</button>}
                    {["claimed", "running"].includes(r.status) && <button className="text-button danger" disabled={Boolean(busy)} onClick={() => { const note = window.prompt("Chỉ mở claim khi đã xác minh agent cũ dừng. Nhập ghi chú xác minh (ít nhất 10 ký tự):"); if (note && window.confirm("Tôi xác nhận agent cũ đã dừng thực thi.")) act("release", () => api("/requests/" + r.id + "/release", { method: "POST", body: JSON.stringify({ note, agentStopped: true }) }), "Claim đã mở lại; cần duyệt lại request."); }}>Mở lại claim</button>}
                    {!["claimed", "running", "completed", "rejected"].includes(r.status) && <button className="text-button danger" disabled={Boolean(busy)} onClick={() => { const note = window.prompt("Lý do từ chối request:"); if (note) act("reject", () => api("/requests/" + r.id + "/reject", { method: "POST", body: JSON.stringify({ note }) }), "Đã từ chối request."); }}>Từ chối</button>}
                  </div>}
                </>}
              </div>
            </>}
          </section>
        </div>
      </>}
      {view === "library" && library && <LibraryView library={library} admin={user.role === "admin"} busy={busy} onSync={() => act("sync", () => api("/library/sync", { method: "POST" }), "Đã đồng bộ library. Request cũ giữ nguyên version.")}/>}
      {view === "connection" && config && <Connection config={config} copy={copy}/>}
      <footer className="page-footer"><span>AI Agent Lab</span><span>Feedback có ngữ cảnh. Thay đổi có kiểm chứng.</span></footer>
    </main>
    {compose && <Compose busy={busy} onClose={() => setCompose(false)} onCreate={async data => { const created = await act("create", () => api("/requests", { method: "POST", body: JSON.stringify(data) }), "Đã lưu feedback."); if (created) { setCompose(false); navigate("inbox"); choose(created.id); } }}/>}
    {toast && <div className={"toast " + toast.type} role="status">{toast.type === "error" ? <AlertTriangle size={17}/> : <Check size={17}/>}<span>{toast.message}</span><button className="icon-button" aria-label="Đóng thông báo" onClick={() => setToast(null)}><X size={15}/></button></div>}
  </div>;
}

function Login({ onLogin, error }) {
  const [name, setName] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(error);
  async function submit(e) { e.preventDefault(); setBusy(true); setMessage(""); try {
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error); onLogin(data.user);
  } catch (e) { setMessage(e.message); } finally { setBusy(false); } }
  return <div className="login-page"><div className="login-story"><div className="brand"><span className="brand-icon"><FlaskConical size={24}/></span><span>Agent Lab<small>AI WORKSPACE</small></span></div><div className="login-copy"><div className="eyebrow">BUILT FOR WRITER STUDIO</div><h1>Lắng nghe feedback.<br/>Chuẩn bị thay đổi.</h1><p>Một workspace để biến ý kiến của user thành request rõ ràng, được duyệt trước khi Codex thực thi.</p><div className="login-steps"><span><MessageSquare size={17}/> Feedback</span><ChevronRight size={14}/><span><ShieldCheck size={17}/> Request</span><ChevronRight size={14}/><span><FileCode2 size={17}/> Codex</span></div></div><small className="subtle">Design contract · Writer Studio</small></div><div className="login-form"><form onSubmit={submit}><span className="eyebrow">YOUR WORKSPACE</span><h2>Chào mừng trở lại.</h2><p>Đăng nhập với mật khẩu workspace được cấp.</p><label>Tên hiển thị<input required minLength={2} maxLength={80} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)} placeholder="Tên của bạn"/></label><label>Mật khẩu<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mật khẩu workspace"/></label>{message && <div className="alert error" role="alert">{message}</div>}<Button type="submit" className="primary full" busy={busy}>Vào workspace <ArrowRight size={16}/></Button><small className="login-note">Quyền admin hoặc thành viên do mật khẩu workspace xác định.</small></form></div></div>;
}

function Compose({ onClose, onCreate, busy }) {
  const modalRef = useRef(null);
  const [data, setData] = useState({ feedback: "", screen: "", reproduction: "", expected: "" });
  const field = key => ({ value: data[key], onChange: e => setData({ ...data, [key]: e.target.value }) });
  useEffect(() => { const previous = document.activeElement; const handler = e => { if (e.key === "Escape" && !busy) onClose(); if (e.key === "Tab") { const items = [...modalRef.current.querySelectorAll("button:not(:disabled), input, textarea")]; const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } }; window.addEventListener("keydown", handler); return () => { window.removeEventListener("keydown", handler); previous?.focus(); }; }, [busy]);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}><section ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="compose-title"><div className="modal-head"><div><span className="eyebrow">NEW FEEDBACK</span><h2 id="compose-title">Bạn muốn cải thiện điều gì?</h2></div><button className="icon-button" aria-label="Đóng" onClick={onClose} disabled={Boolean(busy)}><X size={20}/></button></div><form onSubmit={e => { e.preventDefault(); onCreate(data); }}><label>Feedback <span className="required">*</span><textarea autoFocus required minLength={10} maxLength={10000} rows={5} placeholder="Mô tả vấn đề bạn gặp hoặc thay đổi bạn muốn…" {...field("feedback")}/></label><label>Màn hình / chức năng<input maxLength={300} placeholder="Ví dụ: Draft — lưu bài viết" {...field("screen")}/></label><label>Cách tái hiện<textarea rows={3} maxLength={4000} placeholder="1. Mở bài viết… 2. Nhấn…" {...field("reproduction")}/></label><label>Kết quả mong muốn<textarea rows={2} maxLength={3000} placeholder="Bạn mong app hoạt động như thế nào?" {...field("expected")}/></label><div className="form-note"><ShieldCheck size={14}/>Feedback được lưu trước. Codex chỉ nhận request sau khi admin duyệt.</div><div className="modal-actions"><Button type="button" onClick={onClose} disabled={Boolean(busy)}>Hủy</Button><Button type="submit" className="primary" busy={busy === "create"} disabled={Boolean(busy)}><Send size={15}/>Lưu feedback</Button></div></form></section></div>;
}
function DraftEditor({ request, onSave, busy }) {
  const initial = request.draft || { title: request.title, problem: request.feedback, layer: "design", module: "", allowedPaths: [], acceptanceCriteria: [], questions: [], risk: "medium", migrationNotes: "" };
  const [draft, setDraft] = useState(initial);
  const [paths, setPaths] = useState(initial.allowedPaths.join("\n")), [criteria, setCriteria] = useState(initial.acceptanceCriteria.join("\n")), [questions, setQuestions] = useState(initial.questions.join("\n"));
  const field = key => ({ value: draft[key], onChange: e => setDraft({ ...draft, [key]: e.target.value }) });
  const lines = value => value.split("\n").map(v => v.trim()).filter(Boolean);
  return <form className="draft-form" onSubmit={e => { e.preventDefault(); onSave({ ...draft, allowedPaths: lines(paths), acceptanceCriteria: lines(criteria), questions: lines(questions) }); }}>
    <div className="section-heading"><h3>Request chỉnh sửa</h3><span className="subtle">Có thể chuẩn bị thủ công</span></div>
    <label>Tiêu đề<input required minLength={5} maxLength={180} {...field("title")}/></label>
    <label>Vấn đề cần xử lý<textarea required minLength={10} maxLength={6000} rows={3} {...field("problem")}/></label>
    <div className="form-grid"><label>Layer<select {...field("layer")}><option value="design">Design / UI</option><option value="backend">Backend / Workflow</option><option value="database">Database / Storage</option><option value="cross-layer">Cross-layer</option></select></label><label>Module<input required minLength={2} maxLength={100} placeholder="Ví dụ: draft" {...field("module")}/></label></div>
    <label>Phạm vi file<textarea required rows={3} value={paths} onChange={e => setPaths(e.target.value)} placeholder={"src/components/workspace/Step4Draft.tsx"}/><small>Mỗi dòng một file cụ thể. Không dùng glob hoặc đường dẫn secrets.</small></label>
    <label>Tiêu chí nghiệm thu<textarea required rows={3} value={criteria} onChange={e => setCriteria(e.target.value)} placeholder={"Kết quả đã lưu hiển thị ngay trong màn hình\nLỗi lưu giữ nguyên nội dung đang chỉnh"}/><small>Mỗi dòng một hành vi có thể kiểm tra.</small></label>
    <div className="form-grid"><label>Mức rủi ro<select {...field("risk")}><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option></select></label><label>Verification<input value="npm run check" readOnly/></label></div>
    <label>Câu hỏi cần làm rõ<textarea rows={2} value={questions} onChange={e => setQuestions(e.target.value)} placeholder="Để trống khi đã đủ thông tin; mỗi dòng một câu hỏi."/></label>
    {(draft.layer === "database" || draft.layer === "cross-layer" || draft.migrationNotes) && <label>Rollback / backfill / RLS / compatibility<textarea rows={3} {...field("migrationNotes")} required={draft.layer === "database"}/></label>}
    <div className="form-end"><small>Phạm vi và rủi ro được server kiểm tra khi lưu.</small><Button type="submit" busy={busy === "save"} disabled={Boolean(busy)}><Check size={14}/>Lưu request</Button></div>
  </form>;
}
function DraftView({ draft }) { return <div className="draft-view"><div className="section-heading"><h3>Request đã chuẩn bị</h3><span className={"risk risk-" + draft.risk}>Risk: {draft.risk}</span></div><p className="preserve">{draft.problem}</p><div className="contract-grid"><div><small>Layer</small><strong>{draft.layer}</strong></div><div><small>Module</small><strong>{draft.module}</strong></div></div><h3>Phạm vi file</h3><div className="path-list">{draft.allowedPaths.map(p => <div key={p}><FileCode2 size={14}/><code>{p}</code></div>)}</div>{draft.newFiles?.length > 0 && <p className="subtle">File mới: {draft.newFiles.join(", ")}</p>}<h3>Tiêu chí nghiệm thu</h3><ul className="criteria">{draft.acceptanceCriteria.map((c, i) => <li key={i}><Check size={14}/><span>{c}</span></li>)}</ul><h3>Verification</h3><pre>npm run check</pre>{draft.migrationNotes && <><h3>Database / compatibility</h3><p className="preserve">{draft.migrationNotes}</p></>}</div>; }
function FeedbackDetail({ request, onClarify, busy }) { const [note, setNote] = useState(""); return <div className="feedback-detail">{[["Feedback", request.feedback], ["Màn hình / chức năng", request.screen], ["Cách tái hiện", request.reproduction], ["Kết quả mong muốn", request.expected]].map(([title, value]) => <div key={title}><h3>{title}</h3><p className={"preserve " + (!value ? "subtle" : "")}>{value || "Chưa cung cấp"}</p></div>)}{editableStates.includes(request.status) && <form onSubmit={async e => { e.preventDefault(); await onClarify(note); }}><label>Bổ sung thông tin<textarea required minLength={5} maxLength={4000} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Trả lời câu hỏi hoặc bổ sung cách tái hiện…"/></label><Button type="submit" busy={busy === "clarify"} disabled={Boolean(busy)}>Lưu bổ sung</Button></form>}</div>; }
function Result({ request, admin, busy, onAccept }) { if (!request.result) return <Empty icon={ListChecks} title="Chưa có kết quả thực thi">Codex sẽ gửi diff, artifact và kết quả kiểm tra về đây sau khi thực hiện request.</Empty>; const result = request.result; return <div className="result"><div className="section-heading"><h3>Kết quả từ Codex</h3><span className="subtle">Agent-reported</span></div><p className="preserve">{result.summary}</p><a className="artifact-link" href={result.artifactUrl} target="_blank" rel="noreferrer"><GitBranch size={17}/><span>Xem PR / commit <small className="mono">{result.commit.slice(0, 12)}</small></span><ArrowUpRight size={16}/></a><h3>Kiểm tra</h3>{result.checks.map((c, i) => <div className="check-row" key={i}><span>{c.passed ? <Check size={15}/> : <X size={15}/>}</span><div><code>{c.command}</code><small>{c.passed ? "Passed" : "Failed"}</small>{c.output && <pre>{c.output}</pre>}</div></div>)}<h3>File đã thay đổi</h3><div className="path-list">{result.changedPaths.map(p => <div key={p}><FileCode2 size={14}/><code>{p}</code></div>)}</div><div className="alert"><ShieldCheck size={16}/><p>Kết quả do agent báo cáo. Kiểm tra diff và CI của PR trước khi nghiệm thu. Lab không tự merge hoặc deploy.</p></div>{request.status === "review" && admin && <Button className="primary" busy={busy === "accept"} onClick={() => { if (window.confirm("Bạn đã kiểm tra diff và hành vi theo tiêu chí nghiệm thu?")) onAccept(); }}>Nghiệm thu kết quả</Button>}</div>; }
function LibraryView({ library, admin, busy, onSync }) {
  const [doc, setDoc] = useState(library.documents[0].path), selected = library.documents.find(d => d.path === doc);
  return <div className="library-layout"><div className="library-meta panel"><div><span className="project-avatar">W</span><h2>Writer Studio Library</h2><p>{library.documents.length} canonical documents</p></div><div className="meta-row"><span>Source commit</span><a className="mono" href={"https://github.com/" + library.repository + "/tree/" + library.sourceCommit} target="_blank" rel="noreferrer">{library.sourceCommit.slice(0, 12)} <ArrowUpRight size={12}/></a></div><div className="meta-row"><span>Library version</span><code>{library.id.slice(0, 12)}</code></div><div className="meta-row"><span>Snapshot</span><span>{date(library.syncedAt)}</span></div><p className="subtle">Git giữ tài liệu gốc. Request đã tạo giữ nguyên snapshot của mình khi library được đồng bộ.</p>{admin && <Button busy={busy === "sync"} disabled={Boolean(busy)} onClick={onSync}><RefreshCw size={14}/>Đồng bộ từ GitHub</Button>}</div><div className="library-reader panel"><div className="doc-nav">{library.documents.map(d => <button className={doc === d.path ? "active" : ""} key={d.path} onClick={() => setDoc(d.path)}><FileCode2 size={14}/><span>{d.path.replace(".agent-hub/", "")}</span></button>)}</div><div className="doc-content"><div className="section-heading"><h3>{selected?.path.replace(".agent-hub/", "")}</h3><a href={"https://github.com/" + library.repository + "/blob/" + library.sourceCommit + "/" + doc} target="_blank" rel="noreferrer" className="icon-button" aria-label="Mở tài liệu trên GitHub"><ArrowUpRight size={16}/></a></div><pre>{selected?.content}</pre></div></div></div>;
}
function Connection({ config, copy }) {
  const toml = '[mcp_servers.ai_agent_lab]\nurl = "' + config.mcpUrl + '"\nbearer_token_env_var = "AI_AGENT_LAB_MCP_TOKEN"\n\n[mcp_servers.ai_agent_lab.tools.get_request]\noutput_token_limit = 20000';
  return <div className="connection-layout"><section className="settings-surface"><div className="section-heading"><div><span className="eyebrow">CODEX CONNECTION</span><h2>Một cầu nối, một hàng đợi.</h2></div><Plug size={24}/></div><p>Codex chat gọi MCP để lấy và claim request đã duyệt. App không tự khởi chạy chat.</p><div className="connection-step"><span>01</span><div><h3>Cấu hình MCP</h3><p>Thêm cấu hình này vào Codex config. Gán biến môi trường token trên máy chạy Codex bằng giá trị MCP_TOKEN của Railway.</p><div className="code-card"><button className="icon-button" onClick={() => copy(toml)} aria-label="Copy MCP config"><Copy size={15}/></button><pre>{toml}</pre></div><small>Token không được hiển thị trong app hoặc lưu trong prompt.</small></div></div><div className="connection-step"><span>02</span><div><h3>Mở repo project trong Codex</h3><p>Chọn checkout Writer Studio và xác minh đúng remote. Request ghim base commit để tránh sửa trên source khác phiên bản.</p></div></div><div className="connection-step"><span>03</span><div><h3>Lấy request đã duyệt</h3><div className="code-card"><button className="icon-button" onClick={() => copy("Lấy request đã duyệt từ AI Agent Lab qua MCP. Cho tôi xem phạm vi; xác minh repo/HEAD, claim trước khi sửa, thực thi đúng allowedPaths và báo kết quả về Lab. Không merge/deploy.")} aria-label="Copy prompt"><Copy size={15}/></button><pre>Lấy request đã duyệt từ AI Agent Lab qua MCP.{"\n"}Xác minh repo/HEAD, claim trước khi sửa,{"\n"}thực thi đúng phạm vi và báo kết quả về Lab.</pre></div></div></div></section><aside className="connection-aside panel"><ShieldCheck size={22}/><h3>Ranh giới thực thi</h3><ul className="criteria"><li><Check size={14}/>Admin duyệt trước khi claim.</li><li><Check size={14}/>Mỗi request giữ base commit và library version.</li><li><Check size={14}/>Claim ngăn các request sửa trùng phạm vi.</li><li><Check size={14}/>Mở rộng scope cần duyệt lại.</li><li><Check size={14}/>Kết quả chờ nghiệm thu, không tự deploy.</li></ul><div className="aside-divider"/><small className="eyebrow">MCP TOOLS</small><div className="tool-list">{["list_ready_requests", "get_request", "claim_request", "report_progress", "request_scope_change", "complete_request"].map(t => <code key={t}>{t}</code>)}</div><div className="aside-divider"/><p className="subtle">AI analysis: {config.aiConfigured ? "Đã cấu hình · " + config.model : "Chưa cấu hình"}</p></aside></div>;
}

