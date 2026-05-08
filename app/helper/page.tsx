'use client'
import { useState, useEffect, useMemo } from 'react'

const S: Record<string, any> = {
  bg: '#0f0f0f', surface: '#1a1a1a', surface2: '#222', border: '#2e2e2e',
  accent: '#f5c842', accent2: '#e8a020', text: '#e8e8e8', muted: '#888',
  green: '#4caf7d', red: '#e05555', blue: '#4a9eff', orange: '#f58c42'
}

const HOME_OFFICE = '711 S Hwy 27, Clermont, FL 34714'

function api(path: string, opts: any = {}) {
  return fetch(path, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...opts })
    .then(r => r.json())
}

// Helper: detect pay scale from job
function isVillagesPay(j: any): boolean {
  if (j.type === 'pov') return true
  const addr = (j.address || '').toLowerCase()
  return addr.includes('the villages') || addr.includes('middleton') || addr.includes('lady lake')
}

// Helper: compute pay for a single job (drop + pickup combined, full job)
function jobPay(j: any, payOverride?: number): number {
  if (payOverride) return payOverride
  return isVillagesPay(j) ? 40 : 30
}

// Helper: extract city from address
function extractCity(address: string): string {
  if (!address) return ''
  const a = address.toLowerCase()
  if (a.includes('the villages')) return 'The Villages'
  if (a.includes('middleton')) return 'Middleton'
  if (a.includes('lady lake')) return 'Lady Lake'
  if (a.includes('wildwood')) return 'Wildwood'
  if (a.includes('oxford')) return 'Oxford'
  if (a.includes('sumterville')) return 'Sumterville'
  if (a.includes('tavares')) return 'Tavares'
  if (a.includes('mount dora')) return 'Mount Dora'
  if (a.includes('eustis')) return 'Eustis'
  if (a.includes('leesburg')) return 'Leesburg'
  if (a.includes('clermont')) return 'Clermont'
  if (a.includes('groveland')) return 'Groveland'
  if (a.includes('howey')) return 'Howey-in-the-Hills'
  // Fallback: try regex for "City, FL"
  const m = address.match(/,\s*([A-Z][a-zA-Z\s\-]+?),?\s+FL/)
  return m ? m[1].trim() : 'Unknown'
}

