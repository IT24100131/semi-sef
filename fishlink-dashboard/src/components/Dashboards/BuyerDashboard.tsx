import React, { useState, useEffect } from 'react';
import {
  Bot, MapPin, Package, DollarSign,
  Star, CheckCircle, AlertCircle, RefreshCw,
  ShoppingCart, TrendingUp, Fish, X, Settings, Save, Trash2, Edit3, SlidersHorizontal,
} from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL, formatErrorMessage } from '../../config/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchedCatch {
  id: number;
  fishSpecies: string;
  quantityKg: number;
  askingPricePerKg: number;
  location: string;
  status: string;
  qualityScore: number;
  qualityGrade: string;
  photoUrl?: string;
  fishermanName: string;
  createdAt: string;
  matchScore: number;
  matchReasons: string;
}

interface BidForm {
  catchId: number;
  species: string;
  askingPrice: number;
  bidPrice: string;
}

interface Preference {
  id?: number;
  buyerId?: number;
  preferredSpecies: string;
  minQuantityKg: number;
  maxQuantityKg: number;
  maxPricePerKg: number;
  preferredCity: string;
  notes: string;
  updatedAt?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const matchColor  = (s: number) => s >= 80 ? '#059669' : s >= 60 ? '#d97706' : '#6b7280';
const gradeColor  = (g: string) => g === 'A+' ? '#059669' : g === 'A' ? '#0284c7' : g === 'B' ? '#d97706' : '#9ca3af';
const gradeBg     = (g: string) => g === 'A+' ? '#d1fae5' : g === 'A' ? '#e0f2fe' : g === 'B' ? '#fef3c7' : '#f3f4f6';

const PRESET_SPECIES = [
  'Tuna (Yellowfin)',
  'Skipjack',
  'Trevally (Paraw)',
  'Mackerel',
  'Seer Fish (Thora)',
  'Sailfish (Thalapath)',
  'Barramundi (Modha)',
  'Red Snapper (Ranna)',
  'Cuttlefish / Squid',
  'Prawns / Shrimp',
  'Crab',
];
const CITIES  = ['', 'Negombo', 'Colombo', 'Kandy', 'Galle', 'Matara', 'Jaffna'];

const EMPTY_PREF: Preference = {
  preferredSpecies: '', minQuantityKg: 0, maxQuantityKg: 500,
  maxPricePerKg: 3000, preferredCity: '', notes: '',
};

// ── Score Ring ────────────────────────────────────────────────────────────────

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 22; const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: 60, height: 60, flexShrink: 0 }}>
      <svg width="60" height="60" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="30" cy="30" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        <circle cx="30" cy="30" r={r} fill="none" stroke={matchColor(score)} strokeWidth="5"
          strokeDasharray={`${(score / 100) * circ} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '0.8rem', fontWeight: 800, color: matchColor(score) }}>
        {score}%
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

interface BuyerDashboardProps {
  initialTab?: 'recommend' | 'browse' | 'saved-preferences' | 'preferences';
  onNavigateTab?: (tab: string) => void;
}

export const BuyerDashboard: React.FC<BuyerDashboardProps> = ({ initialTab = 'recommend', onNavigateTab }) => {
  const [activeTab, setActiveTab] = useState<'recommend' | 'browse' | 'saved-preferences' | 'preferences'>(initialTab);
  const [savedPrefsList, setSavedPrefsList] = useState<Preference[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const switchTab = (tab: 'recommend' | 'browse' | 'saved-preferences' | 'preferences') => {
    setActiveTab(tab);
    if (onNavigateTab) {
      if (tab === 'preferences') onNavigateTab('preferences');
      else if (tab === 'saved-preferences') onNavigateTab('saved-preferences');
      else onNavigateTab('home');
    }
  };

  // Preference state
  const [pref,         setPref]         = useState<Preference>(EMPTY_PREF);
  const [savedPref,    setSavedPref]    = useState<Preference | null>(null);
  const [prefSaving,   setPrefSaving]   = useState(false);
  const [prefSaved,    setPrefSaved]    = useState(false);
  const [prefError,    setPrefError]    = useState('');

  // Species selection state (Preset vs Discovered vs Custom)
  const [speciesOption, setSpeciesOption]           = useState<string>('');
  const [customSpeciesInput, setCustomSpeciesInput] = useState<string>('');

  // Track this buyer's placed bids to enforce one-bid-per-buyer limit
  const [myBids, setMyBids] = useState<any[]>([]);

  // Validation errors for Preferences form
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearFieldError = (f: string) => setFieldErrors(prev => {
    const next = { ...prev };
    delete next[f];
    return next;
  });

  // Results
  const [recommendations, setRecommendations] = useState<MatchedCatch[]>([]);
  const [allCatches,       setAllCatches]      = useState<MatchedCatch[]>([]);
  const [totalAvailable,   setTotalAvailable]  = useState(0);
  const [hasSavedPref,     setHasSavedPref]    = useState(false);

  // UI
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [searched,   setSearched]   = useState(false);
  const [bidForm,    setBidForm]    = useState<BidForm | null>(null);
  const [bidSuccess, setBidSuccess] = useState(false);
  const [bidError,   setBidError]   = useState('');

  const authHeader = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  // Dynamically discover other unique species from available catches in the market
  const discoveredSpecies = React.useMemo(() => {
    const list: string[] = [];
    allCatches.forEach(c => {
      if (c.fishSpecies && !PRESET_SPECIES.includes(c.fishSpecies) && !list.includes(c.fishSpecies)) {
        list.push(c.fishSpecies);
      }
    });
    return list;
  }, [allCatches]);

  // Sync speciesOption & customSpeciesInput whenever savedPref changes or loads
  useEffect(() => {
    if (savedPref?.preferredSpecies) {
      const sp = savedPref.preferredSpecies;
      if (PRESET_SPECIES.includes(sp) || discoveredSpecies.includes(sp)) {
        setSpeciesOption(sp);
        setCustomSpeciesInput('');
      } else {
        setSpeciesOption('__custom__');
        setCustomSpeciesInput(sp);
      }
    } else {
      setSpeciesOption('');
      setCustomSpeciesInput('');
    }
  }, [savedPref, discoveredSpecies]);

  const fetchPreferencesList = async () => {
    try {
      const res = await axios.get<Preference[]>(`${API_BASE_URL}/api/BuyerMatch/preferences`, { headers: authHeader });
      const list = Array.isArray(res.data) ? res.data : [];
      setSavedPrefsList(list);
      if (list.length > 0) {
        setHasSavedPref(true);
        setSavedPref(list[0]);
      } else {
        setHasSavedPref(false);
        setSavedPref(null);
      }
    } catch {
      try {
        const res = await axios.get<Preference>(`${API_BASE_URL}/api/BuyerMatch/preferences/me`, { headers: authHeader });
        if (res.data) {
          setSavedPrefsList([res.data]);
          setHasSavedPref(true);
          setSavedPref(res.data);
        }
      } catch {
        setSavedPrefsList([]);
        setHasSavedPref(false);
        setSavedPref(null);
      }
    }
  };

  // ── Load saved preference list, available catches, and buyer's bids on mount ──
  useEffect(() => {
    fetchPreferencesList();

    // Load all available catches
    axios.get<MatchedCatch[]>(`${API_BASE_URL}/api/BuyerMatch/available`, { headers: authHeader })
      .then(r => { setAllCatches(r.data); setTotalAvailable(r.data.length); })
      .catch(() => {});

    // Load this buyer's previous bids to enforce single bid per catch
    axios.get<any[]>(`${API_BASE_URL}/api/Bids/my`, { headers: authHeader })
      .then(r => { setMyBids(r.data ?? []); })
      .catch(() => {});

    // Auto-run recommendations using saved preference
    runRecommendations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Run recommendations ─────────────────────────────────────────────────────
  const runRecommendations = async (customPref?: Preference) => {
    setLoading(true);
    setError('');
    try {
      const body = customPref ? {
        preferredSpecies: customPref.preferredSpecies,
        minQuantityKg:    customPref.minQuantityKg,
        maxQuantityKg:    customPref.maxQuantityKg,
        maxPricePerKg:    customPref.maxPricePerKg,
        preferredCity:    customPref.preferredCity,
        notes:            customPref.notes,
      } : {};

      // Route through ASP.NET Core — NOT directly to port 8000
      const res = await axios.post(
        `${API_BASE_URL}/api/BuyerMatch/recommend`,
        body,
        { headers: authHeader }
      );
      setRecommendations(res.data.recommendations ?? []);
      setTotalAvailable(res.data.totalAvailable ?? 0);
      setHasSavedPref(res.data.hasSavedPref ?? false);
      setSearched(true);
    } catch {
      setError('Could not load recommendations. Make sure the API is running.');
    } finally {
      setLoading(false);
    }
  };

  // ── Validation for Preferences ───────────────────────────────────────────────
  const validatePreferences = (): boolean => {
    const errors: Record<string, string> = {};
    const finalSpecies = speciesOption === '__custom__'
      ? customSpeciesInput.trim()
      : speciesOption;

    if (speciesOption === '__custom__') {
      if (!finalSpecies) {
        errors.species = 'Please enter a custom fish species name.';
      } else if (finalSpecies.length > 80) {
        errors.species = 'Species name cannot exceed 80 characters.';
      }
    }

    const minQty = Number(pref.minQuantityKg);
    const maxQty = Number(pref.maxQuantityKg);
    const maxPrice = Number(pref.maxPricePerKg);

    if (isNaN(minQty) || minQty < 0) {
      errors.minQty = 'Min quantity cannot be negative.';
    } else if (minQty > 50000) {
      errors.minQty = 'Min quantity cannot exceed 50,000 kg.';
    }

    if (isNaN(maxQty) || maxQty <= 0) {
      errors.maxQty = 'Max quantity must be greater than 0 kg.';
    } else if (maxQty > 50000) {
      errors.maxQty = 'Max quantity cannot exceed 50,000 kg.';
    } else if (minQty > maxQty) {
      errors.maxQty = `Max quantity (${maxQty} kg) must be greater than or equal to Min quantity (${minQty} kg).`;
    }

    if (isNaN(maxPrice) || maxPrice <= 0) {
      errors.maxPrice = 'Maximum price must be greater than Rs. 0/kg.';
    } else if (maxPrice < 50) {
      errors.maxPrice = 'Maximum price must be at least Rs. 50/kg.';
    } else if (maxPrice > 100000) {
      errors.maxPrice = 'Maximum price cannot exceed Rs. 100,000/kg.';
    }

    if (pref.notes && pref.notes.length > 300) {
      errors.notes = 'Notes cannot exceed 300 characters.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Save preference ─────────────────────────────────────────────────────────
  const handleSavePreference = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrefError('');

    if (!validatePreferences()) {
      setPrefError('Please correct the highlighted fields before saving.');
      return;
    }

    setPrefSaving(true);
    const finalSpecies = speciesOption === '__custom__'
      ? customSpeciesInput.trim()
      : speciesOption;

    try {
      const payload = {
        id:               editingId ?? undefined,
        preferredSpecies: finalSpecies,
        minQuantityKg:    Number(pref.minQuantityKg),
        maxQuantityKg:    Number(pref.maxQuantityKg),
        maxPricePerKg:    Number(pref.maxPricePerKg),
        preferredCity:    pref.preferredCity,
        notes:            pref.notes,
      };

      await axios.post(
        `${API_BASE_URL}/api/BuyerMatch/preferences`,
        payload,
        { headers: authHeader }
      );

      setPrefSaved(true);
      setFieldErrors({});
      setTimeout(() => setPrefSaved(false), 4000);

      // Reset form
      setEditingId(null);
      setPref(EMPTY_PREF);
      setSpeciesOption('');
      setCustomSpeciesInput('');

      // Refresh list & recommendations
      await fetchPreferencesList();
      await runRecommendations();

      // Switch to saved preferences list so the user immediately sees it listed!
      switchTab('saved-preferences');
    } catch (err: any) {
      setPrefError(formatErrorMessage(err, 'Failed to save preferences. Please try again.'));
    } finally {
      setPrefSaving(false);
    }
  };

  // ── Delete single preference from list ──────────────────────────────────────
  const handleDeletePreferenceItem = async (id: number) => {
    if (!window.confirm('Are you sure you want to remove this preference from your saved list?')) return;
    setDeletingId(id);
    setPrefError('');
    try {
      await axios.delete(`${API_BASE_URL}/api/BuyerMatch/preferences/${id}`, { headers: authHeader });
      await fetchPreferencesList();
      await runRecommendations();
    } catch (err: any) {
      setPrefError(formatErrorMessage(err, 'Failed to delete preference.'));
    } finally {
      setDeletingId(null);
    }
  };

  // ── Edit preference in form ─────────────────────────────────────────────────
  const handleEditPreference = (item: Preference) => {
    setEditingId(item.id ?? null);
    setPref(item);
    if (item.preferredSpecies) {
      if (PRESET_SPECIES.includes(item.preferredSpecies) || discoveredSpecies.includes(item.preferredSpecies)) {
        setSpeciesOption(item.preferredSpecies);
        setCustomSpeciesInput('');
      } else {
        setSpeciesOption('__custom__');
        setCustomSpeciesInput(item.preferredSpecies);
      }
    } else {
      setSpeciesOption('');
      setCustomSpeciesInput('');
    }
    setFieldErrors({});
    switchTab('preferences');
  };

  // ── Add new preference in form ──────────────────────────────────────────────
  const handleAddNewPreference = () => {
    setEditingId(null);
    setPref(EMPTY_PREF);
    setSpeciesOption('');
    setCustomSpeciesInput('');
    setFieldErrors({});
    switchTab('preferences');
  };

  // ── Find catches for a specific saved preference ────────────────────────────
  const handleFindCatchesForPref = async (item: Preference) => {
    await runRecommendations(item);
    switchTab('recommend');
  };

  // ── Delete all preferences ──────────────────────────────────────────────────
  const [prefDeleting, setPrefDeleting] = useState(false);

  const handleDeletePreference = async () => {
    if (!window.confirm('Are you sure you want to delete all your buying preferences?')) return;
    setPrefDeleting(true);
    setPrefError('');
    setFieldErrors({});
    try {
      await axios.delete(`${API_BASE_URL}/api/BuyerMatch/preferences/me`, { headers: authHeader });
      setSavedPref(null);
      setSavedPrefsList([]);
      setHasSavedPref(false);
      setEditingId(null);
      setSpeciesOption('');
      setCustomSpeciesInput('');
      setPref(EMPTY_PREF);
      await runRecommendations();
    } catch (err: any) {
      setPrefError(formatErrorMessage(err, 'Failed to delete preferences.'));
    } finally {
      setPrefDeleting(false);
    }
  };

  // ── Place bid ───────────────────────────────────────────────────────────────
  const handlePlaceBid = async () => {
    if (!bidForm) return;
    setBidError('');
    const price = Number(bidForm.bidPrice);
    if (!price || price <= 0) { setBidError('Please enter a valid bid price (greater than Rs. 0/kg).'); return; }
    if (price < 50) { setBidError('Bid price must be at least Rs. 50/kg.'); return; }
    if (price > 100000) { setBidError('Bid price cannot exceed Rs. 100,000/kg.'); return; }

    try {
      await axios.post(
        `${API_BASE_URL}/api/Bids`,
        { catchId: bidForm.catchId, bidPricePerKg: price },
        { headers: authHeader }
      );
      setBidSuccess(true);
      const newBidRecord = { id: Date.now(), catchId: bidForm.catchId, bidPricePerKg: price, status: 'Pending' };
      setTimeout(() => {
        setBidForm(null);
        setBidSuccess(false);
        setMyBids(prev => [...prev.filter(b => b.catchId !== bidForm.catchId), newBidRecord]);
        setRecommendations(prev => prev.map(c => c.id === bidForm.catchId ? { ...c, status: 'Bidding' } : c));
        setAllCatches(prev => prev.map(c => c.id === bidForm.catchId ? { ...c, status: 'Bidding' } : c));
      }, 2000);
    } catch (err: any) {
      setBidError(formatErrorMessage(err, 'Failed to place bid.'));
    }
  };

  // ── Catch card ──────────────────────────────────────────────────────────────
  const renderCatchCard = (c: MatchedCatch, showScore: boolean) => {
    const myBid = myBids.find(b => b.catchId === c.id);

    return (
      <div key={c.id} className="workflow-card"
        style={{ borderLeftColor: showScore ? matchColor(c.matchScore) : '#3b82f6', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {showScore && <ScoreRing score={c.matchScore} />}
          {c.photoUrl && (
            <img src={c.photoUrl} alt="catch"
              style={{ width: 80, height: 70, objectFit: 'cover', borderRadius: 8,
                flexShrink: 0, border: '1px solid #e2e8f0' }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1rem' }}>{c.fishSpecies}</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {c.qualityGrade !== 'Unverified' && (
                  <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: '0.75rem',
                    fontWeight: 700, background: gradeBg(c.qualityGrade), color: gradeColor(c.qualityGrade) }}>
                    Quality {c.qualityGrade}
                  </span>
                )}
                {myBid && (
                  <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700,
                    background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
                    ✓ You Bid: Rs. {Number(myBid.bidPricePerKg).toLocaleString()}/kg ({myBid.status})
                  </span>
                )}
                <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600,
                  background: c.status === 'Bidding' ? '#dbeafe' : '#d1fae5',
                  color:      c.status === 'Bidding' ? '#1e40af' : '#065f46' }}>
                  {c.status === 'Bidding' ? '🔵 Bidding' : '🟢 Published'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569', fontSize: '0.88rem' }}>
                <Package size={14} /> {c.quantityKg} kg
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569', fontSize: '0.88rem' }}>
                <DollarSign size={14} /> Rs. {Number(c.askingPricePerKg).toLocaleString()}/kg
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569', fontSize: '0.88rem' }}>
                <MapPin size={14} /> {c.location}
              </span>
            </div>
            {showScore && c.matchReasons && (
              <div style={{ background: '#f8fafc', borderRadius: 6, padding: '6px 10px',
                fontSize: '0.78rem', color: '#64748b',
                borderLeft: `3px solid ${matchColor(c.matchScore)}`, marginBottom: 8 }}>
                {c.matchReasons.split(' · ').map((r, i) => (
                  <span key={i} style={{ display: 'block', lineHeight: 1.6 }}>{r}</span>
                ))}
              </div>
            )}
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
              By {c.fishermanName} · {new Date(c.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div style={{ marginTop: 14, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
          {myBid ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn-outline"
                disabled
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 18px', fontSize: '0.85rem', marginTop: 0,
                  background: '#f8fafc', color: '#059669', borderColor: '#86efac', cursor: 'not-allowed',
                  fontWeight: 600
                }}
              >
                <CheckCircle size={15} color="#059669" /> Bid Placed: Rs. {Number(myBid.bidPricePerKg).toLocaleString()}/kg
              </button>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic' }}>
                (Limit: 1 bid per buyer on this catch)
              </span>
            </div>
          ) : (
            <button className="btn-primary"
              onClick={() => { setBidForm({ catchId: c.id, species: c.fishSpecies,
                askingPrice: Number(c.askingPricePerKg), bidPrice: '' }); setBidError(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 20px', fontSize: '0.88rem', marginTop: 0 }}>
              <ShoppingCart size={15} /> Place Bid
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── Bid Modal ───────────────────────────────────────────────────────────────
  const BidModal = () => {
    if (!bidForm) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: 'white', borderRadius: 12, padding: 32,
          width: '100%', maxWidth: 420, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
          {bidSuccess ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <CheckCircle color="#10b981" size={56} style={{ margin: '0 auto 16px' }} />
              <h3 style={{ color: '#065f46', margin: '0 0 8px' }}>Bid Placed!</h3>
              <p style={{ color: '#64748b', margin: 0 }}>Your bid for {bidForm.species} was submitted.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0 }}>Place a Bid</h3>
                <button onClick={() => setBidForm(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                  <X size={20} />
                </button>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 14, marginBottom: 20 }}>
                <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#1e293b' }}>{bidForm.species}</p>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem' }}>
                  Asking: <strong>Rs. {bidForm.askingPrice.toLocaleString()}/kg</strong>
                </p>
              </div>
              {bidError && (
                <div style={{ display: 'flex', gap: 8, background: '#fee2e2', border: '1px solid #fca5a5',
                  borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <AlertCircle color="#ef4444" size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ margin: 0, color: '#991b1b', fontSize: '0.85rem' }}>
                    {typeof bidError === 'string' ? bidError : formatErrorMessage(bidError)}
                  </p>
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>Your Bid Price (Rs/kg)</label>
                <input type="number" placeholder={`e.g. ${bidForm.askingPrice}`}
                  value={bidForm.bidPrice}
                  onChange={e => setBidForm({ ...bidForm, bidPrice: e.target.value })}
                  style={{ padding: 12, border: '1px solid #cbd5e1', borderRadius: 6,
                    fontSize: '1rem', width: '100%', boxSizing: 'border-box' as const }} />
                {bidForm.bidPrice && Number(bidForm.bidPrice) < bidForm.askingPrice && (
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#d97706' }}>
                    ⚠ Below asking price — seller may decline.
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-outline" onClick={() => setBidForm(null)} style={{ flex: 1 }}>Cancel</button>
                <button className="btn-primary" onClick={handlePlaceBid}
                  style={{ flex: 2, marginTop: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 8 }}>
                  <ShoppingCart size={16} /> Confirm Bid
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Main Render ─────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-content">
      <BidModal />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {activeTab === 'saved-preferences' ? '📑 Saved Buying Preferences' : 'Live Market & AI Buyer Matching'}
          </h2>
          <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: '0.9rem' }}>
            {activeTab === 'saved-preferences'
              ? `${savedPrefsList.length} preference(s) saved · Matching against all live catches`
              : `${totalAvailable} listings available · ${
                  hasSavedPref
                    ? '✅ Recommendations based on your saved preferences'
                    : '⚠ Set your preferences for better recommendations'
                }`}
          </p>
        </div>
      </div>

      {/* Tabs (Saved Preferences is available in Sidebar) */}
      {activeTab !== 'saved-preferences' && (
        <div style={{ display: 'flex', gap: 4, marginTop: 20, marginBottom: 24,
          background: '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          {([
            { key: 'recommend',   label: '🤖 Recommendations' },
            { key: 'browse',      label: '📋 Browse All' },
            { key: 'preferences', label: editingId ? '✏️ Edit Preference' : '⚙️ My Preferences (Form)' },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => switchTab(tab.key)}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s',
                background: activeTab === tab.key ? 'white' : 'transparent',
                color:      activeTab === tab.key ? '#005b96' : '#64748b',
                boxShadow:  activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                position: 'relative' as const,
              }}>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Recommendations Tab ────────────────────────────────────────────── */}
      {activeTab === 'recommend' && (
        <>
          {/* Preference summary banner */}
          {savedPrefsList.length > 0 && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10,
              padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Bot size={18} color="#0369a1" />
                <div style={{ fontSize: '0.85rem', color: '#0369a1' }}>
                  <strong>{savedPrefsList.length} Saved Preference(s) Active:</strong>{' '}
                  {savedPrefsList.map(p => p.preferredSpecies || 'Any').join(', ')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => switchTab('saved-preferences')}
                  className="btn-outline"
                  style={{ padding: '5px 14px', fontSize: '0.8rem', display: 'flex',
                    alignItems: 'center', gap: 6 }}>
                  <SlidersHorizontal size={13} /> View Saved List ({savedPrefsList.length})
                </button>
                <button onClick={handleAddNewPreference}
                  className="btn-primary"
                  style={{ padding: '5px 14px', fontSize: '0.8rem', display: 'flex',
                    alignItems: 'center', gap: 6, margin: 0 }}>
                  <Settings size={13} /> + Add More
                </button>
              </div>
            </div>
          )}

          {/* No preference yet — nudge */}
          {savedPrefsList.length === 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
              padding: '14px 16px', marginBottom: 20 }}>
              <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#92400e', fontSize: '0.9rem' }}>
                ⚡ Get personalised recommendations
              </p>
              <p style={{ margin: '0 0 12px', color: '#78350f', fontSize: '0.85rem' }}>
                Save your fish preferences once — we'll automatically rank the best catches for you every time.
              </p>
              <button onClick={handleAddNewPreference} className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 18px', fontSize: '0.85rem', marginTop: 0 }}>
                <Settings size={14} /> Open My Preferences Form
              </button>
            </div>
          )}

          {/* Refresh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bot size={20} color="#005b96" />
              <h3 style={{ margin: 0, color: '#1e293b' }}>🤖 Recommended for You</h3>
            </div>
            <button onClick={() => runRecommendations()}
              className="btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', fontSize: '0.8rem' }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', gap: 10, background: '#fee2e2', border: '1px solid #fca5a5',
              borderRadius: 8, padding: 14, marginBottom: 20 }}>
              <AlertCircle color="#ef4444" size={18} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, color: '#991b1b', fontSize: '0.85rem' }}>{error}</p>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <RefreshCw size={28} color="#005b96"
                style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
              <p>Running AI recommendations…</p>
            </div>
          )}

          {!loading && searched && recommendations.length === 0 && (
            <div className="workflow-card" style={{ textAlign: 'center', padding: 40 }}>
              <Fish size={48} color="#94a3b8" style={{ marginBottom: 12 }} />
              <h3 style={{ color: '#475569' }}>No matching catches found</h3>
              <p style={{ color: '#94a3b8' }}>
                Try adjusting your preferences or check back when new catches are published.
              </p>
            </div>
          )}

          {!loading && recommendations.map(c => renderCatchCard(c, true))}

          {!loading && !searched && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
              <TrendingUp size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p>Loading recommendations…</p>
            </div>
          )}
        </>
      )}

      {/* ── Browse All Tab ────────────────────────────────────────────────── */}
      {activeTab === 'browse' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <Star size={18} color="#f59e0b" />
            <h3 style={{ margin: 0 }}>All Available Listings ({allCatches.length})</h3>
          </div>
          {allCatches.length === 0 ? (
            <div className="workflow-card" style={{ textAlign: 'center', padding: 40 }}>
              <Fish size={48} color="#94a3b8" style={{ marginBottom: 12 }} />
              <h3 style={{ color: '#475569' }}>No listings available yet</h3>
            </div>
          ) : (
            allCatches.map(c => renderCatchCard(c, false))
          )}
        </>
      )}

      {/* ── Saved Preferences List Tab ─────────────────────────────────────── */}
      {activeTab === 'saved-preferences' && (
        <div style={{ maxWidth: 800 }}>
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              className="btn-outline"
              onClick={() => switchTab('recommend')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: '0.82rem' }}
            >
              ← Back to Live Market
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.25rem', color: '#1e293b' }}>
                <SlidersHorizontal size={22} color="#005b96" /> My Saved Preferences List
              </h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem' }}>
                Here are all your saved preferences. The AI recommendation engine continuously checks live market catches against these criteria.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {savedPrefsList.length > 1 && (
                <button
                  type="button"
                  className="btn-outline"
                  disabled={prefDeleting}
                  onClick={handleDeletePreference}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', fontSize: '0.82rem', color: '#dc2626', borderColor: '#fca5a5' }}
                >
                  <Trash2 size={14} /> {prefDeleting ? 'Clearing...' : 'Clear All'}
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={handleAddNewPreference}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontSize: '0.88rem', margin: 0 }}
              >
                + Add New Preference
              </button>
            </div>
          </div>

          {prefSaved && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#d1fae5',
              border: '1px solid #6ee7b7', borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
              <CheckCircle color="#059669" size={20} />
              <div>
                <p style={{ margin: 0, color: '#065f46', fontWeight: 700, fontSize: '0.92rem' }}>
                  Preference Saved to List!
                </p>
                <p style={{ margin: '2px 0 0', color: '#047857', fontSize: '0.82rem' }}>
                  Live catches are being ranked according to your criteria.
                </p>
              </div>
            </div>
          )}

          {prefError && (
            <div style={{ display: 'flex', gap: 8, background: '#fee2e2', border: '1px solid #fca5a5',
              borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <AlertCircle color="#ef4444" size={16} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, color: '#991b1b', fontSize: '0.85rem' }}>{prefError}</p>
            </div>
          )}

          {savedPrefsList.length === 0 ? (
            <div className="workflow-card" style={{ textAlign: 'center', padding: '50px 20px' }}>
              <Fish size={48} color="#94a3b8" style={{ marginBottom: 12 }} />
              <h3 style={{ color: '#475569', margin: '0 0 8px' }}>No Saved Preferences in Your List</h3>
              <p style={{ color: '#94a3b8', maxWidth: 450, margin: '0 auto 20px', fontSize: '0.9rem' }}>
                You haven't saved any buying criteria yet. Click below to add your first preference and get personalized AI recommendations.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={handleAddNewPreference}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px' }}
              >
                <Settings size={16} /> Open My Preferences Form
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {savedPrefsList.map((item, idx) => (
                <div key={item.id ?? idx} className="workflow-card" style={{ padding: '20px', borderLeft: '4px solid #005b96' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        background: '#e0f2fe', color: '#0369a1', fontWeight: 800, fontSize: '1rem',
                        padding: '4px 12px', borderRadius: 8, border: '1px solid #bae6fd'
                      }}>
                        🐟 {item.preferredSpecies || 'All Species (Any)'}
                      </span>
                      <span style={{
                        padding: '3px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700,
                        background: '#dcfce7', color: '#166534', border: '1px solid #86efac'
                      }}>
                        Active Matching
                      </span>
                    </div>
                    {item.updatedAt && (
                      <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                        Saved {new Date(item.updatedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {/* 3-column stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'block' }}>Quantity Range</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                        {item.minQuantityKg} kg – {item.maxQuantityKg} kg
                      </span>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'block' }}>Max Target Budget</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#059669' }}>
                        Rs. {Number(item.maxPricePerKg).toLocaleString()} / kg
                      </span>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'block' }}>City / Location</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                        {item.preferredCity || 'Island-wide (Any)'}
                      </span>
                    </div>
                  </div>

                  {item.notes && (
                    <div style={{ background: '#f1f5f9', padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem', color: '#334155', marginBottom: 14 }}>
                      <strong>Notes:</strong> {item.notes}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 12, flexWrap: 'wrap', gap: 8 }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleFindCatchesForPref(item)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', fontSize: '0.82rem', margin: 0 }}
                    >
                      <Bot size={15} /> Find Catches for This ({item.preferredSpecies || 'Any'})
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => handleEditPreference(item)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: '0.8rem' }}
                      >
                        <Edit3 size={14} /> Edit
                      </button>
                      {item.id && (
                        <button
                          type="button"
                          className="btn-outline"
                          disabled={deletingId === item.id}
                          onClick={() => handleDeletePreferenceItem(item.id!)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: '0.8rem',
                            color: '#dc2626', borderColor: '#fca5a5', background: '#fff'
                          }}
                        >
                          <Trash2 size={14} /> {deletingId === item.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Preferences Form Tab (Original form always accessible) ─────────── */}
      {activeTab === 'preferences' && (
        <div style={{ maxWidth: 680 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.25rem', color: '#1e293b' }}>
                <Settings size={22} color="#005b96" /> {editingId ? '✏️ Edit Buying Preference' : '⚙️ My Preferences (Form)'}
              </h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem' }}>
                {editingId
                  ? 'Update your selected preference criteria below. Changes will be reflected in your Saved Preferences list.'
                  : 'Enter your preferred fish, quantity, and budget below. When saved, it will be added to your Saved Preferences list and used by the AI engine.'}
              </p>
            </div>
            {savedPrefsList.length > 0 && (
              <button
                type="button"
                className="btn-outline"
                onClick={() => switchTab('saved-preferences')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: '0.82rem' }}
              >
                <SlidersHorizontal size={14} /> View Saved List ({savedPrefsList.length})
              </button>
            )}
          </div>

          {prefSaved && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#d1fae5',
              border: '1px solid #6ee7b7', borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
              <CheckCircle color="#059669" size={20} />
              <div>
                <p style={{ margin: 0, color: '#065f46', fontWeight: 700, fontSize: '0.92rem' }}>
                  Preference Saved to List!
                </p>
                <p style={{ margin: '2px 0 0', color: '#047857', fontSize: '0.82rem' }}>
                  Live market recommendations have been updated with these criteria.
                </p>
              </div>
            </div>
          )}

          {prefError && (
            <div style={{ display: 'flex', gap: 8, background: '#fee2e2', border: '1px solid #fca5a5',
              borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <AlertCircle color="#ef4444" size={16} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, color: '#991b1b', fontSize: '0.85rem' }}>{prefError}</p>
            </div>
          )}

          <form onSubmit={handleSavePreference} className="workflow-card">
            <div style={{ display: 'grid', gap: 16 }}>

              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ margin: 0 }}>Preferred Fish Species</label>
                  {speciesOption === '__custom__' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSpeciesOption('');
                        setCustomSpeciesInput('');
                        setPref({ ...pref, preferredSpecies: '' });
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0284c7',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline'
                      }}
                    >
                      ← Back to standard list
                    </button>
                  )}
                </div>

                <select
                  value={speciesOption}
                  onChange={e => {
                    const val = e.target.value;
                    setSpeciesOption(val);
                    if (val !== '__custom__') {
                      setPref({ ...pref, preferredSpecies: val });
                    }
                  }}
                >
                  <option value="">Any species (No preference)</option>
                  <optgroup label="Popular Species">
                    {PRESET_SPECIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </optgroup>
                  {discoveredSpecies.length > 0 && (
                    <optgroup label="Other Species in Market">
                      {discoveredSpecies.map(s => <option key={s} value={s}>{s}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Custom Fish Option">
                    <option value="__custom__">✨ + Other (Add custom fish species)...</option>
                  </optgroup>
                </select>

                {speciesOption === '__custom__' && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: '0.78rem', color: '#0369a1', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Enter Custom Fish Species Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      autoFocus
                      maxLength={80}
                      placeholder="e.g. Thalapath, Modha, Lobster, Kattawa..."
                      value={customSpeciesInput}
                      onChange={e => {
                        const val = e.target.value;
                        setCustomSpeciesInput(val);
                        setPref({ ...pref, preferredSpecies: val });
                        clearFieldError('species');
                      }}
                      style={{
                        padding: 10,
                        border: fieldErrors.species ? '1.5px solid #ef4444' : '1.5px solid #0284c7',
                        borderRadius: 6,
                        fontSize: '0.92rem',
                        width: '100%',
                        boxSizing: 'border-box',
                        background: fieldErrors.species ? '#fef2f2' : undefined
                      }}
                    />
                    {fieldErrors.species && (
                      <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertCircle size={13} /> {fieldErrors.species}
                      </p>
                    )}
                  </div>
                )}

                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Species match gives 40 points in the AI recommendation score.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Min Quantity (kg) <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="number"
                    min="0"
                    max="50000"
                    value={pref.minQuantityKg}
                    onChange={e => {
                      setPref({ ...pref, minQuantityKg: Number(e.target.value) });
                      clearFieldError('minQty');
                      clearFieldError('maxQty');
                    }}
                    style={{
                      border: fieldErrors.minQty ? '1.5px solid #ef4444' : undefined,
                      background: fieldErrors.minQty ? '#fef2f2' : undefined
                    }}
                  />
                  {fieldErrors.minQty && (
                    <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertCircle size={13} /> {fieldErrors.minQty}
                    </p>
                  )}
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Max Quantity (kg) <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="number"
                    min="1"
                    max="50000"
                    value={pref.maxQuantityKg}
                    onChange={e => {
                      setPref({ ...pref, maxQuantityKg: Number(e.target.value) });
                      clearFieldError('maxQty');
                      clearFieldError('minQty');
                    }}
                    style={{
                      border: fieldErrors.maxQty ? '1.5px solid #ef4444' : undefined,
                      background: fieldErrors.maxQty ? '#fef2f2' : undefined
                    }}
                  />
                  {fieldErrors.maxQty && (
                    <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertCircle size={13} /> {fieldErrors.maxQty}
                    </p>
                  )}
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Maximum Price (Rs/kg) <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="number"
                  min="50"
                  max="100000"
                  value={pref.maxPricePerKg}
                  onChange={e => {
                    setPref({ ...pref, maxPricePerKg: Number(e.target.value) });
                    clearFieldError('maxPrice');
                  }}
                  placeholder="e.g. 2500"
                  style={{
                    border: fieldErrors.maxPrice ? '1.5px solid #ef4444' : undefined,
                    background: fieldErrors.maxPrice ? '#fef2f2' : undefined
                  }}
                />
                {fieldErrors.maxPrice ? (
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={13} /> {fieldErrors.maxPrice}
                  </p>
                ) : (
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                    Catches within your budget get up to 20 extra points.
                  </p>
                )}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Preferred City / Area</label>
                <select value={pref.preferredCity}
                  onChange={e => setPref({ ...pref, preferredCity: e.target.value })}>
                  {CITIES.map(c => <option key={c} value={c}>{c || 'Any location'}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ margin: 0 }}>Additional Notes (optional)</label>
                  <span style={{ fontSize: '0.72rem', color: (pref.notes?.length ?? 0) > 300 ? '#ef4444' : '#94a3b8' }}>
                    {pref.notes?.length ?? 0}/300
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={300}
                  value={pref.notes}
                  onChange={e => {
                    setPref({ ...pref, notes: e.target.value });
                    clearFieldError('notes');
                  }}
                  placeholder="e.g. Fresh only, minimum quality A"
                  style={{
                    border: fieldErrors.notes ? '1.5px solid #ef4444' : undefined,
                    background: fieldErrors.notes ? '#fef2f2' : undefined
                  }}
                />
                {fieldErrors.notes && (
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={13} /> {fieldErrors.notes}
                  </p>
                )}
              </div>
            </div>

            {/* Score breakdown info */}
            <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '12px 14px',
              margin: '20px 0', border: '1px solid #bae6fd' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#0369a1', fontSize: '0.85rem' }}>
                📊 How your recommendation score is calculated:
              </p>
              {[
                ['Species match',    '40 pts'],
                ['Quantity range',   '25 pts'],
                ['Price within budget', '20 pts'],
                ['Location match',   '10 pts'],
                ['Past bid history', '10 pts'],
                ['Quality + freshness', '10 pts'],
              ].map(([label, pts]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
                  fontSize: '0.8rem', color: '#334155', marginBottom: 3 }}>
                  <span>{label}</span>
                  <strong style={{ color: '#005b96' }}>{pts}</strong>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {editingId && (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => {
                    setEditingId(null);
                    setPref(EMPTY_PREF);
                    setSpeciesOption('');
                    setCustomSpeciesInput('');
                    setFieldErrors({});
                    switchTab('saved-preferences');
                  }}
                  style={{ flex: 1, padding: '10px 18px', marginTop: 0 }}
                >
                  Cancel Edit
                </button>
              )}
              <button type="submit" className="btn-primary"
                disabled={prefSaving}
                style={{ flex: 2, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8, marginTop: 0, opacity: prefSaving ? 0.7 : 1 }}>
                {prefSaving
                  ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                  : <><Save size={16} /> {editingId ? 'Update Preference' : 'Save Preference to My List'}</>}
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};
