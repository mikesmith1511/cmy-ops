'use client'
import { useState, useEffect } from 'react'

const S: Record<string, any> = {
  bg: '#0f0f0f', surface: '#1a1a1a', surface2: '#222', border: '#2e2e2e',
  accent: '#f5c842', accent2: '#e8a020', text: '#e8e8e8', muted: '#888',
  green: '#4caf7d', red: '#e05555', blue: '#4a9eff', orange: '#f58c42'
}

function api(path: string, opts: any = {}) {
  return fetch(path, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...opts })
    .then(r => r.json())
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    api('/api/auth/me').then(d => {
      if (d.role === 'helper') { setHelper({ id: d.id, name: d.name, email: d.email, approved: d.approved, territory: d.territory, pay_override: d.pay_override }); loadPortal(d.id) }
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
      // Auto login
      const loginRes = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: setupEmail, password: setupPw, role: 'helper' }) })
      if (loginRes.ok) { setHelper(loginRes.helper); setScreen('setup3') }
    } else setError(res.error || 'Something went wrong.')
  }

  async function goToPortal() {
    await loadPortal()
    setScreen('landing') // triggers portal render since helper is set
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

  // Styles
  const card = { background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: 20, marginBottom: 16 }
  const btn = { background: S.accent, color: '#000', border: 'none', borderRadius: 6, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', width: '100%' as const }
  const btnSm = { background: S.accent, color: '#000', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }
  const btnGhost = { background: 'transparent', color: S.muted, border: `1px solid ${S.border}`, borderRadius: 6, padding: '10px 20px', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', width: '100%' as const }
  const input = { width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 6, padding: '10px 14px', color: S.text, fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box' as const }
  const lbl = { display: 'block', fontSize: 11, color: S.muted, marginBottom: 6, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }

  function Badge({ t }: { t: string }) {
    const colors: any = { WW: S.blue, TV: S.green, CL: S.orange, pending: S.muted, claimed: S.blue, installed: S.green, complete: S.muted }
    const c = colors[t] || S.muted
    return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: 500, background: c + '22', color: c, border: `1px solid ${c}44` }}>{t}</span>
  }

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

  // Landing (not logged in)
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

  // Portal (logged in)
  const myCompleted = jobs.filter(j => j.status === 'complete').length

  // Est. Pay = sum of (drop+pickup rates) for current-month jobs I've claimed/installed/completed
  // Villages pay scale ($20 drop + $20 pickup = $40 per job): jobs where type='pov' OR address contains
  //   The Villages / Middleton / Lady Lake
  // Standard pay scale ($20 drop + $10 pickup = $30 per job): everything else
  // pay_override on helper record overrides the per-job calc (legacy field)
  const _now = new Date()
  const _thisMonth = _now.getMonth()
  const _thisYear = _now.getFullYear()
  const _isVillagesPay = (j: any) => {
    if (j.type === 'pov') return true
    const addr = (j.address || '').toLowerCase()
    return addr.includes('the villages') || addr.includes('middleton') || addr.includes('lady lake')
  }
  const estPay = helper?.pay_override
    ? jobs.filter(j => j.status === 'complete').length * helper.pay_override
    : jobs
        .filter(j => {
          if (!j.event_date) return false
          const d = new Date(j.event_date)
          return d.getMonth() === _thisMonth && d.getFullYear() === _thisYear
        })
        .reduce((sum, j) => sum + (_isVillagesPay(j) ? 40 : 30), 0)

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
        {[['my-jobs','My Jobs'],['available','Available Jobs'],['training','Training'],['profile','My Profile']].map(([t, lbl2]) => (
          <div key={t} onClick={() => setTab(t)} style={{ padding: '10px 18px', fontSize: 13, fontWeight: 500, color: tab === t ? S.accent : S.muted, cursor: 'pointer', borderBottom: `2px solid ${tab === t ? S.accent : 'transparent'}`, whiteSpace: 'nowrap' }}>{lbl2}</div>
        ))}
      </div>

      <div style={{ flex: 1, padding: 24, maxWidth: 900, width: '100%', margin: '0 auto' }}>

        {/* MY JOBS */}
        {tab === 'my-jobs' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>My Jobs</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Active', value: jobs.filter(j => j.status !== 'complete').length },
                { label: 'Completed', value: myCompleted },
                { label: 'Est. Pay', value: `$${estPay.toFixed(2)}`, color: S.green }
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
                    <div style={{ fontSize: 12, color: S.muted, fontFamily: 'DM Mono, monospace' }}>Event: {j.event_date || '—'} &nbsp;·&nbsp; Setup: {j.setup_date || '—'}</div>
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

        {/* AVAILABLE */}
        {tab === 'available' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Available Jobs</h2>
            {!helper?.approved && <div style={{ background: S.accent + '12', border: `1px solid ${S.accent}44`, color: S.accent, padding: '12px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>Your account is pending admin approval. Browse jobs now — you'll be able to claim once approved.</div>}
            {!availableJobs.length && <div style={{ ...card, textAlign: 'center', color: S.muted, padding: 40 }}>No available jobs right now. Check back soon.</div>}
            {availableJobs.map(j => (
              <div key={j.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{j.address}</div>
                    <div style={{ fontSize: 12, color: S.muted, fontFamily: 'DM Mono, monospace' }}>Event: {j.event_date || '—'} &nbsp;·&nbsp; Setup: {j.setup_date || '—'}</div>
                  </div>
                  <Badge t={j.territory} />
                </div>
                {j.details && <div style={{ fontSize: 13, color: S.muted, marginBottom: 12 }}>{j.details}</div>}
                <button style={{ ...btnSm, opacity: helper?.approved ? 1 : 0.5, cursor: helper?.approved ? 'pointer' : 'not-allowed' }} onClick={() => helper?.approved && claimJob(j.id)}>
                  {helper?.approved ? 'Claim Job' : 'Approval Required'}
                </button>
              </div>
            ))}
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
