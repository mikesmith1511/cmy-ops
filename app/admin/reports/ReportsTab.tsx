'use client'
// =============================================================
// CMY Admin — Reports Tab  (v3)
// =============================================================
// - Per Helper view: accordion drilldown per helper row
// - Export CSV / Export Raw Jobs both hit /api/reports/export
//   which always returns flat expanded job rows (never rollup)
// - Print / Save PDF prints whatever is currently visible
// =============================================================

import { useState, useEffect, useMemo, useCallback } from 'react'

const S: Record<string, any> = {
  bg: '#0f0f0f', surface: '#1a1a1a', surface2: '#222', border: '#2e2e2e',
  accent: '#f5c842', accent2: '#e8a020', text: '#e8e8e8', muted: '#888',
  green: '#4caf7d', red: '#e05555', blue: '#4a9eff', orange: '#f58c42',
}

function isoDay(d: Date): string { return d.toISOString().slice(0, 10) }
function startOfWeek(d: Date): Date {
  const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0,0,0,0); return x
}
function endOfWeek(d: Date): Date {
  const x = startOfWeek(d); x.setDate(x.getDate() + 6); return x
}
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date): Date   { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }

const DATE_PRESETS = [
  { key: 'this-week',  label: 'This Week',    range: () => { const n = new Date(); return [isoDay(startOfWeek(n)), isoDay(endOfWeek(n))] as [string,string] } },
  { key: 'last-week',  label: 'Last Week',    range: () => { const n = addDays(new Date(), -7); return [isoDay(startOfWeek(n)), isoDay(endOfWeek(n))] as [string,string] } },
  { key: 'this-month', label: 'This Month',   range: () => { const n = new Date(); return [isoDay(startOfMonth(n)), isoDay(endOfMonth(n))] as [string,string] } },
  { key: 'last-month', label: 'Last Month',   range: () => { const n = new Date(); n.setMonth(n.getMonth()-1); return [isoDay(startOfMonth(n)), isoDay(endOfMonth(n))] as [string,string] } },
  { key: 'ytd',        label: 'Year to Date', range: () => { const n = new Date(); return [`${n.getFullYear()}-01-01`, isoDay(n)] as [string,string] } },
  { key: 'all',        label: 'All Time',     range: () => ['', ''] as [string,string] },
]

const ALL_STATUSES   = ['pending', 'claimed', 'installed', 'complete', 'cancelled']
const ALL_KINDS      = ['drop', 'pick']
const ALL_TYPES      = ['standard', 'pov', 'custom']
const ALL_TERRITORIES = ['WW', 'TV', 'CL']
const TERR_LABEL: Record<string,string> = { WW: 'Wildwood', TV: 'Tavares', CL: 'Clermont' }

type SubView = 'helper' | 'territory' | 'cross'

interface Props { helpers: any[] }

