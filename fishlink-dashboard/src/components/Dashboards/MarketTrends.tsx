import React, { useState, useEffect } from 'react';
import { BarChart3, RefreshCw, AlertCircle, Activity, Calendar } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL, formatErrorMessage } from '../../config/api';

const BASE_SPECIES_LIST = [
  'Tuna (Yellowfin)',
  'Skipjack',
  'Trevally (Paraw)',
  'Mackerel',
  'Seer Fish (Thora)',
  'Sailfish (Thalapath)',
  'Barramundi (Modha)',
  'Red Snapper (Ranna)',
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface PricePrediction {
  species:          string;
  unit:             string;
  recommendedPrice: number;
  confidence:       string;
  insight:          string;
  summary: {
    avgLast30:    number;
    avgPrev30:    number;
    trendPct:     number;
    minLast30:    number;
    maxLast30:    number;
    stddevLast30: number;
  };
  next7Days: { date: string; predictedPrice: number }[];
}

interface DbStat {
  species:          string;
  avgPriceLast30:   number;
  avgPricePrev30:   number;
  trendPct:         number;
  catchCount:       number;
  totalKgLast30:    number;
  recommendedPrice: number;
}

interface CombinedStat {
  species:          string;
  apiAvg:           number;
  apiTrend:         number;
  apiRecommended:   number;
  apiConfidence:    string;
  apiInsight:       string;
  next7Days:        { date: string; predictedPrice: number }[];
  dbAvg:            number | null;
  dbTrend:          number | null;
  dbCatchCount:     number;
  dbTotalKg:        number;
  blendedPrice:     number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const trendColor  = (p: number) => p > 3 ? '#10b981' : p < -3 ? '#ef4444' : '#3b82f6';
const trendBg     = (p: number) => p > 3 ? '#d1fae5' : p < -3 ? '#fee2e2' : '#dbeafe';
const trendLabel  = (p: number) =>
  p > 3 ? `▲ +${p}%` : p < -3 ? `▼ ${p}%` : `― ${p > 0 ? '+' : ''}${p}%`;

const confidenceBg = (c: string) =>
  c === 'high' ? '#d1fae5' : c === 'medium' ? '#fef3c7' : '#fee2e2';
const confidenceColor = (c: string) =>
  c === 'high' ? '#059669' : c === 'medium' ? '#d97706' : '#dc2626';

// ── Component ─────────────────────────────────────────────────────────────────

export const MarketTrends = () => {
  const [stats,       setStats]       = useState<CombinedStat[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [expanded,    setExpanded]    = useState<string | null>(null);   // expanded species card

  const authHeader = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch DB market stats to discover any custom species added by fishermen
      const dbRes = await axios.get<DbStat[]>(`${API_BASE_URL}/api/Catches/market-stats`, { headers: authHeader })
        .catch(() => ({ data: [] as DbStat[] }));
      const dbStats: DbStat[] = dbRes.data || [];

      // Combine base species list with all unique species found in DB
      const speciesSet = new Set<string>(BASE_SPECIES_LIST);
      dbStats.forEach(d => {
        if (d.species && d.species.trim()) {
          const match = Array.from(speciesSet).find(s => s.toLowerCase() === d.species.toLowerCase());
          if (!match) speciesSet.add(d.species.trim());
        }
      });
      const activeSpeciesList = Array.from(speciesSet);

      // 2. Fetch price predictions via ASP.NET Core proxy
      const predictionsRes = await Promise.allSettled(
        activeSpeciesList.map(sp =>
          axios.get<PricePrediction>(
            `${API_BASE_URL}/api/AgentGateway/prices/${encodeURIComponent(sp)}/predict`,
            { headers: authHeader }
          )
        )
      );

      const combined: CombinedStat[] = activeSpeciesList.map((sp, i) => {
        const predResult = predictionsRes[i];
        const pred: PricePrediction | null =
          predResult.status === 'fulfilled' ? predResult.value.data : null;

        const db = dbStats.find(d => d.species.toLowerCase() === sp.toLowerCase()) ?? null;

        const apiRec = pred?.recommendedPrice ?? 0;
        const dbRec  = db?.recommendedPrice   ?? 0;

        let blended = 0;
        if (apiRec > 0 && dbRec > 0) blended = Math.round(apiRec * 0.6 + dbRec * 0.4);
        else if (apiRec > 0)         blended = apiRec;
        else if (dbRec  > 0)         blended = dbRec;

        return {
          species:        sp,
          apiAvg:         pred?.summary?.avgLast30      ?? 0,
          apiTrend:       pred?.summary?.trendPct       ?? 0,
          apiRecommended: apiRec,
          apiConfidence:  pred?.confidence              ?? 'low',
          apiInsight:     pred?.insight                 ?? 'Price API unavailable.',
          next7Days:      pred?.next7Days               ?? [],
          dbAvg:          db?.avgPriceLast30            ?? null,
          dbTrend:        db?.trendPct                  ?? null,
          dbCatchCount:   db?.catchCount                ?? 0,
          dbTotalKg:      db?.totalKgLast30             ?? 0,
          blendedPrice:   blended,
        };
      });

      setStats(combined);
      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to load market data. Make sure price_api (port 8001) and the .NET API are running.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="dashboard-content">

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'12px', marginBottom:'4px' }}>
        <div>
          <h2 style={{ margin:0 }}>Market Intelligence & Price Forecast</h2>
          <p style={{ color:'#64748b', margin:'6px 0 0', fontSize:'0.9rem' }}>
            AI predictions from 90-day price history · blended with live DB transaction data
          </p>
        </div>
        <button onClick={fetchAll} className="btn-outline"
          style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 16px' }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {lastUpdated && (
        <p style={{ color:'#94a3b8', fontSize:'0.78rem', marginBottom:'24px' }}>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign:'center', padding:'60px', color:'#64748b' }}>
          <Activity size={32} color="#005b96" style={{ marginBottom:'12px' }} />
          <p>Fetching live market data & running price predictions…</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="workflow-card" style={{ borderLeftColor:'#ef4444' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <AlertCircle color="#ef4444" size={22} />
            <div>
              <p style={{ margin:0, color:'#ef4444', fontWeight:600 }}>Could not load market data</p>
              <p style={{ margin:'4px 0 0', color:'#64748b', fontSize:'0.85rem' }}>{typeof error === 'string' ? error : formatErrorMessage(error)}</p>
            </div>
          </div>
          <div style={{ marginTop:'16px', background:'#f8fafc', borderRadius:'8px', padding:'14px', fontSize:'0.85rem', color:'#475569' }}>
            <strong>Start the services:</strong><br />
            <code style={{ background:'#1e293b', color:'#e2e8f0', padding:'2px 8px', borderRadius:'4px', display:'inline-block', marginTop:'6px' }}>
              cd price_api &amp;&amp; uvicorn main:app --port 8001
            </code>
          </div>
        </div>
      )}

      {/* Stats */}
      {!loading && !error && stats.length > 0 && (
        <>
          {/* Summary cards row */}
          <div className="stats-row" style={{ marginBottom:'28px' }}>
            {stats.map(s => (
              <div
                key={s.species}
                className="stat-card"
                onClick={() => setExpanded(expanded === s.species ? null : s.species)}
                style={{ cursor:'pointer', transition:'box-shadow 0.2s', boxShadow: expanded === s.species ? '0 0 0 2px #005b96' : undefined }}
              >
                <h3 style={{ fontSize:'0.82rem' }}>{s.species}</h3>

                {/* Blended recommended price */}
                <p style={{ fontSize:'1.35rem', fontWeight:700, color:'#005b96', margin:'6px 0 4px' }}>
                  Rs. {s.blendedPrice > 0 ? s.blendedPrice.toLocaleString() : '—'}/kg
                </p>

                <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'8px' }}>
                  {/* API trend badge */}
                  <span style={{ padding:'2px 8px', borderRadius:'10px', fontSize:'0.75rem', fontWeight:700,
                    background: trendBg(s.apiTrend), color: trendColor(s.apiTrend) }}>
                    {trendLabel(s.apiTrend)}
                  </span>
                  {/* Confidence badge */}
                  <span style={{ padding:'2px 8px', borderRadius:'10px', fontSize:'0.75rem', fontWeight:600,
                    background: confidenceBg(s.apiConfidence), color: confidenceColor(s.apiConfidence) }}>
                    {s.apiConfidence} confidence
                  </span>
                </div>

                <p style={{ color:'#94a3b8', fontSize:'0.75rem', margin:0 }}>
                  {s.dbCatchCount > 0
                    ? `${s.dbCatchCount} local catches · ${s.dbTotalKg} kg`
                    : 'No local transactions yet'}
                </p>
                <p style={{ color:'#94a3b8', fontSize:'0.72rem', margin:'4px 0 0' }}>
                  Click to see 7-day forecast ↓
                </p>
              </div>
            ))}
          </div>

          {/* Expanded species — 7-day forecast + detail */}
          {expanded && (() => {
            const s = stats.find(x => x.species === expanded)!;
            return (
              <div className="workflow-card" style={{ marginBottom:'28px', borderLeftColor:'#005b96' }}>
                <div className="card-header">
                  <h3 style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <Calendar size={18} /> {s.species} — 7-Day Price Forecast
                  </h3>
                  <button onClick={() => setExpanded(null)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#64748b', fontSize:'1.2rem' }}>✕</button>
                </div>

                <div className="card-body">
                  {/* Forecast mini-chart (CSS bar chart) */}
                  {s.next7Days.length > 0 && (() => {
                    const prices = s.next7Days.map(d => d.predictedPrice);
                    const min    = Math.min(...prices) * 0.97;
                    const max    = Math.max(...prices) * 1.03;
                    return (
                      <div style={{ marginBottom:'20px' }}>
                        <p style={{ fontWeight:600, color:'#475569', marginBottom:'10px', fontSize:'0.85rem' }}>
                          Predicted price range: Rs.{Math.min(...prices).toLocaleString()} – Rs.{Math.max(...prices).toLocaleString()}/kg
                        </p>
                        <div style={{ display:'flex', alignItems:'flex-end', gap:'6px', height:'100px' }}>
                          {s.next7Days.map((d, i) => {
                            const pct = ((d.predictedPrice - min) / (max - min)) * 100;
                            const day = new Date(d.date).toLocaleDateString('en-US', { weekday:'short' });
                            return (
                              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
                                <span style={{ fontSize:'0.65rem', color:'#005b96', fontWeight:700 }}>
                                  {d.predictedPrice.toLocaleString()}
                                </span>
                                <div style={{
                                  width:'100%', height:`${Math.max(pct, 10)}%`,
                                  background: i === 0 ? '#93c5fd' : '#005b96',
                                  borderRadius:'4px 4px 0 0', minHeight:'8px',
                                  transition:'height 0.4s',
                                }} />
                                <span style={{ fontSize:'0.65rem', color:'#94a3b8' }}>{day}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Data source comparison */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'16px' }}>
                    <div style={{ background:'#f0f9ff', borderRadius:'8px', padding:'14px', border:'1px solid #bae6fd' }}>
                      <p style={{ fontWeight:700, color:'#0369a1', margin:'0 0 8px', fontSize:'0.85rem' }}>📊 Price API (90-day model)</p>
                      <p style={{ margin:'3px 0', fontSize:'0.83rem', color:'#334155' }}>Avg last 30d: <strong>Rs. {s.apiAvg.toLocaleString()}/kg</strong></p>
                      <p style={{ margin:'3px 0', fontSize:'0.83rem', color:'#334155' }}>Recommended: <strong>Rs. {s.apiRecommended.toLocaleString()}/kg</strong></p>
                      <p style={{ margin:'3px 0', fontSize:'0.83rem', color: trendColor(s.apiTrend) }}>
                        Trend: <strong>{trendLabel(s.apiTrend)}</strong>
                      </p>
                    </div>
                    <div style={{ background:'#f0fdf4', borderRadius:'8px', padding:'14px', border:'1px solid #bbf7d0' }}>
                      <p style={{ fontWeight:700, color:'#15803d', margin:'0 0 8px', fontSize:'0.85rem' }}>🗄️ Live DB Transactions</p>
                      {s.dbCatchCount > 0 ? (
                        <>
                          <p style={{ margin:'3px 0', fontSize:'0.83rem', color:'#334155' }}>Avg last 30d: <strong>Rs. {s.dbAvg?.toLocaleString()}/kg</strong></p>
                          <p style={{ margin:'3px 0', fontSize:'0.83rem', color:'#334155' }}>Catches: <strong>{s.dbCatchCount} ({s.dbTotalKg} kg)</strong></p>
                          <p style={{ margin:'3px 0', fontSize:'0.83rem', color: trendColor(s.dbTrend ?? 0) }}>
                            Trend: <strong>{trendLabel(s.dbTrend ?? 0)}</strong>
                          </p>
                        </>
                      ) : (
                        <p style={{ color:'#94a3b8', fontSize:'0.83rem', margin:0 }}>No transactions yet for this species.</p>
                      )}
                    </div>
                  </div>

                  {/* Blended recommendation */}
                  <div style={{ background:'#fefce8', border:'1px solid #fde047', borderRadius:'8px', padding:'14px', marginBottom:'14px' }}>
                    <p style={{ margin:0, fontWeight:700, color:'#854d0e', fontSize:'0.9rem' }}>
                      ⚡ Blended AI Recommendation: Rs. {s.blendedPrice.toLocaleString()}/kg
                    </p>
                    <p style={{ margin:'4px 0 0', color:'#713f12', fontSize:'0.8rem' }}>
                      60% price model weight + 40% local DB weight
                      {s.dbCatchCount === 0 ? ' (DB weight unused — no local data)' : ''}
                    </p>
                  </div>

                  {/* Insight */}
                  <div style={{ background:'#f8fafc', borderRadius:'8px', padding:'14px', border:'1px solid #e2e8f0' }}>
                    <p style={{ margin:0, color:'#475569', fontSize:'0.85rem', lineHeight:'1.65' }}>
                      <strong>AI Insight:</strong> {s.apiInsight}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Full recommendation table */}
          <div className="workflow-card">
            <div className="card-header">
              <h3 style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <BarChart3 size={18} /> All Species — Price Summary
              </h3>
            </div>
            <div className="card-body">
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['Species', 'API Avg (30d)', 'DB Avg (30d)', 'Trend', 'AI Recommended', 'Local Supply', 'Confidence'].map(h => (
                        <th key={h} style={{ padding:'10px 12px', textAlign:'left', color:'#475569',
                          fontWeight:600, borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s, i) => (
                      <tr key={s.species}
                        style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', cursor:'pointer' }}
                        onClick={() => setExpanded(expanded === s.species ? null : s.species)}>
                        <td style={{ padding:'10px 12px', fontWeight:600, color:'#1e293b' }}>{s.species}</td>
                        <td style={{ padding:'10px 12px', color:'#334155' }}>Rs. {s.apiAvg.toLocaleString()}</td>
                        <td style={{ padding:'10px 12px', color:'#334155' }}>
                          {s.dbAvg ? `Rs. ${s.dbAvg.toLocaleString()}` : <span style={{ color:'#94a3b8' }}>—</span>}
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ color: trendColor(s.apiTrend), fontWeight:700 }}>
                            {trendLabel(s.apiTrend)}
                          </span>
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ color:'#005b96', fontWeight:700 }}>
                            Rs. {s.blendedPrice > 0 ? s.blendedPrice.toLocaleString() : '—'}
                          </span>
                        </td>
                        <td style={{ padding:'10px 12px', color:'#64748b' }}>
                          {s.dbCatchCount > 0 ? `${s.dbTotalKg} kg` : <span style={{ color:'#94a3b8' }}>—</span>}
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ padding:'3px 10px', borderRadius:'12px', fontSize:'0.75rem', fontWeight:700,
                            background: confidenceBg(s.apiConfidence), color: confidenceColor(s.apiConfidence) }}>
                            {s.apiConfidence}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ color:'#94a3b8', fontSize:'0.75rem', marginTop:'10px' }}>
                Click any row to see the 7-day forecast chart for that species.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
