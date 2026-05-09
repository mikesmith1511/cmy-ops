'use client'
import { useState, useEffect, useCallback } from 'react'

const S: Record<string, any> = {
  bg: '#0f0f0f', surface: '#1a1a1a', surface2: '#222', border: '#2e2e2e',
  accent: '#f5c842', accent2: '#e8a020', text: '#e8e8e8', muted: '#888',
  green: '#4caf7d', red: '#e05555', blue: '#4a9eff', orange: '#f58c42'
}

function api(path: string, opts: any = {}) {
  return fetch(path, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...opts })
    .then(r => r.json())
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [tab, setTab] = useState('dashboard')
  const [territory, setTerritory] = useState('ALL')
  const [jobs, setJobs] = useState<any[]>([])
  const [helpers, setHelpers] = useState<any[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [modules, setModules] = useState<any[]>([])
  const [completions, setCompletions] = useState<any[]>([])
  const [reports, setReports] = useState<any>(null)
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [loginEmail, setLoginEmail] = useState('wildwood@cardmyyard.com')
  const [loginPw, setLoginPw] = useState('')
  const [loginError, setLoginError] = useState('')
  const [toast, setToast] = useState('')
  const [modal, setModal] = useState('')
  const [inviteResult, setInviteResult] = useState<any>(null)

  // Jobs filter state (multi-criteria filter bar on Jobs tab)
  const [fSetupFrom, setFSetupFrom] = useState('')
  const [fSetupTo, setFSetupTo] = useState('')
  const [fEventFrom, setFEventFrom] = useState('')
  const [fEventTo, setFEventTo] = useState('')
  const [fTerritories, setFTerritories] = useState<string[]>([])
  const [fTypes, setFTypes] = useState<string[]>([])
  const [fStatuses, setFStatuses] = useState<string[]>([])
  const [fHelpers, setFHelpers] = useState<string[]>([])

  // Photo review modal state - holds the job whose photo is being reviewed
  const [photoModalJob, setPhotoModalJob] = useState<any>(null)

  // Check session
  useEffect(() => {
    api('/api/auth/me').then(d => {
      if (d.role === 'admin') { setAuthed(true); loadAll() }
    }).finally(() => setChecking(false))
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const loadAll = useCallback(async () => {
    const [j, h, i, t, r] = await Promise.all([
      api('/api/jobs'), api('/api/helpers'), api('/api/invites'),
      api('/api/training'), api('/api/reports')
    ])
    if (Array.isArray(j)) setJobs(j)
    if (Array.isArray(h)) setHelpers(h)
    if (Array.isArray(i)) setInvites(i)
    if (t.modules) { setModules(t.modules); setCompletions(t.completions || []) }
    if (r.summary) setReports(r)
  }, [])

  async function doLogin() {
    setLoginError('')
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: loginEmail, password: loginPw, role: 'admin' })
    })
    if (res.ok) { setAuthed(true); loadAll() }
    else setLoginError('Invalid email or password.')
  }

  async function doLogout() {
    await api('/api/auth/logout', { method: 'POST' })
    setAuthed(false)
  }

  // ── JOB ACTIONS ──
  async function addJob(e: any) {
    e.preventDefault()
    const fd = new FormData(e.target)
    const res = await api('/api/jobs', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)) })
    if (res.id) { setJobs(p => [...p, res]); setModal(''); showToast('Job added ✓') }
  }

  async function updateJobStatus(id: number, status: string) {
    const res = await api(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    if (res.id) setJobs(p => p.map(j => j.id === id ? res : j))
  }

  async function assignHelper(jobId: number, helperId: string) {
    const res = await api(`/api/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify({ helperId: helperId ? parseInt(helperId) : null }) })
    if (res.id) setJobs(p => p.map(j => j.id === jobId ? res : j))
  }

  async function deleteJob(id: number) {
    if (!confirm('Delete this job?')) return
    await api(`/api/jobs/${id}`, { method: 'DELETE' })
    setJobs(p => p.filter(j => j.id !== id))
    showToast('Job deleted')
  }

  // ── HELPER ACTIONS ──
  async function toggleApproval(id: number, current: boolean) {
    const res = await api(`/api/helpers/${id}`, { method: 'PATCH', body: JSON.stringify({ approved: !current }) })
    if (res.id) { setHelpers(p => p.map(h => h.id === id ? res : h)); showToast(res.approved ? 'Helper approved ✓' : 'Approval removed') }
  }

  async function togglePovApproval(id: number, current: boolean) {
    const res = await api(`/api/helpers/${id}`, { method: 'PATCH', body: JSON.stringify({ villagesRealtyApproved: !current }) })
    if (res.id) { setHelpers(p => p.map(h => h.id === id ? res : h)); showToast(res.villages_realty_approved ? 'POV access granted ✓' : 'POV access revoked') }
  }

  async function deleteHelper(id: number) {
    if (!confirm('Remove this helper?')) return
    await api(`/api/helpers/${id}`, { method: 'DELETE' })
    setHelpers(p => p.filter(h => h.id !== id))
    showToast('Helper removed')
  }

  async function signOffModule(helperId: number, moduleId: number) {
    await api(`/api/helpers/${helperId}/signoff`, { method: 'POST', body: JSON.stringify({ moduleId }) })
    const t = await api('/api/training')
    if (t.completions) setCompletions(t.completions)
    showToast('Module signed off ✓')
  }

  // ── INVITE ACTIONS ──
  async function generateInvite(e: any) {
    e.preventDefault()
    const fd = new FormData(e.target)
    const res = await api('/api/invites', { method: 'POST', body: JSON.stringify({ action: 'create', ...Object.fromEntries(fd) }) })
    if (res.code) {
      setInvites(p => [res, ...p])
      const msg = `Hi ${res.name || 'there'},\n\nYou've been invited to join the Card My Yard helper team!\n\nTo get started:\n1. Visit: ${window.location.origin}/helper\n2. Click "Set Up My Account"\n3. Enter your invite code: ${res.code}\n4. Complete your profile and training modules\n\nOnce approved, you'll be able to start claiming jobs.\n\n— CMY Operations`
      setInviteResult({ code: res.code, msg })
    }
  }

  async function revokeInvite(code: string) {
    if (!confirm('Revoke this invite?')) return
    await api(`/api/invites?code=${code}`, { method: 'DELETE' })
    setInvites(p => p.filter(i => i.code !== code))
    showToast('Invite revoked')
  }

  // ── TRAINING ACTIONS ──
  async function addModule(e: any) {
    e.preventDefault()
    const fd = new FormData(e.target)
    const res = await api('/api/training', { method: 'POST', body: JSON.stringify({ action: 'create', title: fd.get('title'), description: fd.get('description'), videoUrl: fd.get('videoUrl'), required: fd.get('required') === 'yes' }) })
    if (res.id) { setModules(p => [...p, res]); setModal(''); showToast('Module added ✓') }
  }

  async function deleteModule(id: number) {
    await api(`/api/training?id=${id}`, { method: 'DELETE' })
    setModules(p => p.filter(m => m.id !== id))
    showToast('Module deleted')
  }

  // ── 1099 CSV EXPORT ──
  function export1099() {
    if (!reports?.summary?.length) { showToast('No data to export'); return }
    const header = 'Helper Name,Email,Territory,Jobs Completed,Rate Per Job,Total Compensation\n'
    const rows = reports.summary.map((r: any) =>
      `"${r.name}","${r.email}","${r.territory}",${r.jobsCompleted},${r.rate.toFixed(2)},${r.totalComp.toFixed(2)}`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `CMY_1099_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  // ── FILTERED JOBS ──
  // Combines header territory toggle (WW/TV/CL/ALL) with Jobs-tab-local
  // multi-criteria filters (date ranges, multi-select chips, helper).
  const filteredJobs = jobs.filter(j => {
    // Header territory toggle
    if (territory !== 'ALL' && j.territory !== territory) return false
    // Setup date range
    if (fSetupFrom && (!j.setup_date || j.setup_date < fSetupFrom)) return false
    if (fSetupTo && (!j.setup_date || j.setup_date > fSetupTo)) return false
    // Event date range
    if (fEventFrom && (!j.event_date || j.event_date < fEventFrom)) return false
    if (fEventTo && (!j.event_date || j.event_date > fEventTo)) return false
    // Territory multi-select
    if (fTerritories.length > 0 && !fTerritories.includes(j.territory || 'UK')) return false
    // Type multi-select
    if (fTypes.length > 0 && !fTypes.includes(j.type || 'standard')) return false
    // Status multi-select
    if (fStatuses.length > 0 && !fStatuses.includes(j.status || 'pending')) return false
    // Helper multi-select ('' = unassigned)
    if (fHelpers.length > 0) {
      const hid = j.helper_id ? String(j.helper_id) : ''
      if (!fHelpers.includes(hid)) return false
    }
    return true
  })

  // Count active filter groups (for the badge on the header)
  const activeFilterCount =
    (fSetupFrom || fSetupTo ? 1 : 0) +
    (fEventFrom || fEventTo ? 1 : 0) +
    (fTerritories.length > 0 ? 1 : 0) +
    (fTypes.length > 0 ? 1 : 0) +
    (fStatuses.length > 0 ? 1 : 0) +
    (fHelpers.length > 0 ? 1 : 0)

  // Toggle helper for multi-select chips
  function toggleInArray(arr: string[], setArr: (a: string[]) => void, val: string) {
    if (arr.includes(val)) setArr(arr.filter(x => x !== val))
    else setArr([...arr, val])
  }

  function clearAllFilters() {
    setFSetupFrom(''); setFSetupTo('')
    setFEventFrom(''); setFEventTo('')
    setFTerritories([]); setFTypes([]); setFStatuses([]); setFHelpers([])
  }

  // Date preset handlers (operate on Event Date range)
  function applyDatePreset(preset: string) {
    const today = new Date()
    const ymd = (d: Date) => d.toISOString().substring(0, 10)
    if (preset === 'today') {
      const t = ymd(today)
      setFEventFrom(t); setFEventTo(t)
    } else if (preset === 'thisWeek') {
      const start = new Date(today); start.setDate(today.getDate() - today.getDay())
      const end = new Date(start); end.setDate(start.getDate() + 6)
      setFEventFrom(ymd(start)); setFEventTo(ymd(end))
    } else if (preset === 'thisMonth') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      setFEventFrom(ymd(start)); setFEventTo(ymd(end))
    } else if (preset === 'past') {
      const yest = new Date(today); yest.setDate(today.getDate() - 1)
      setFEventFrom(''); setFEventTo(ymd(yest))
    } else if (preset === 'future') {
      setFEventFrom(ymd(today)); setFEventTo('')
    } else if (preset === 'all') {
      setFEventFrom(''); setFEventTo('')
    }
  }

  // ── CALENDAR ──
  function renderCalendar() {
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const today = new Date()
    const days = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{monthNames[calMonth]} {calYear}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnGhost} onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }}>← Prev</button>
            <button style={btnGhost} onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }}>Next →</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} style={{ textAlign: 'center', padding: 8, fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {days.map((d, i) => {
            if (!d) return <div key={i} style={{ minHeight: 80, background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 4, opacity: 0.3 }} />
            const dateStr = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
            const dayJobs = filteredJobs.filter(j => j.event_date === dateStr)
            const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear()
            return (
              <div key={i} style={{ minHeight: 80, background: S.surface2, border: `1px solid ${isToday ? S.accent : S.border}`, borderRadius: 4, padding: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isToday ? S.accent : S.muted, marginBottom: 4 }}>{d}</div>
                {dayJobs.slice(0,3).map(j => {
                  const color = j.type === 'pov' ? '#b06eff' : j.territory === 'WW' ? S.blue : j.territory === 'TV' ? S.green : S.orange
                  return <div key={j.id} style={{ padding: '2px 4px', borderRadius: 2, fontSize: 10, marginBottom: 1, background: color + '22', color, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{j.customer || j.address}</div>
                })}
                {dayJobs.length > 3 && <div style={{ fontSize: 10, color: S.muted }}>+{dayJobs.length - 3} more</div>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── STYLES ──
  const card = { background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: 20, marginBottom: 16 }
  const btn = { background: S.accent, color: '#000', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }
  const btnGhost = { background: 'transparent', color: S.muted, border: `1px solid ${S.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }
  const btnDanger = { background: 'transparent', color: S.red, border: `1px solid ${S.red}44`, borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }
  const input = { width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 6, padding: '9px 12px', color: S.text, fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box' as const }
  const label = { display: 'block', fontSize: 11, color: S.muted, marginBottom: 6, fontFamily: 'DM Mono, monospace' }

  function Badge({ t }: { t: string }) {
    const colors: any = { WW: S.blue, TV: S.green, CL: S.orange, pov: '#b06eff', pending: S.muted, claimed: S.blue, installed: S.green, complete: S.muted, standard: S.muted, custom: S.orange }
    const c = colors[t] || S.muted
    return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: 500, background: c + '22', color: c, border: `1px solid ${c}44` }}>{t}</span>
  }

  if (checking) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: S.muted }}>Loading...</div>

  // ── LOGIN SCREEN ──
  if (!authed) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ ...card, width: 380, marginBottom: 0 }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: S.accent, letterSpacing: '0.15em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 8 }}>CMY // Operations Platform</div>
        <div style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>Admin Login</div>
        <div style={{ fontSize: 12, color: S.muted, textAlign: 'center', marginBottom: 24 }}>wildwood@cardmyyard.com</div>
        {loginError && <div style={{ background: S.red + '18', border: `1px solid ${S.red}44`, color: S.red, padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>{loginError}</div>}
        <div style={{ marginBottom: 14 }}><label style={label}>Email</label><input style={input} type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></div>
        <div style={{ marginBottom: 20 }}><label style={label}>Password</label><input style={input} type="password" value={loginPw} onChange={e => setLoginPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} placeholder="Enter password" /></div>
        <button style={{ ...btn, width: '100%', padding: 12 }} onClick={doLogin}>Sign In</button>
      </div>
    </div>
  )

  // ── MAIN APP ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: S.accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>CMY // OPS PLATFORM</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {['ALL','WW','TV','CL'].map(t => (
            <span key={t} onClick={() => setTerritory(t)} style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', padding: '3px 10px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${territory === t ? S.accent : S.border}`, color: territory === t ? S.accent : S.muted, background: territory === t ? S.accent + '12' : 'transparent' }}>{t}</span>
          ))}
          <span style={{ fontSize: 12, color: S.muted }}>ADMIN</span>
          <button style={btnGhost} onClick={doLogout}>Sign Out</button>
        </div>
      </div>

      {/* Nav */}
      <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, display: 'flex', padding: '0 24px', overflowX: 'auto' }}>
        {['dashboard','calendar','jobs','queue','helpers','training','reports','settings'].map(t => (
          <div key={t} onClick={() => { setTab(t); if (t === 'reports') api('/api/reports').then(r => { if (r.summary) setReports(r) }) }} style={{ padding: '10px 18px', fontSize: 13, fontWeight: 500, color: tab === t ? S.accent : S.muted, cursor: 'pointer', borderBottom: `2px solid ${tab === t ? S.accent : 'transparent'}`, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{t}</div>
        ))}
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: 24, maxWidth: 1400, width: '100%', margin: '0 auto' }}>

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Dashboard</h2>
              <button style={btn} onClick={loadAll}>⟳ Refresh</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Jobs This Month', value: filteredJobs.filter(j => { const d = new Date(j.event_date); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear() }).length, sub: 'all territories' },
                { label: 'Active Helpers', value: helpers.filter(h => h.approved).length, sub: 'approved' },
                { label: 'Pending Queue', value: jobs.filter(j => j.type === 'custom' && j.status === 'pending').length, sub: 'custom orders' },
                { label: 'Pending Invites', value: invites.filter(i => !i.used).length, sub: 'awaiting signup' }
              ].map(s => (
                <div key={s.label} style={card}>
                  <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: S.accent, fontFamily: 'DM Mono, monospace' }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: S.muted, marginTop: 4 }}>{s.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={card}>
                <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Upcoming Jobs (7 Days)</div>
                {(() => {
                  const now = new Date()
                  const upcoming = filteredJobs.filter(j => { const d = new Date(j.event_date); const diff = (d.getTime() - now.getTime()) / 86400000; return diff >= 0 && diff <= 7 && j.status !== 'complete' }).sort((a, b) => a.event_date < b.event_date ? -1 : 1)
                  if (!upcoming.length) return <div style={{ color: S.muted, fontSize: 13 }}>No upcoming jobs.</div>
                  return upcoming.map(j => (
                    <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${S.border}` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{j.customer || j.address}</div>
                        <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace' }}>{j.event_date} · {j.address}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}><Badge t={j.territory} /><Badge t={j.status} /></div>
                    </div>
                  ))
                })()}
              </div>
              <div style={card}>
                <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Territory Breakdown</div>
                {['WW','TV','CL'].map(t => {
                  const count = jobs.filter(j => j.territory === t).length
                  const pct = jobs.length ? count / jobs.length * 100 : 0
                  return (
                    <div key={t} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><Badge t={t} /><span style={{ fontSize: 13, fontWeight: 600 }}>{count}</span></div>
                      <div style={{ height: 6, background: S.border, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: S.accent, borderRadius: 3, width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* CALENDAR */}
        {tab === 'calendar' && <div style={card}>{renderCalendar()}</div>}

        {/* JOBS */}
        {tab === 'jobs' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>
                Job Board
                {activeFilterCount > 0 && (
                  <span style={{ marginLeft: 12, fontSize: 12, fontFamily: 'DM Mono, monospace', background: S.accent, color: '#000', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                    {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                  </span>
                )}
              </h2>
              <button style={btn} onClick={() => setModal('addJob')}>+ Add Job</button>
            </div>

            {/* FILTER BAR */}
            <div style={{ ...card, padding: 16 }}>
              {/* Row 1: Date presets + clear */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4 }}>Quick:</span>
                {[['today','Today'],['thisWeek','This Week'],['thisMonth','This Month'],['past','Past'],['future','Future'],['all','All Dates']].map(([key, label]) => (
                  <button key={key} onClick={() => applyDatePreset(key)} style={{ background: 'transparent', color: S.muted, border: `1px solid ${S.border}`, borderRadius: 4, padding: '4px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', cursor: 'pointer' }}>{label}</button>
                ))}
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} style={{ marginLeft: 'auto', background: 'transparent', color: S.red, border: `1px solid ${S.red}44`, borderRadius: 4, padding: '4px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', cursor: 'pointer' }}>✕ Clear All</button>
                )}
              </div>

              {/* Row 2: Date range pickers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
                {[['Setup From', fSetupFrom, setFSetupFrom],['Setup To', fSetupTo, setFSetupTo],['Event From', fEventFrom, setFEventFrom],['Event To', fEventTo, setFEventTo]].map(([label, val, set]: any) => (
                  <div key={label}>
                    <label style={{ display: 'block', fontSize: 11, color: S.muted, marginBottom: 4, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
                    <input style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4, padding: '6px 10px', color: S.text, fontSize: 12, fontFamily: 'DM Mono, monospace', outline: 'none', boxSizing: 'border-box' as const }} type="date" value={val} onChange={(e: any) => set(e.target.value)} />
                  </div>
                ))}
              </div>

              {/* Row 3: Territory + Type chips */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: S.muted, marginBottom: 6, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Territory</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['WW','TV','CL','UK'].map(t => {
                      const active = fTerritories.includes(t)
                      return <button key={t} onClick={() => toggleInArray(fTerritories, setFTerritories, t)} style={{ background: active ? S.accent : 'transparent', color: active ? '#000' : S.muted, border: `1px solid ${active ? S.accent : S.border}`, borderRadius: 4, padding: '4px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: active ? 700 : 400, cursor: 'pointer' }}>{t}</button>
                    })}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: S.muted, marginBottom: 6, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Type</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['standard','pov'].map(t => {
                      const active = fTypes.includes(t)
                      return <button key={t} onClick={() => toggleInArray(fTypes, setFTypes, t)} style={{ background: active ? S.accent : 'transparent', color: active ? '#000' : S.muted, border: `1px solid ${active ? S.accent : S.border}`, borderRadius: 4, padding: '4px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: active ? 700 : 400, cursor: 'pointer' }}>{t}</button>
                    })}
                  </div>
                </div>
              </div>

              {/* Row 4: Status + Helper chips */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: S.muted, marginBottom: 6, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['pending','claimed','installed','complete','cancelled'].map(s => {
                      const active = fStatuses.includes(s)
                      return <button key={s} onClick={() => toggleInArray(fStatuses, setFStatuses, s)} style={{ background: active ? S.accent : 'transparent', color: active ? '#000' : S.muted, border: `1px solid ${active ? S.accent : S.border}`, borderRadius: 4, padding: '4px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: active ? 700 : 400, cursor: 'pointer' }}>{s}</button>
                    })}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: S.muted, marginBottom: 6, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Helper</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => toggleInArray(fHelpers, setFHelpers, '')} style={{ background: fHelpers.includes('') ? S.accent : 'transparent', color: fHelpers.includes('') ? '#000' : S.muted, border: `1px solid ${fHelpers.includes('') ? S.accent : S.border}`, borderRadius: 4, padding: '4px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: fHelpers.includes('') ? 700 : 400, cursor: 'pointer' }}>Unassigned</button>
                    {helpers.map(h => {
                      const v = String(h.id)
                      const active = fHelpers.includes(v)
                      return <button key={h.id} onClick={() => toggleInArray(fHelpers, setFHelpers, v)} style={{ background: active ? S.accent : 'transparent', color: active ? '#000' : S.muted, border: `1px solid ${active ? S.accent : S.border}`, borderRadius: 4, padding: '4px 10px', fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: active ? 700 : 400, cursor: 'pointer' }}>{h.name}</button>
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* RESULT COUNTER */}
            <div style={{ fontSize: 12, color: S.muted, marginBottom: 12, fontFamily: 'DM Mono, monospace' }}>
              Showing {filteredJobs.length} of {jobs.length} jobs
            </div>

            {/* TABLE */}
            <div style={card}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>{['Setup Date','Event Date','Kind','Address','Customer','Territory','Type','Status','Helper','Photo','Actions'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: S.muted, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${S.border}` }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {filteredJobs.length === 0 && (
                      <tr><td colSpan={11} style={{ textAlign: 'center', padding: 32, color: S.muted }}>No jobs match the current filters.</td></tr>
                    )}
                    {filteredJobs.sort((a,b) => (a.event_date||'') < (b.event_date||'') ? -1 : 1).map(j => (
                      <tr key={j.id}>
                        <td style={{ padding: 12, fontFamily: 'DM Mono, monospace', fontSize: 12, borderBottom: `1px solid ${S.border}` }}>{j.setup_date || '—'}</td>
                        <td style={{ padding: 12, fontFamily: 'DM Mono, monospace', fontSize: 12, borderBottom: `1px solid ${S.border}` }}>{j.event_date || '—'}</td>
                        <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}>
                          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.1em', padding: '3px 7px', borderRadius: 4, background: j.kind === 'pick' ? S.orange + '22' : S.blue + '22', color: j.kind === 'pick' ? S.orange : S.blue, border: `1px solid ${j.kind === 'pick' ? S.orange : S.blue}55` }}>
                            {j.kind === 'pick' ? 'PICK' : 'DROP'}
                          </span>
                        </td>
                        <td style={{ padding: 12, fontSize: 12, maxWidth: 180, borderBottom: `1px solid ${S.border}` }}>{j.address}</td>
                        <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}>{j.customer || '—'}</td>
                        <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}><Badge t={j.territory} /></td>
                        <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}><Badge t={j.type} /></td>
                        <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}>
                          <select style={{ background: S.bg, border: `1px solid ${S.border}`, color: S.text, padding: '4px 8px', fontSize: 11, borderRadius: 4 }} value={j.status} onChange={e => updateJobStatus(j.id, e.target.value)}>
                            {['pending','claimed','installed','complete','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}>
                          <select style={{ background: S.bg, border: `1px solid ${S.border}`, color: S.text, padding: '4px 8px', fontSize: 11, borderRadius: 4 }} value={j.helper_id || ''} onChange={e => assignHelper(j.id, e.target.value)}>
                            <option value="">Unassigned</option>
                            {helpers.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}>
                          {j.photo_url ? (
                            <img
                              src={j.photo_url}
                              alt="Install"
                              onClick={() => setPhotoModalJob(j)}
                              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, border: `1px solid ${S.border}`, cursor: 'pointer' }}
                            />
                          ) : (
                            <span style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}><button style={btnDanger} onClick={() => deleteJob(j.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* QUEUE */}
        {tab === 'queue' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Custom Order Queue</h2>
            <div style={{ background: S.blue + '12', border: `1px solid ${S.blue}44`, color: S.blue, padding: '12px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>Custom orders require design review before scheduling.</div>
            {jobs.filter(j => j.type === 'custom').map(j => (
              <div key={j.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{j.customer} — {j.address}</div>
                    <div style={{ fontSize: 12, color: S.muted, marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>{j.event_date}</div>
                    <div style={{ fontSize: 13 }}>{j.details}</div>
                    <div style={{ fontSize: 12, color: S.muted, marginTop: 6 }}>{j.contact}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <Badge t={j.territory} /><Badge t={j.status} />
                    <button style={btn} onClick={() => updateJobStatus(j.id, 'claimed')}>Mark Ready</button>
                  </div>
                </div>
              </div>
            ))}
            {!jobs.filter(j => j.type === 'custom').length && <div style={{ ...card, textAlign: 'center', color: S.muted, padding: 40 }}>No custom orders in queue.</div>}
          </div>
        )}

        {/* HELPERS */}
        {tab === 'helpers' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Helper Management</h2>
              <button style={btn} onClick={() => { setInviteResult(null); setModal('invite') }}>✉ Invite Helper</button>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Active Helpers</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>{['Name','Email','Phone','Territory','Status','Training','Jobs','Approved','POV','Actions'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: S.muted, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${S.border}` }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {!helpers.length && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: S.muted }}>No helpers yet. Send invites to get started.</td></tr>}
                    {helpers.map(h => {
                      const helperCompletions = completions.filter((c: any) => c.helper_id === h.id)
                      const signedOff = helperCompletions.filter((c: any) => c.signed_off_at).length
                      return (
                        <tr key={h.id}>
                          <td style={{ padding: 12, fontWeight: 600, borderBottom: `1px solid ${S.border}` }}>{h.name}</td>
                          <td style={{ padding: 12, fontSize: 12, color: S.muted, borderBottom: `1px solid ${S.border}` }}>{h.email || '—'}</td>
                          <td style={{ padding: 12, fontSize: 12, color: S.muted, borderBottom: `1px solid ${S.border}` }}>{h.phone || '—'}</td>
                          <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}><Badge t={h.territory} /></td>
                          <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}><span style={{ fontSize: 12, color: h.approved ? S.green : S.accent }}>{h.approved ? '✓ Active' : 'Pending'}</span></td>
                          <td style={{ padding: 12, fontSize: 12, borderBottom: `1px solid ${S.border}` }}>
                            {signedOff}/{modules.length} signed off
                            {modules.length > 0 && (
                              <div style={{ marginTop: 4 }}>
                                {modules.map(m => {
                                  const comp = helperCompletions.find((c: any) => c.module_id === m.id)
                                  return (
                                    <button key={m.id} onClick={() => signOffModule(h.id, m.id)} style={{ fontSize: 10, marginRight: 4, padding: '2px 6px', borderRadius: 3, background: comp?.signed_off_at ? S.green + '22' : S.border, color: comp?.signed_off_at ? S.green : S.muted, border: 'none', cursor: 'pointer' }}>
                                      {m.title.slice(0, 12)}{comp?.signed_off_at ? ' ✓' : ''}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: 12, fontFamily: 'DM Mono, monospace', borderBottom: `1px solid ${S.border}` }}>{h.jobs_done}</td>
                          <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}>
                            <button style={{ ...btnGhost, background: h.approved ? S.accent : 'transparent', color: h.approved ? '#000' : S.muted, fontSize: 11, padding: '4px 10px' }} onClick={() => toggleApproval(h.id, h.approved)}>
                              {h.approved ? '✓ Approved' : 'Approve'}
                            </button>
                          </td>
                          <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}>
                            <button style={{ ...btnGhost, background: h.villages_realty_approved ? '#b06eff' : 'transparent', color: h.villages_realty_approved ? '#fff' : S.muted, fontSize: 11, padding: '4px 10px', borderColor: h.villages_realty_approved ? '#b06eff' : S.border }} onClick={() => togglePovApproval(h.id, h.villages_realty_approved)}>
                              {h.villages_realty_approved ? '✓ Granted' : 'Grant'}
                            </button>
                          </td>
                          <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}><button style={btnDanger} onClick={() => deleteHelper(h.id)}>✕</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Pending Invites</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>{['Code','Name','Email','Territory','Sent','Actions'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: S.muted, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${S.border}` }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {!invites.filter(i => !i.used).length && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: S.muted }}>No pending invites.</td></tr>}
                    {invites.filter(i => !i.used).map(i => (
                      <tr key={i.code}>
                        <td style={{ padding: 12, fontFamily: 'DM Mono, monospace', fontSize: 13, letterSpacing: '0.08em', borderBottom: `1px solid ${S.border}` }}>{i.code}</td>
                        <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}>{i.name || '—'}</td>
                        <td style={{ padding: 12, fontSize: 12, color: S.muted, borderBottom: `1px solid ${S.border}` }}>{i.email || '—'}</td>
                        <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}><Badge t={i.territory} /></td>
                        <td style={{ padding: 12, fontSize: 12, color: S.muted, fontFamily: 'DM Mono, monospace', borderBottom: `1px solid ${S.border}` }}>{i.created_at?.slice(0,10)}</td>
                        <td style={{ padding: 12, borderBottom: `1px solid ${S.border}` }}><button style={btnDanger} onClick={() => revokeInvite(i.code)}>Revoke</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TRAINING */}
        {tab === 'training' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Training Modules</h2>
              <button style={btn} onClick={() => setModal('addModule')}>+ Add Module</button>
            </div>
            {!modules.length && <div style={{ ...card, textAlign: 'center', color: S.muted, padding: 40 }}>No training modules defined.</div>}
            {modules.map((m, i) => (
              <div key={m.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Module {i + 1}: {m.title}</div>
                    <div style={{ fontSize: 13, color: S.muted, marginBottom: 8 }}>{m.description || ''}</div>
                    {m.video_url ? <a href={m.video_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: S.blue }}>▶ Watch Video</a> : <span style={{ fontSize: 12, color: S.muted }}>No video URL set</span>}
                    {m.required && <span style={{ marginLeft: 8, fontSize: 11, color: S.accent, fontFamily: 'DM Mono, monospace' }}>REQUIRED</span>}
                  </div>
                  <button style={btnDanger} onClick={() => deleteModule(m.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* REPORTS */}
        {tab === 'reports' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Reports</h2>
              <button style={{ ...btn, background: S.green }} onClick={export1099}>⬇ Export 1099 CSV</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={card}>
                <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Jobs by Territory</div>
                {reports ? ['WW','TV','CL'].map(t => {
                  const count = (reports.territories || []).find((r: any) => r.territory === t)?.total || 0
                  const total = (reports.territories || []).reduce((s: number, r: any) => s + r.total, 0)
                  return (
                    <div key={t} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><Badge t={t} /><span style={{ fontSize: 13, fontWeight: 600 }}>{count}</span></div>
                      <div style={{ height: 6, background: S.border, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: S.accent, borderRadius: 3, width: `${total ? count / total * 100 : 0}%` }} />
                      </div>
                    </div>
                  )
                }) : <div style={{ color: S.muted, fontSize: 13 }}>No data.</div>}
              </div>
              <div style={card}>
                <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Helper Compensation</div>
                {reports?.summary?.length ? reports.summary.map((r: any) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${S.border}` }}>
                    <div><div style={{ fontWeight: 500 }}>{r.name}</div><div style={{ fontSize: 11, color: S.muted }}>{r.email}</div></div>
                    <span style={{ fontFamily: 'DM Mono, monospace', color: S.green }}>${r.totalComp.toFixed(2)}</span>
                  </div>
                )) : <div style={{ color: S.muted, fontSize: 13 }}>No completed jobs yet.</div>}
              </div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Monthly Volume</div>
              {reports?.monthly ? Object.entries(reports.monthly).sort().map(([m, c]: any) => (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${S.border}` }}>
                  <span style={{ fontFamily: 'DM Mono, monospace' }}>{m}</span>
                  <span style={{ fontWeight: 600 }}>{c} jobs</span>
                </div>
              )) : <div style={{ color: S.muted, fontSize: 13 }}>No data.</div>}
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Settings</h2>
            <div style={card}>
              <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Helper Portal URL</div>
              <div style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 6, padding: 14, fontFamily: 'DM Mono, monospace', fontSize: 13, color: S.accent, wordBreak: 'break-all' }}>{typeof window !== 'undefined' ? window.location.origin + '/helper' : ''}</div>
              <div style={{ fontSize: 12, color: S.muted, marginTop: 8 }}>Share this URL with helpers so they can create accounts and access their portal.</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Admin Password</div>
              <div style={{ fontSize: 13, color: S.muted }}>Admin password is managed via Vercel environment variable <span style={{ fontFamily: 'DM Mono, monospace', color: S.accent }}>ADMIN_PASSWORD_HASH</span>. To change it, generate a new bcrypt hash and update the env var in your Vercel project settings.</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Territory Zip Codes</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  { label: 'Clermont (CL)', value: '34711, 34714, 34715, 34736, 34737, 34756, 34705, 34753' },
                  { label: 'Wildwood (WW)', value: '32162, 32163, 34484, 34731, 34785, 33585, 33513, 33514, 33538' },
                  { label: 'Tavares (TV)', value: 'All other territory zips' }
                ].map(z => (
                  <div key={z.label}>
                    <label style={label}>{z.label}</label>
                    <textarea readOnly defaultValue={z.value} style={{ ...input, fontSize: 11, fontFamily: 'DM Mono, monospace', height: 80, resize: 'none' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      {modal && (
        <div onClick={e => { if (e.target === e.currentTarget) setModal('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10, padding: 28, width: 520, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' }}>

            {/* Add Job */}
            {modal === 'addJob' && (
              <form onSubmit={addJob}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Add Job</div>
                {[['setupDate','Setup Date','date'],['eventDate','Event Date','date'],['address','Address','text'],['customer','Customer Name','text'],['contact','Contact Info','text']].map(([name, lbl, type]) => (
                  <div key={name} style={{ marginBottom: 14 }}><label style={label}>{lbl}</label><input style={input} type={type} name={name} /></div>
                ))}
                <div style={{ marginBottom: 14 }}><label style={label}>Order Details</label><textarea name="details" style={{ ...input, height: 80 }} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div><label style={label}>Territory</label><select name="territory" style={input}><option value="WW">Wildwood</option><option value="TV">Tavares</option><option value="CL">Clermont</option></select></div>
                  <div><label style={label}>Type</label><select name="type" style={input}><option value="standard">Standard</option><option value="pov">POV / Realty</option><option value="custom">Custom</option></select></div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" style={btnGhost} onClick={() => setModal('')}>Cancel</button>
                  <button type="submit" style={btn}>Add Job</button>
                </div>
              </form>
            )}

            {/* Invite Helper */}
            {modal === 'invite' && (
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Invite Helper</div>
                {!inviteResult ? (
                  <form onSubmit={generateInvite}>
                    <div style={{ background: S.blue + '12', border: `1px solid ${S.blue}44`, color: S.blue, padding: '12px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>An invite code will be generated. Send it with your helper portal link.</div>
                    {[['name','Helper Name (optional)','text'],['email','Helper Email (optional)','email']].map(([name,lbl,type]) => (
                      <div key={name} style={{ marginBottom: 14 }}><label style={label}>{lbl}</label><input style={input} type={type} name={name} /></div>
                    ))}
                    <div style={{ marginBottom: 14 }}><label style={label}>Assign Territory</label><select name="territory" style={input}><option value="WW">Wildwood</option><option value="TV">Tavares</option><option value="CL">Clermont</option><option value="ALL">All Territories</option></select></div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button type="button" style={btnGhost} onClick={() => setModal('')}>Cancel</button>
                      <button type="submit" style={btn}>Generate Invite</button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <div style={{ marginBottom: 12 }}><label style={label}>Invite Code (one-time use)</label><div style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 6, padding: 14, fontFamily: 'DM Mono, monospace', fontSize: 20, color: S.accent, textAlign: 'center', letterSpacing: '0.2em' }}>{inviteResult.code}</div></div>
                    <div style={{ marginBottom: 12 }}><label style={label}>Share this message</label><textarea readOnly value={inviteResult.msg} style={{ ...input, fontSize: 12, height: 200 }} /></div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button style={btnGhost} onClick={() => navigator.clipboard.writeText(inviteResult.msg).then(() => showToast('Copied ✓'))}>Copy Message</button>
                      <button style={btn} onClick={() => setModal('')}>Done</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Add Module */}
            {modal === 'addModule' && (
              <form onSubmit={addModule}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Add Training Module</div>
                <div style={{ marginBottom: 14 }}><label style={label}>Module Title</label><input style={input} type="text" name="title" required /></div>
                <div style={{ marginBottom: 14 }}><label style={label}>Description</label><textarea name="description" style={{ ...input, height: 80 }} /></div>
                <div style={{ marginBottom: 14 }}><label style={label}>Video URL</label><input style={input} type="url" name="videoUrl" placeholder="https://..." /></div>
                <div style={{ marginBottom: 14 }}><label style={label}>Required Before First Job?</label><select name="required" style={input}><option value="yes">Yes</option><option value="no">No</option></select></div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" style={btnGhost} onClick={() => setModal('')}>Cancel</button>
                  <button type="submit" style={btn}>Add Module</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Photo Review Modal */}
      {photoModalJob && (
        <div onClick={() => setPhotoModalJob(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: 20, maxWidth: 700, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Install Photo</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{photoModalJob.address}</div>
                <div style={{ fontSize: 12, color: S.muted, fontFamily: 'DM Mono, monospace', marginTop: 4 }}>
                  Event: {photoModalJob.event_date} · Setup: {photoModalJob.setup_date} · Status: {photoModalJob.status}
                </div>
              </div>
              <button onClick={() => setPhotoModalJob(null)} style={{ background: 'transparent', border: 'none', color: S.muted, fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
            </div>

            <img src={photoModalJob.photo_url} alt="Install" style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 6, border: `1px solid ${S.border}`, marginBottom: 16, background: '#000' }} />

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <a href={photoModalJob.photo_url} target="_blank" rel="noreferrer" style={{ background: 'transparent', color: S.muted, border: `1px solid ${S.border}`, borderRadius: 6, padding: '8px 16px', fontSize: 13, textDecoration: 'none' }}>Open Full Size</a>
              {photoModalJob.status !== 'complete' && (
                <button
                  style={{ background: S.green, color: '#000', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  onClick={async () => {
                    await updateJobStatus(photoModalJob.id, 'complete')
                    setPhotoModalJob(null)
                  }}
                >
                  ✓ Approve & Mark Complete
                </button>
              )}
              {photoModalJob.status === 'complete' && (
                <span style={{ fontSize: 13, color: S.green, alignSelf: 'center' }}>✓ Already complete</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: S.surface, border: `1px solid ${S.green}`, color: S.green, padding: '12px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, zIndex: 999 }}>{toast}</div>
      )}
    </div>
  )
}