export default function ReportsTab({ helpers }: Props) {
  const initial = DATE_PRESETS[0].range()
  const [from, setFrom]               = useState(initial[0])
  const [to, setTo]                   = useState(initial[1])
  const [basis, setBasis]             = useState<'event_date'|'setup_date'|'created_at'|'updated_at'>('event_date')
  const [statuses, setStatuses]       = useState<string[]>(['complete'])
  const [kinds, setKinds]             = useState<string[]>(['drop', 'pick'])
  const [terrFilter, setTerrFilter]   = useState<string[]>([])
  const [helperFilter, setHelperFilter] = useState<number[]>([])
  const [typeFilter, setTypeFilter]   = useState<string[]>([])
  const [subView, setSubView]         = useState<SubView>('helper')
  const [data, setData]               = useState<any>(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [expandedHelpers, setExpandedHelpers] = useState<Set<number>>(new Set())

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to)   p.set('to', to)
    p.set('basis', basis)
    if (statuses.length)     p.set('statuses', statuses.join(','))
    if (kinds.length)        p.set('kinds', kinds.join(','))
    if (terrFilter.length)   p.set('territories', terrFilter.join(','))
    if (helperFilter.length) p.set('helpers', helperFilter.join(','))
    if (typeFilter.length)   p.set('types', typeFilter.join(','))
    return p.toString()
  }, [from, to, basis, statuses, kinds, terrFilter, helperFilter, typeFilter])

  const fetchReport = useCallback(async () => {
    setLoading(true); setError('')
    setExpandedHelpers(new Set())
    try {
      const res = await fetch(`/api/reports?${queryString}`, { credentials: 'include' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Report failed')
      setData(d)
    } catch (e: any) {
      setError(e.message || 'Unknown error')
      setData(null)
    } finally { setLoading(false) }
  }, [queryString])

  useEffect(() => { fetchReport() }, [fetchReport])

  function applyPreset(key: string) {
    const preset = DATE_PRESETS.find(p => p.key === key)
    if (!preset) return
    const [f, t] = preset.range()
    setFrom(f); setTo(t)
  }

  // Both export buttons hit the same route — always flat expanded rows
  function exportCsv() {
    window.location.href = `/api/reports/export?${queryString}`
  }
  function printView() { window.print() }

  function toggleIn<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter(x => x !== v) : [...list, v]
  }

  function toggleHelper(id: number) {
    setExpandedHelpers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Group raw jobs by helper_id for accordion
  const jobsByHelper = useMemo(() => {
    if (!data?.jobs) return new Map<number, any[]>()
    const map = new Map<number, any[]>()
    for (const j of data.jobs) {
      if (!j.helper_id) continue
      if (!map.has(j.helper_id)) map.set(j.helper_id, [])
      map.get(j.helper_id)!.push(j)
    }
    return map
  }, [data])

  return (
    <div style={{ padding: 16, background: S.bg, color: S.text, minHeight: '100vh' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, html { background: white !important; color: black !important; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #888; padding: 6px; font-size: 11px; }
          .drilldown-row td { background: #f9f9f9 !important; }
        }
      `}</style>

      <h2 style={{ margin: '0 0 16px', color: S.accent }}>Reports</h2>

      {/* ═══ FILTER BAR ═══ */}
      <div className="no-print" style={{
        background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8,
        padding: 16, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
          <div>
            <label style={lbl}>From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Date Basis</label>
            <select value={basis} onChange={e => setBasis(e.target.value as any)} style={inp}>
              <option value="event_date">Event Date</option>
              <option value="setup_date">Setup Date</option>
              <option value="created_at">Created Date</option>
              <option value="updated_at">Last Updated</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DATE_PRESETS.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)} style={chip}>{p.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <label style={lbl}>Status</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {ALL_STATUSES.map(s => (
                <button key={s} onClick={() => setStatuses(toggleIn(statuses, s))}
                  style={statuses.includes(s) ? chipOn : chip}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>Kind</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {ALL_KINDS.map(k => (
                <button key={k} onClick={() => setKinds(toggleIn(kinds, k))}
                  style={kinds.includes(k) ? chipOn : chip}>{k}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>Type</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {ALL_TYPES.map(t => (
                <button key={t} onClick={() => setTypeFilter(toggleIn(typeFilter, t))}
                  style={typeFilter.includes(t) ? chipOn : chip}>{t}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <label style={lbl}>Territory</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {ALL_TERRITORIES.map(t => (
                <button key={t} onClick={() => setTerrFilter(toggleIn(terrFilter, t))}
                  style={terrFilter.includes(t) ? chipOn : chip}>
                  {t} <span style={{ color: S.muted }}>· {TERR_LABEL[t]}</span>
                </button>
              ))}
              {terrFilter.length === 0 && <span style={{ color: S.muted, fontSize: 12, alignSelf: 'center' }}>(all)</span>}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={lbl}>Helper</label>
            <select multiple
              value={helperFilter.map(String)}
              onChange={e => setHelperFilter(Array.from(e.target.selectedOptions).map(o => +o.value))}
              style={{ ...inp, height: 80, minWidth: 240 }}>
              {helpers.map((h: any) => (
                <option key={h.id} value={h.id}>{h.name} ({h.territory})</option>
              ))}
            </select>
            <div style={{ color: S.muted, fontSize: 12, marginTop: 4 }}>
              Hold Ctrl/Cmd to select multiple. None selected = all.
            </div>
          </div>
        </div>
      </div>

      {/* ═══ VIEW TABS + EXPORT ═══ */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['helper', 'territory', 'cross'] as SubView[]).map(v => (
            <button key={v} onClick={() => setSubView(v)} style={subView === v ? tabOn : tab}>
              {v === 'helper' ? 'Per Helper' : v === 'territory' ? 'Per Territory' : 'Helper × Territory'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportCsv} style={btn}>Export CSV</button>
          <button onClick={exportCsv} style={btn}>Export Raw Jobs</button>
          <button onClick={printView} style={btn}>Print / Save PDF</button>
        </div>
      </div>

      {error && <div style={{ color: S.red, marginBottom: 12 }}>Error: {error}</div>}
      {loading && <div style={{ color: S.muted }}>Loading…</div>}

      {/* ═══ TOTALS STRIP ═══ */}
      {data && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <StatCard label="Jobs"            value={data.totals.jobs} />
          <StatCard label="Completed"       value={data.totals.completed} accent={S.green} />
          <StatCard label="Revenue"         value={`$${data.totals.revenue.toFixed(2)}`} accent={S.accent} />
          <StatCard label="Active Helpers"  value={`${data.totals.helpers} / ${data.totals.helpersTotal}`} />
          <StatCard label="Avg Jobs / Helper" value={data.totals.avgJobsPerHelper} />
          <StatCard label="Drops"           value={data.totals.drops} />
          <StatCard label="Picks"           value={data.totals.picks} />
        </div>
      )}

      {/* ═══ VIEWS ═══ */}
      {data && subView === 'helper' && (
        <HelperView
          data={data}
          jobsByHelper={jobsByHelper}
          expandedHelpers={expandedHelpers}
          onToggle={toggleHelper}
        />
      )}
      {data && subView === 'territory' && <TerritoryView data={data} />}
      {data && subView === 'cross'     && <CrossView data={data} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// HELPER VIEW — with accordion drilldown
// ─────────────────────────────────────────────────────────────

interface HelperViewProps {
  data: any
  jobsByHelper: Map<number, any[]>
  expandedHelpers: Set<number>
  onToggle: (id: number) => void
}

function HelperView({ data, jobsByHelper, expandedHelpers, onToggle }: HelperViewProps) {
  return (
    <div style={card}>
      <table style={tbl}>
        <thead>
          <tr>
            <th style={th}></th>
            <th style={th}>Helper</th>
            <th style={th}>Territory</th>
            <th style={th}>Jobs</th>
            <th style={th}>Drops</th>
            <th style={th}>Picks</th>
            <th style={th}>Completed</th>
            <th style={th}>Pending</th>
            <th style={th}>Cancelled</th>
            <th style={th}>Comp. Rate</th>
            <th style={th}>Earnings</th>
            <th style={th}>Avg / Job</th>
          </tr>
        </thead>
        <tbody>
          {data.byHelper.length === 0 && (
            <tr><td colSpan={12} style={{ ...td, textAlign: 'center', color: '#888' }}>
              No data for the current filters.
            </td></tr>
          )}
          {data.byHelper.map((h: any) => {
            const isOpen = expandedHelpers.has(h.id)
            const jobs   = jobsByHelper.get(h.id) || []
            return (
              <>
                {/* ── SUMMARY ROW ── */}
                <tr key={`summary-${h.id}`}
                  onClick={() => onToggle(h.id)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1e1e1e')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ ...td, width: 28, color: S.muted, fontSize: 11 }}>
                    {isOpen ? '▼' : '▶'}
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>{h.name}</td>
                  <td style={td}>{h.territory || '—'}</td>
                  <td style={td}>{h.jobs}</td>
                  <td style={td}>{h.drops}</td>
                  <td style={td}>{h.picks}</td>
                  <td style={{ ...td, color: '#4caf7d' }}>{h.completed}</td>
                  <td style={td}>{h.pending}</td>
                  <td style={{ ...td, color: '#e05555' }}>{h.cancelled}</td>
                  <td style={td}>{(h.completionRate * 100).toFixed(0)}%</td>
                  <td style={{ ...td, color: '#f5c842' }}>${h.earnings.toFixed(2)}</td>
                  <td style={td}>${h.avgPerJob.toFixed(2)}</td>
                </tr>

                {/* ── DRILLDOWN ROWS ── */}
                {isOpen && (
                  <>
                    {/* Sub-header */}
                    <tr key={`dh-${h.id}`} className="drilldown-row">
                      <td style={{ ...td, background: '#161616', paddingLeft: 40 }} />
                      <td style={{ ...td, background: '#161616', fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer</td>
                      <td style={{ ...td, background: '#161616', fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Address</td>
                      <td style={{ ...td, background: '#161616', fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Terr</td>
                      <td style={{ ...td, background: '#161616', fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Kind</td>
                      <td style={{ ...td, background: '#161616', fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</td>
                      <td style={{ ...td, background: '#161616', fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Event Date</td>
                      <td style={{ ...td, background: '#161616', fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: 0.5 }} colSpan={2}>Type</td>
                      <td style={{ ...td, background: '#161616', fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Order #</td>
                      <td style={{ ...td, background: '#161616', fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pay</td>
                      <td style={{ ...td, background: '#161616' }} />
                    </tr>

                    {jobs.length === 0 ? (
                      <tr key={`dempty-${h.id}`} className="drilldown-row">
                        <td colSpan={12} style={{ ...td, background: '#161616', paddingLeft: 40, color: S.muted, fontSize: 12 }}>
                          No individual job data available.
                        </td>
                      </tr>
                    ) : jobs.map((j: any, idx: number) => (
                      <tr key={`job-${j.id}-${idx}`} className="drilldown-row"
                        style={{ background: idx % 2 === 0 ? '#141414' : '#161616' }}>
                        <td style={{ ...td, background: 'inherit', borderLeft: `2px solid ${S.accent}`, paddingLeft: 16 }} />
                        <td style={{ ...td, background: 'inherit', fontSize: 12 }}>{j.customer_name || '—'}</td>
                        <td style={{ ...td, background: 'inherit', fontSize: 12, color: S.muted }}>{j.address || '—'}</td>
                        <td style={{ ...td, background: 'inherit', fontSize: 12 }}>{j.territory || '—'}</td>
                        <td style={{ ...td, background: 'inherit', fontSize: 12 }}>{j.kind || '—'}</td>
                        <td style={{ ...td, background: 'inherit', fontSize: 12 }}>
                          <span style={{
                            color: j.status === 'complete' ? '#4caf7d'
                              : j.status === 'cancelled' ? '#e05555'
                              : j.status === 'installed' ? '#4a9eff'
                              : S.text
                          }}>{j.status}</span>
                        </td>
                        <td style={{ ...td, background: 'inherit', fontSize: 12 }}>{j.event_date || '—'}</td>
                        <td style={{ ...td, background: 'inherit', fontSize: 12 }} colSpan={2}>{j.type || '—'}</td>
                        <td style={{ ...td, background: 'inherit', fontSize: 12, color: S.muted }}>{j.order_number || '—'}</td>
                        <td style={{ ...td, background: 'inherit', fontSize: 12, color: '#f5c842' }}>${(j.pay ?? 0).toFixed(2)}</td>
                        <td style={{ ...td, background: 'inherit' }} />
                      </tr>
                    ))}

                    {/* Sub-total bar */}
                    <tr key={`dtotal-${h.id}`} className="drilldown-row">
                      <td colSpan={10} style={{ ...td, background: '#1a1a1a', borderTop: `1px solid ${S.border}` }} />
                      <td style={{ ...td, background: '#1a1a1a', fontWeight: 700, color: '#f5c842', fontSize: 12, borderTop: `1px solid ${S.border}` }}>
                        ${h.earnings.toFixed(2)}
                      </td>
                      <td style={{ ...td, background: '#1a1a1a', borderTop: `1px solid ${S.border}` }} />
                    </tr>
                  </>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TERRITORY VIEW (unchanged)
// ─────────────────────────────────────────────────────────────

function TerritoryView({ data }: { data: any }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        {data.byTerritory.map((t: any) => (
          <div key={t.code} style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
              {t.code} · {TERR_LABEL[t.code] || ''}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{t.total} <span style={{ fontSize: 14, color: '#888' }}>jobs</span></div>
            <div style={{ color: '#f5c842', fontSize: 18, fontWeight: 600 }}>${t.revenue.toFixed(2)}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#aaa' }}>
              {t.completed} done · {t.pending} open · {t.helpers} helpers
            </div>
          </div>
        ))}
      </div>
      <div style={card}>
        <table style={tbl}>
          <thead>
            <tr>
              <th style={th}>Territory</th><th style={th}>Total</th><th style={th}>Drops</th>
              <th style={th}>Picks</th><th style={th}>Completed</th><th style={th}>Pending</th>
              <th style={th}>Claimed</th><th style={th}>Installed</th><th style={th}>Cancelled</th>
              <th style={th}>Helpers</th><th style={th}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.byTerritory.map((t: any) => (
              <tr key={t.code}>
                <td style={td}>{t.code}</td>
                <td style={td}>{t.total}</td>
                <td style={td}>{t.drops}</td>
                <td style={td}>{t.picks}</td>
                <td style={{ ...td, color: '#4caf7d' }}>{t.completed}</td>
                <td style={td}>{t.pending}</td>
                <td style={td}>{t.claimed}</td>
                <td style={td}>{t.installed}</td>
                <td style={{ ...td, color: '#e05555' }}>{t.cancelled}</td>
                <td style={td}>{t.helpers}</td>
                <td style={{ ...td, color: '#f5c842' }}>${t.revenue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// CROSS VIEW (unchanged)
// ─────────────────────────────────────────────────────────────

function CrossView({ data }: { data: any }) {
  const terrs: string[] = data.cross.territories
  const crossHelpers: any[] = data.cross.helpers
  const maxJobs = Math.max(1, ...crossHelpers.flatMap(h =>
    terrs.map(t => data.cross.matrix[h.id]?.[t]?.jobs || 0)
  ))
  function heatColor(jobs: number): string {
    if (jobs === 0) return '#1a1a1a'
    const intensity = Math.min(1, jobs / maxJobs)
    return `rgba(245,${Math.floor(200 - 70 * intensity)},${Math.floor(66 - 30 * intensity)},${0.25 + intensity * 0.75})`
  }
  return (
    <div>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ padding: 12, color: '#888', fontSize: 12, borderBottom: `1px solid ${S.border}` }}>
          Heatmap · cell intensity = jobs
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ ...tbl, minWidth: 600 }}>
            <thead>
              <tr>
                <th style={th}>Helper</th>
                {terrs.map(t => <th key={t} style={th}>{t}</th>)}
                <th style={th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {crossHelpers.length === 0 && (
                <tr><td colSpan={terrs.length + 2} style={{ ...td, textAlign: 'center', color: '#888' }}>
                  No data for the current filters.
                </td></tr>
              )}
              {crossHelpers.map(h => {
                let totalJobs = 0, totalEarn = 0
                return (
                  <tr key={h.id}>
                    <td style={td}>{h.name}</td>
                    {terrs.map(t => {
                      const c = data.cross.matrix[h.id]?.[t] || { jobs: 0, earnings: 0 }
                      totalJobs += c.jobs; totalEarn += c.earnings
                      return (
                        <td key={t} style={{ ...td, textAlign: 'center', background: heatColor(c.jobs), fontWeight: c.jobs > 0 ? 600 : 400 }}
                          title={`${c.jobs} jobs · $${c.earnings.toFixed(2)}`}>
                          {c.jobs > 0 ? <>{c.jobs}<br /><span style={{ fontSize: 11, color: '#000' }}>${c.earnings.toFixed(0)}</span></> : '—'}
                        </td>
                      )
                    })}
                    <td style={{ ...td, fontWeight: 700 }}>
                      {totalJobs}<br />
                      <span style={{ fontSize: 11, color: '#f5c842' }}>${totalEarn.toFixed(2)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={card}>
        <div style={{ padding: 12, color: '#888', fontSize: 12, borderBottom: `1px solid ${S.border}` }}>
          List form
        </div>
        <table style={tbl}>
          <thead>
            <tr>
              <th style={th}>Helper</th><th style={th}>Territory</th>
              <th style={th}>Jobs</th><th style={th}>Earnings</th>
            </tr>
          </thead>
          <tbody>
            {crossHelpers.flatMap(h =>
              terrs.map(t => {
                const c = data.cross.matrix[h.id]?.[t] || { jobs: 0, earnings: 0 }
                if (c.jobs === 0) return null
                return (
                  <tr key={`${h.id}-${t}`}>
                    <td style={td}>{h.name}</td><td style={td}>{t}</td>
                    <td style={td}>{c.jobs}</td>
                    <td style={{ ...td, color: '#f5c842' }}>${c.earnings.toFixed(2)}</td>
                  </tr>
                )
              })
            ).filter(Boolean)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PRESENTATIONAL
// ─────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: any; accent?: string }) {
  return (
    <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: 12, minWidth: 140 }}>
      <div style={{ fontSize: 12, color: S.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || S.text }}>{value}</div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: S.muted, marginBottom: 4 }
const inp: React.CSSProperties = { background: S.surface2, color: S.text, border: `1px solid ${S.border}`, borderRadius: 4, padding: '6px 8px', fontSize: 13 }
const btn: React.CSSProperties = { background: S.surface2, color: S.text, border: `1px solid ${S.border}`, borderRadius: 4, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }
const chip: React.CSSProperties = { background: 'transparent', color: S.text, border: `1px solid ${S.border}`, borderRadius: 999, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }
const chipOn: React.CSSProperties = { ...chip, background: S.accent, color: '#000', border: `1px solid ${S.accent}`, fontWeight: 600 }
const tab: React.CSSProperties = { background: S.surface, color: S.text, border: `1px solid ${S.border}`, borderRadius: 6, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }
const tabOn: React.CSSProperties = { ...tab, background: S.accent, color: '#000', fontWeight: 600, border: `1px solid ${S.accent}` }
const card: React.CSSProperties = { background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, overflow: 'hidden' }
const tbl: React.CSSProperties  = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const th: React.CSSProperties   = { background: S.surface2, color: S.muted, padding: '8px 10px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: `1px solid ${S.border}` }
const td: React.CSSProperties   = { padding: '8px 10px', borderBottom: `1px solid ${S.border}` }