// Helper: format date for display
function fmtDate(d: string): string {
  if (!d) return '—'
  const dt = new Date(d + 'T12:00:00')
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Helper: format date as YYYY-MM for grouping
function monthKey(d: string): string {
  if (!d) return ''
  return d.substring(0, 7) // "2026-05-10" -> "2026-05"
}

// Helper: format month key as readable label
function monthLabel(key: string): string {
  if (!key) return ''
  const [y, m] = key.split('-')
  const dt = new Date(parseInt(y), parseInt(m) - 1, 1)
  return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function HelperPage() {
  const [screen, setScreen] = useState<'landing'|'login'|'setup1'|'setup2'|'setup3'>('landing')
  const [tab, setTab] = useState('my-jobs')
  const [helper, setHelper] = useState<any>(null)
  const [checking, setChecking] = useState(true)
  const [jobs, setJobs] = useState<any[]>([])
  const [availableJobs, setAvailableJobs] = useState<any[]>([])
  const [modules, setModules] = useState<any[]>([])
  const [completions, setCompletions] = useState<any[]>([])
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [inviteData, setInviteData] = useState<any>(null)

  // Login form
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPw, setLoginPw] = useState('')

  // Setup form
  const [setupCode, setSetupCode] = useState('')
  const [setupName, setSetupName] = useState('')
  const [setupEmail, setSetupEmail] = useState('')
  const [setupPhone, setSetupPhone] = useState('')
  const [setupPw, setSetupPw] = useState('')
  const [setupPw2, setSetupPw2] = useState('')

  // FEATURE 1: Available Jobs filters
  const [availSort, setAvailSort] = useState<'soonest'|'latest'|'location'>('soonest')
  const [availTerritory, setAvailTerritory] = useState<'ALL'|'WW'|'TV'|'CL'|'UK'>('ALL')
  const [availFutureOnly, setAvailFutureOnly] = useState(true)

  // FEATURE 2: Reports state
  const today = new Date()
  const sixteenAgo = new Date(today.getFullYear(), today.getMonth() - 15, 1) // 16 months back
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [reportFrom, setReportFrom] = useState(startOfMonth.toISOString().substring(0, 10))
  const [reportTo, setReportTo] = useState(today.toISOString().substring(0, 10))
  const [reportData, setReportData] = useState<any[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const reportMin = sixteenAgo.toISOString().substring(0, 10)

  // FEATURE 3: Route state
  const [route, setRoute] = useState<any>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [routeDate, setRouteDate] = useState<string>('') // empty = auto-pick

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    api('/api/auth/me').then(d => {
      if (d.role === 'helper') {
        setHelper({ id: d.id, name: d.name, email: d.email, approved: d.approved, territory: d.territory, pay_override: d.pay_override })
        loadPortal(d.id)
      }
    }).finally(() => setChecking(false))
  }, [])

  async function loadPortal(helperId?: number) {
    const id = helperId || helper?.id
    const [myJobs, avail, training] = await Promise.all([
      api('/api/jobs'),
      api('/api/jobs?type=available'),
      api('/api/training')
    ])
    if (Array.isArray(myJobs)) setJobs(myJobs)
    if (Array.isArray(avail)) setAvailableJobs(avail)
    if (training.modules) { setModules(training.modules); setCompletions(training.completions || []) }
  }

  async function doLogin() {
    setError('')
    const res = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: loginEmail, password: loginPw, role: 'helper' }) })
    if (res.ok) { setHelper(res.helper); loadPortal(res.helper.id) }
    else setError('Email or password is incorrect.')
  }

  async function validateCode() {
    setError('')
    const res = await api('/api/invites', { method: 'POST', body: JSON.stringify({ action: 'validate', code: setupCode }) })
    if (res.valid) { setInviteData(res); if (res.name) setSetupName(res.name); if (res.email) setSetupEmail(res.email); setScreen('setup2') }
    else setError('Invalid or already used invite code. Contact your admin.')
  }

  async function completeSetup() {
    setError('')
    if (setupPw.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (setupPw !== setupPw2) { setError('Passwords do not match.'); return }
    const res = await api('/api/invites', {
      method: 'POST',
      body: JSON.stringify({ action: 'signup', code: setupCode, name: setupName, email: setupEmail, phone: setupPhone, password: setupPw })
    })
    if (res.ok) {
      const loginRes = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: setupEmail, password: setupPw, role: 'helper' }) })
      if (loginRes.ok) { setHelper(loginRes.helper); setScreen('setup3') }
    } else setError(res.error || 'Something went wrong.')
  }

  async function goToPortal() {
    await loadPortal()
    setScreen('landing')
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    setHelper(null); setScreen('landing')
  }

  async function claimJob(jobId: number) {
    const res = await api(`/api/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify({ action: 'claim' }) })
    if (res.id) { showToast('Job claimed ✓'); loadPortal() }
    else showToast(res.error || 'Could not claim job.')
  }

  async function markInstalled(jobId: number) {
    const res = await api(`/api/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify({ action: 'installed' }) })
    if (res.id) { showToast('Marked as installed ✓'); loadPortal() }
  }

  async function markModuleDone(moduleId: number) {
    const res = await api('/api/training', { method: 'POST', body: JSON.stringify({ action: 'complete', moduleId }) })
    if (res.id || res.helper_id) { showToast('Module marked complete ✓'); loadPortal() }
  }

  // FEATURE 2: Run report
  async function runReport() {
    setReportLoading(true)
    try {
      // /api/jobs (without type) returns ALL helper's jobs regardless of status.
      // We filter by date range client-side. If volume becomes huge we can add
      // server-side date params to /api/jobs later.
      const allJobs = await api('/api/jobs')
      const list = Array.isArray(allJobs) ? allJobs : []
      const from = new Date(reportFrom + 'T00:00:00')
      const to = new Date(reportTo + 'T23:59:59')
      const filtered = list.filter((j: any) => {
        if (!j.event_date) return false
        const d = new Date(j.event_date + 'T12:00:00')
        return d >= from && d <= to
      })
      setReportData(filtered)
    } catch (e) {
      showToast('Report failed. Try again.')
    }
    setReportLoading(false)
  }

  // FEATURE 2: CSV export
  function exportReportCsv() {
    if (!reportData.length) { showToast('No data to export.'); return }
    const headers = ['Date', 'Address', 'City', 'Pay Scale', 'Status', 'Earned']
    const rows = reportData.map(j => {
      const pay = jobPay(j, helper?.pay_override)
      const scale = isVillagesPay(j) ? 'Villages ($40)' : 'Standard ($30)'
      return [
        j.event_date || '',
        (j.address || '').replace(/"/g, '""'),
        extractCity(j.address || ''),
        scale,
        j.status || '',
        '$' + pay.toFixed(2)
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cmy-helper-report-${reportFrom}-to-${reportTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // FEATURE 3: Build route (date-aware, server returns drops + pickups separately)
  async function buildRoute(targetDate?: string) {
    setRouteLoading(true)
    setRouteError('')
    try {
      const res = await api('/api/route', {
        method: 'POST',
        body: JSON.stringify(targetDate ? { date: targetDate } : {})
      })
      if (res.ok && res.route) {
        setRoute(res.route)
        // Sync the date picker to whatever the server picked (or what we asked for)
        if (res.route.date) setRouteDate(res.route.date)
      } else {
        setRouteError(res.error || 'Route build failed.')
        setRoute(null)
      }
    } catch (e: any) {
      setRouteError(e.message || 'Route build failed.')
      setRoute(null)
    }
    setRouteLoading(false)
  }

  // Auto-load route when Route tab is opened (first time only per session)
  useEffect(() => {
    if (tab === 'route' && !route && !routeLoading && helper?.approved) {
      buildRoute()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, helper?.approved])

  // Styles
  const card = { background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: 20, marginBottom: 16 }
  const btn = { background: S.accent, color: '#000', border: 'none', borderRadius: 6, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', width: '100%' as const }
  const btnSm = { background: S.accent, color: '#000', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }
  const btnGhost = { background: 'transparent', color: S.muted, border: `1px solid ${S.border}`, borderRadius: 6, padding: '10px 20px', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', width: '100%' as const }
  const input = { width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 6, padding: '10px 14px', color: S.text, fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box' as const }
  const lbl = { display: 'block', fontSize: 11, color: S.muted, marginBottom: 6, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }
  const select = { ...input, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }

  function Badge({ t }: { t: string }) {
    const colors: any = { WW: S.blue, TV: S.green, CL: S.orange, UK: S.muted, pending: S.muted, claimed: S.blue, installed: S.green, complete: S.muted }
    const c = colors[t] || S.muted
    return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: 500, background: c + '22', color: c, border: `1px solid ${c}44` }}>{t}</span>
  }

  // FEATURE 1: filter + sort available jobs (memoized)
  const filteredAvailable = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    let out = [...availableJobs]
    if (availFutureOnly) {
      out = out.filter(j => {
        if (!j.event_date) return false
        const d = new Date(j.event_date + 'T12:00:00')
        return d >= now
      })
    }
    if (availTerritory !== 'ALL') {
      out = out.filter(j => (j.territory || 'UK') === availTerritory)
    }
    out.sort((a, b) => {
      if (availSort === 'soonest') return (a.event_date || '') < (b.event_date || '') ? -1 : 1
      if (availSort === 'latest') return (a.event_date || '') > (b.event_date || '') ? -1 : 1
      if (availSort === 'location') {
        return extractCity(a.address || '').localeCompare(extractCity(b.address || ''))
      }
      return 0
    })
    return out
  }, [availableJobs, availSort, availTerritory, availFutureOnly])

  // Portal pay calc
  const myCompleted = jobs.filter(j => j.status === 'complete').length
  const _now = new Date()
  const _thisMonth = _now.getMonth()
  const _thisYear = _now.getFullYear()
  const estPay = helper?.pay_override
    ? jobs.filter(j => j.status === 'complete').length * helper.pay_override
    : jobs
        .filter(j => {
          if (!j.event_date) return false
          const d = new Date(j.event_date + 'T12:00:00')
          return d.getMonth() === _thisMonth && d.getFullYear() === _thisYear
        })
        .reduce((sum, j) => sum + jobPay(j, helper?.pay_override), 0)

  // FEATURE 2: Group report data by month for display
  const reportByMonth = useMemo(() => {
    const groups: Record<string, any[]> = {}
    reportData.forEach(j => {
      const k = monthKey(j.event_date || '')
      if (!groups[k]) groups[k] = []
      groups[k].push(j)
    })
    const keys = Object.keys(groups).sort().reverse()
    return keys.map(k => ({
      key: k,
      label: monthLabel(k),
      jobs: groups[k].sort((a, b) => (a.event_date || '') > (b.event_date || '') ? -1 : 1),
      total: groups[k].reduce((s, j) => s + jobPay(j, helper?.pay_override), 0),
      count: groups[k].length
    }))
  }, [reportData, helper?.pay_override])

  const reportTotal = reportData.reduce((s, j) => s + jobPay(j, helper?.pay_override), 0)

  if (checking) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: S.muted }}>Loading...</div>

  // Auth box wrapper
  const authBox = (children: any) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
      <div style={{ ...card, width: 400, marginBottom: 0 }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: S.accent, letterSpacing: '0.15em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 4 }}>Card My Yard</div>
        <div style={{ fontSize: 12, color: S.muted, textAlign: 'center', marginBottom: 24 }}>Helper Portal</div>
        {error && <div style={{ background: S.red + '18', border: `1px solid ${S.red}44`, color: S.red, padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>{error}</div>}
        {children}
      </div>
    </div>
  )

  if (!helper && screen === 'landing') return authBox(
    <>
      <div style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 24 }}>Welcome</div>
      <button style={btn} onClick={() => { setError(''); setScreen('login') }}>Sign In</button>
      <div style={{ height: 10 }} />
      <button style={btnGhost} onClick={() => { setError(''); setScreen('setup1') }}>Set Up My Account</button>
    </>
  )

  if (screen === 'login') return authBox(
    <>
      <div style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 24 }}>Sign In</div>
      <div style={{ marginBottom: 14 }}><label style={lbl}>Email</label><input style={input} type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></div>
      <div style={{ marginBottom: 20 }}><label style={lbl}>Password</label><input style={input} type="password" value={loginPw} onChange={e => setLoginPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} /></div>
      <button style={btn} onClick={doLogin}>Sign In</button>
      <div style={{ height: 10 }} />
      <button style={btnGhost} onClick={() => setScreen('landing')}>← Back</button>
    </>
  )

  if (screen === 'setup1') return authBox(
    <>
      <div style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>Create Your Account</div>
      <p style={{ fontSize: 13, color: S.muted, textAlign: 'center', marginBottom: 20 }}>Enter the invite code your admin sent you.</p>
      <div style={{ marginBottom: 20 }}><label style={lbl}>Invite Code</label><input style={{ ...input, fontFamily: 'DM Mono, monospace', letterSpacing: '0.15em', fontSize: 20, textTransform: 'uppercase', textAlign: 'center' }} type="text" value={setupCode} onChange={e => setSetupCode(e.target.value.toUpperCase())} maxLength={8} /></div>
      <button style={btn} onClick={validateCode}>Continue</button>
      <div style={{ height: 10 }} />
      <button style={btnGhost} onClick={() => setScreen('landing')}>← Back</button>
    </>
  )

  if (screen === 'setup2') return authBox(
    <>
      <div style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>Your Details</div>
      <p style={{ fontSize: 13, color: S.muted, textAlign: 'center', marginBottom: 20 }}>Almost there. Fill in your info to finish setup.</p>
      {[['Name','text',setupName,setSetupName],['Email','email',setupEmail,setSetupEmail],['Phone','tel',setupPhone,setSetupPhone]].map(([lbl2,type,val,set]: any) => (
        <div key={lbl2} style={{ marginBottom: 14 }}><label style={lbl}>{lbl2}</label><input style={input} type={type} value={val} onChange={(e: any) => set(e.target.value)} /></div>
      ))}
      <div style={{ marginBottom: 14 }}><label style={lbl}>Create Password</label><input style={input} type="password" value={setupPw} onChange={e => setSetupPw(e.target.value)} placeholder="Min 8 characters" /></div>
      <div style={{ marginBottom: 20 }}><label style={lbl}>Confirm Password</label><input style={input} type="password" value={setupPw2} onChange={e => setSetupPw2(e.target.value)} /></div>
      <button style={btn} onClick={completeSetup}>Create Account</button>
    </>
  )

  if (screen === 'setup3') return authBox(
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Account Created!</div>
      <p style={{ fontSize: 13, color: S.muted, marginBottom: 24 }}>Your profile is pending admin approval. Complete your training modules while you wait.</p>
      <button style={btn} onClick={goToPortal}>Go to My Portal</button>
    </div>
  )

  // PORTAL
  const activeForRoute = jobs.filter(j => j.status === 'claimed' || j.status === 'installed')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: S.accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>CMY // Helper Portal</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          <span style={{ color: S.accent, fontWeight: 600 }}>{helper?.name}</span>
          <button style={{ background: 'transparent', color: S.muted, border: `1px solid ${S.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }} onClick={logout}>Sign Out</button>
        </div>
      </div>

      <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, display: 'flex', padding: '0 24px', overflowX: 'auto' }}>
        {[['my-jobs','My Jobs'],['available','Available Jobs'],['route','Route'],['reports','Reports'],['training','Training'],['profile','My Profile']].map(([t, lbl2]) => (
          <div key={t} onClick={() => setTab(t)} style={{ padding: '10px 18px', fontSize: 13, fontWeight: 500, color: tab === t ? S.accent : S.muted, cursor: 'pointer', borderBottom: `2px solid ${tab === t ? S.accent : 'transparent'}`, whiteSpace: 'nowrap' }}>{lbl2}</div>
        ))}
      </div>

      <div style={{ flex: 1, padding: 24, maxWidth: 900, width: '100%', margin: '0 auto' }}>

        {/* MY JOBS */}
        {tab === 'my-jobs' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>My Jobs</h2>
              {activeForRoute.length >= 1 && (
                <button style={btnSm} onClick={() => setTab('route')}>🗺 Build Route</button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Active', value: jobs.filter(j => j.status !== 'complete').length },
                { label: 'Completed', value: myCompleted },
                { label: 'Est. Pay (This Month)', value: `$${estPay.toFixed(2)}`, color: S.green }
              ].map(s => (
                <div key={s.label} style={card}>
                  <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: s.color || S.accent, fontFamily: 'DM Mono, monospace' }}>{s.value}</div>
                </div>
              ))}
            </div>
            {!jobs.length && <div style={{ ...card, textAlign: 'center', color: S.muted, padding: 40 }}>No jobs claimed yet. Check Available Jobs.</div>}
            {jobs.sort((a, b) => (a.event_date || '') < (b.event_date || '') ? -1 : 1).map(j => (
              <div key={j.id} style={{ ...card, borderColor: j.status === 'complete' ? S.border : S.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{j.address}</div>
                    <div style={{ fontSize: 12, color: S.muted, fontFamily: 'DM Mono, monospace' }}>Event: {j.event_date || '—'} &nbsp;·&nbsp; Setup: {j.setup_date || '—'} &nbsp;·&nbsp; ${jobPay(j, helper?.pay_override)}</div>
                  </div>
                  <Badge t={j.status} />
                </div>
                {j.details && <div style={{ fontSize: 13, color: S.muted, marginBottom: 12 }}>{j.details}</div>}
                {j.status === 'claimed' && <button style={btnSm} onClick={() => markInstalled(j.id)}>Mark Installed</button>}
                {j.status === 'installed' && <span style={{ fontSize: 12, color: S.green }}>✓ Awaiting admin completion</span>}
              </div>
            ))}
          </div>
        )}

        {/* AVAILABLE - with sort/filter */}
        {tab === 'available' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Available Jobs</h2>
            {!helper?.approved && <div style={{ background: S.accent + '12', border: `1px solid ${S.accent}44`, color: S.accent, padding: '12px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>Your account is pending admin approval. Browse jobs now — you'll be able to claim once approved.</div>}

            {/* Filter bar */}
            <div style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={lbl}>Sort By</label>
                <select style={select} value={availSort} onChange={(e) => setAvailSort(e.target.value as any)}>
                  <option value="soonest">Soonest First</option>
                  <option value="latest">Latest First</option>
                  <option value="location">By Location (A-Z)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Territory</label>
                <select style={select} value={availTerritory} onChange={(e) => setAvailTerritory(e.target.value as any)}>
                  <option value="ALL">All Territories</option>
                  <option value="WW">WW (Wildwood)</option>
                  <option value="TV">TV (Tavares)</option>
                  <option value="CL">CL (Clermont)</option>
                  <option value="UK">UK (Unmapped)</option>
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: S.muted, cursor: 'pointer', paddingBottom: 10 }}>
                <input type="checkbox" checked={availFutureOnly} onChange={(e) => setAvailFutureOnly(e.target.checked)} />
                Future only
              </label>
            </div>

            <div style={{ fontSize: 12, color: S.muted, marginBottom: 12, fontFamily: 'DM Mono, monospace' }}>
              Showing {filteredAvailable.length} of {availableJobs.length} jobs
            </div>

            {!filteredAvailable.length && <div style={{ ...card, textAlign: 'center', color: S.muted, padding: 40 }}>No jobs match your filters.</div>}
            {filteredAvailable.map(j => (
              <div key={j.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{j.address}</div>
                    <div style={{ fontSize: 12, color: S.muted, fontFamily: 'DM Mono, monospace' }}>Event: {fmtDate(j.event_date)} &nbsp;·&nbsp; Setup: {fmtDate(j.setup_date)} &nbsp;·&nbsp; ${jobPay(j, helper?.pay_override)}</div>
                  </div>
                  <Badge t={j.territory || 'UK'} />
                </div>
                {j.details && <div style={{ fontSize: 13, color: S.muted, marginBottom: 12 }}>{j.details}</div>}
                <button style={{ ...btnSm, opacity: helper?.approved ? 1 : 0.5, cursor: helper?.approved ? 'pointer' : 'not-allowed' }} onClick={() => helper?.approved && claimJob(j.id)}>
                  {helper?.approved ? 'Claim Job' : 'Approval Required'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ROUTE - daily route builder (date-aware, drops + pickups) */}
        {tab === 'route' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Daily Route</h2>
            <p style={{ fontSize: 13, color: S.muted, marginBottom: 16 }}>
              Optimized route for the selected date. Auto-loads the next date with active work.
              <br />
              <span style={{ fontFamily: 'DM Mono, monospace', color: S.text }}>Home Office: {HOME_OFFICE}</span>
            </p>

            <div style={{ ...card, padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={lbl}>Route Date</label>
                  <input
                    style={select}
                    type="date"
                    value={routeDate}
                    onChange={(e) => setRouteDate(e.target.value)}
                  />
                </div>
                <button style={btnSm} onClick={() => buildRoute(routeDate || undefined)} disabled={routeLoading}>
                  {routeLoading ? 'Building...' : '🗺 Build Route'}
                </button>
                <button style={{ ...btnSm, background: 'transparent', color: S.muted, border: `1px solid ${S.border}` }} onClick={() => { setRouteDate(''); buildRoute() }} disabled={routeLoading}>
                  Auto-Pick
                </button>
              </div>
              {routeError && <div style={{ color: S.red, fontSize: 13, marginTop: 12 }}>{routeError}</div>}
            </div>

            {route && (
              <div>
                {route.message && (
                  <div style={{ background: S.accent + '12', border: `1px solid ${S.accent}44`, color: S.accent, padding: '10px 14px', borderRadius: 6, fontSize: 12, marginBottom: 16 }}>
                    {route.message}
                  </div>
                )}

                {(route.drops?.length === 0 && route.pickups?.length === 0) ? (
                  <div style={{ ...card, textAlign: 'center', color: S.muted, padding: 40 }}>
                    No drops or pickups on {route.date}.
                  </div>
                ) : (
                  <>
                    {/* Stats cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                      <div style={card}>
                        <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Drops</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: S.blue, fontFamily: 'DM Mono, monospace' }}>{route.drops?.length || 0}</div>
                      </div>
                      <div style={card}>
                        <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Pickups</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: S.green, fontFamily: 'DM Mono, monospace' }}>{route.pickups?.length || 0}</div>
                      </div>
                      <div style={card}>
                        <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Miles</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: S.accent, fontFamily: 'DM Mono, monospace' }}>{route.totalMiles !== null && route.totalMiles !== undefined ? route.totalMiles.toFixed(1) : '—'}</div>
                      </div>
                      <div style={card}>
                        <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Type</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: S.text, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', paddingTop: 4 }}>{route.routeType}</div>
                      </div>
                    </div>

                    {/* Open in Google Maps */}
                    {route.mapsUrl && (
                      <a href={route.mapsUrl} target="_blank" rel="noreferrer" style={{ ...btn, display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: 16 }}>
                        📍 Open in Google Maps
                      </a>
                    )}

                    {/* Stop list */}
                    <div style={card}>
                      <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                        Route Order · {route.date}
                      </div>

                      {/* START marker (only for routes that start at office) */}
                      {(route.routeType === 'drops-only' || route.routeType === 'mixed') && (
                        <div style={{ fontSize: 13, color: S.green, marginBottom: 8, fontFamily: 'DM Mono, monospace', paddingBottom: 8, borderBottom: `1px solid ${S.border}` }}>
                          🏁 START: {HOME_OFFICE}
                        </div>
                      )}

                      {/* DROP segment */}
                      {(route.drops || []).map((s: any, i: number) => (
                        <div key={`d-${s.id}`} style={{ paddingTop: 10, paddingBottom: 10, borderTop: i > 0 ? `1px dashed ${S.border}` : undefined }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: S.muted }}>STOP {s.order}</span>
                            <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontFamily: 'DM Mono, monospace', fontWeight: 600, background: S.blue + '22', color: S.blue, border: `1px solid ${S.blue}44` }}>DROP</span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{s.address}</div>
                          <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>Event: {s.event_date} · ${jobPay(s, helper?.pay_override)}</div>
                        </div>
                      ))}

                      {/* PICKUP segment */}
                      {(route.pickups || []).map((s: any, i: number) => (
                        <div key={`p-${s.id}`} style={{ paddingTop: 10, paddingBottom: 10, borderTop: `1px dashed ${S.border}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: S.muted }}>STOP {s.order}</span>
                            <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontFamily: 'DM Mono, monospace', fontWeight: 600, background: S.green + '22', color: S.green, border: `1px solid ${S.green}44` }}>PICKUP</span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{s.address}</div>
                          <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>Event was: {s.event_date} · ${jobPay(s, helper?.pay_override)}</div>
                        </div>
                      ))}

                      {/* END marker (only for routes that end at office) */}
                      {(route.routeType === 'pickups-only' || route.routeType === 'mixed') && (
                        <div style={{ fontSize: 13, color: S.green, fontFamily: 'DM Mono, monospace', paddingTop: 10, borderTop: `1px solid ${S.border}`, marginTop: 8 }}>
                          🏁 END: {HOME_OFFICE}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* REPORTS - date range earnings */}
        {tab === 'reports' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Earnings Reports</h2>
            <p style={{ fontSize: 13, color: S.muted, marginBottom: 16 }}>
              Search up to 16 months of completed jobs. Use this for tax records.
            </p>

            <div style={{ ...card, padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={lbl}>From</label>
                  <input style={select} type="date" value={reportFrom} min={reportMin} max={reportTo} onChange={(e) => setReportFrom(e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>To</label>
                  <input style={select} type="date" value={reportTo} min={reportFrom} max={today.toISOString().substring(0, 10)} onChange={(e) => setReportTo(e.target.value)} />
                </div>
                <button style={btnSm} onClick={runReport} disabled={reportLoading}>
                  {reportLoading ? '...' : 'Run'}
                </button>
                {reportData.length > 0 && (
                  <button style={{ ...btnSm, background: 'transparent', color: S.text, border: `1px solid ${S.border}` }} onClick={exportReportCsv}>
                    Export CSV
                  </button>
                )}
              </div>
            </div>

            {reportData.length === 0 && !reportLoading && (
              <div style={{ ...card, textAlign: 'center', color: S.muted, padding: 40 }}>
                Click Run to generate a report for the selected date range.
              </div>
            )}

            {reportData.length > 0 && (
              <>
                <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Total Jobs</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: S.accent, fontFamily: 'DM Mono, monospace' }}>{reportData.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Total Earned</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: S.green, fontFamily: 'DM Mono, monospace' }}>${reportTotal.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Avg / Job</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: S.accent, fontFamily: 'DM Mono, monospace' }}>${(reportTotal / reportData.length).toFixed(2)}</div>
                  </div>
                </div>

                {reportByMonth.map((g: any) => (
                  <div key={g.key} style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${S.border}` }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{g.label}</div>
                      <div style={{ fontSize: 13, color: S.green, fontFamily: 'DM Mono, monospace' }}>${g.total.toFixed(2)} · {g.count} job{g.count > 1 ? 's' : ''}</div>
                    </div>
                    {g.jobs.map((j: any) => (
                      <div key={j.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto auto', gap: 12, fontSize: 13, padding: '8px 0', borderTop: `1px dashed ${S.border}`, alignItems: 'center' }}>
                        <div style={{ color: S.muted, fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{j.event_date}</div>
                        <div>
                          <div>{j.address}</div>
                          <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace' }}>{extractCity(j.address || '')} · {j.status}</div>
                        </div>
                        <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace' }}>{isVillagesPay(j) ? 'V' : 'S'}</div>
                        <div style={{ color: S.green, fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>${jobPay(j, helper?.pay_override)}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* TRAINING */}
        {tab === 'training' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Training</h2>
            {(() => {
              const done = completions.filter((c: any) => c.signed_off_at).length
              const total = modules.length
              return (
                <div style={{ ...card, marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Progress</span>
                    <span style={{ fontSize: 13, color: S.muted, fontFamily: 'DM Mono, monospace' }}>{done}/{total} signed off</span>
                  </div>
                  <div style={{ height: 6, background: S.border, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: S.accent, borderRadius: 3, width: `${total ? done / total * 100 : 0}%` }} />
                  </div>
                </div>
              )
            })()}
            {!modules.length && <div style={{ ...card, textAlign: 'center', color: S.muted, padding: 40 }}>No training modules available yet.</div>}
            {modules.map((m, i) => {
              const comp = completions.find((c: any) => c.module_id === m.id)
              const done = !!comp?.completed_at
              const signedOff = !!comp?.signed_off_at
              return (
                <div key={m.id} style={{ ...card, borderColor: signedOff ? S.green : S.border }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: S.muted }}>MODULE {i + 1}</span>
                        {signedOff && <span style={{ fontSize: 12, color: S.green }}>✓ Admin Signed Off</span>}
                        {done && !signedOff && <span style={{ fontSize: 12, color: S.accent }}>Completed — Awaiting Sign-Off</span>}
                        {m.required && <span style={{ fontSize: 11, color: S.accent, fontFamily: 'DM Mono, monospace' }}>REQUIRED</span>}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{m.title}</div>
                      <div style={{ fontSize: 13, color: S.muted, marginBottom: 10 }}>{m.description || ''}</div>
                      {m.video_url ? <a href={m.video_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: S.blue, textDecoration: 'none' }}>▶ Watch Training Video</a> : <span style={{ fontSize: 12, color: S.muted }}>Video coming soon</span>}
                    </div>
                    <button style={{ ...btnSm, marginLeft: 16, flexShrink: 0, background: done ? 'transparent' : S.accent, color: done ? S.muted : '#000', border: done ? `1px solid ${S.border}` : 'none' }} onClick={() => !done && markModuleDone(m.id)}>
                      {done ? '✓ Done' : 'Mark Complete'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* PROFILE */}
        {tab === 'profile' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>My Profile</h2>
            <div style={card}>
              <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Account Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px', fontSize: 14, lineHeight: '1.8' }}>
                <span style={{ color: S.muted }}>Name</span><span style={{ fontWeight: 600 }}>{helper?.name}</span>
                <span style={{ color: S.muted }}>Email</span><span>{helper?.email}</span>
                <span style={{ color: S.muted }}>Status</span><span style={{ color: helper?.approved ? S.green : S.accent }}>{helper?.approved ? '✓ Approved' : 'Pending Approval'}</span>
              </div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: S.muted, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Change Password</div>
              <ChangePasswordForm showToast={showToast} />
            </div>
          </div>
        )}
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: S.surface, border: `1px solid ${S.green}`, color: S.green, padding: '12px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, zIndex: 999 }}>{toast}</div>}
    </div>
  )
}

function ChangePasswordForm({ showToast }: { showToast: (m: string) => void }) {
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [conf, setConf] = useState(''); const [err, setErr] = useState('')
  const input = { width: '100%', background: '#0f0f0f', border: '1px solid #2e2e2e', borderRadius: 6, padding: '9px 12px', color: '#e8e8e8', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box' as const }
  async function submit() {
    setErr('')
    if (nw.length < 8) { setErr('Min 8 characters.'); return }
    if (nw !== conf) { setErr('Passwords do not match.'); return }
    const res = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) }).then(r => r.json())
    if (res.ok) { setCur(''); setNw(''); setConf(''); showToast('Password updated ✓') }
    else setErr(res.error || 'Failed.')
  }
  return (
    <div>
      {err && <div style={{ color: '#e05555', fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        {[['Current',cur,setCur],['New',nw,setNw],['Confirm',conf,setConf]].map(([lbl,val,set]: any) => (
          <div key={lbl}><label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4, fontFamily: 'DM Mono, monospace' }}>{lbl}</label><input style={input} type="password" value={val} onChange={(e: any) => set(e.target.value)} /></div>
        ))}
      </div>
      <button style={{ background: 'transparent', color: '#888', border: '1px solid #2e2e2e', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }} onClick={submit}>Update Password</button>
    </div>
  )
}
