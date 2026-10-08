import React, { useState, useEffect, useRef } from 'react';
import { Camera, MapPin, CheckCircle, Edit, Trash2, X, Ban, Send, AlertCircle, Bot, Users, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL, formatErrorMessage } from '../../config/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CatchRecord {
  id: number;
  fishermanId?: number;
  fishSpecies: string;
  quantityKg: number;
  askingPricePerKg: number;
  location: string;
  status: string;
  photoUrl?: string;
  // Quality & fraud fields
  verifiedWeightKg?: number;
  declaredQualityGrade?: string;
  inspectionResult?: string;
  catchDateTime?: string;
  fraudRisk?: string;
  weightDiscrepancyPct?: number;
  validationSummary?: string;
  requiresAdminReview?: boolean;
  qualityScore?: number;
  sellerNote?: string;
}

interface BidRecord {
  id: number;
  bidPricePerKg: number;
  bidTime: string;
  status: string;
  buyer?: {
    id: number;
    fullName: string;
    email: string;
  };
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { emoji: string; label: string; color: string; bg: string; border: string }> = {
  Draft:           { emoji: '🟡', label: 'Draft',            color: '#92400e', bg: '#fef3c7', border: '#f59e0b' },
  Published:       { emoji: '🟢', label: 'Published',        color: '#065f46', bg: '#d1fae5', border: '#10b981' },
  Bidding:         { emoji: '🔵', label: 'Bidding',          color: '#1e40af', bg: '#dbeafe', border: '#3b82f6' },
  PendingApproval: { emoji: '🟠', label: 'Pending Approval', color: '#9a3412', bg: '#ffedd5', border: '#f97316' },
  Sold:            { emoji: '🟣', label: 'Sold',             color: '#4c1d95', bg: '#ede9fe', border: '#8b5cf6' },
  Cancelled:       { emoji: '🔴', label: 'Cancelled',        color: '#991b1b', bg: '#fee2e2', border: '#ef4444' },
  Expired:         { emoji: '⚪', label: 'Expired',          color: '#374151', bg: '#f3f4f6', border: '#9ca3af' },
};

// Statuses where Edit is allowed
const EDITABLE = ['Draft', 'Published'];
// Statuses where Cancel is allowed
const CANCELLABLE = ['Draft', 'Published'];
// Statuses where Publish button shows
const PUBLISHABLE = ['Draft'];
// Statuses where Delete (full remove) is allowed
const DELETABLE = ['Draft'];

const getStatusCfg = (status: string) =>
  STATUS_CONFIG[status] ?? { emoji: '⚫', label: status, color: '#334155', bg: '#f1f5f9', border: '#94a3b8' };

// ── Status Badge ──────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cfg = getStatusCfg(status);
  return (
    <span style={{
      padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {cfg.emoji} {cfg.label}
    </span>
  );
};

// ── CatchForm ─────────────────────────────────────────────────────────────────

interface CatchFormProps {
  editId: number | null;
  initialSpecies: string;
  initialQuantity: string;
  initialPrice: string;
  initialLocation: string | null;
  initialVerifiedWeight?: string;
  initialQualityGrade?: string;
  initialInspectionResult?: string;
  initialCatchDateTime?: string;
  initialSellerNote?: string;
  onCancel: () => void;
  onSaved: () => void;
}

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

const CatchForm: React.FC<CatchFormProps> = ({
  editId, initialSpecies, initialQuantity, initialPrice, initialLocation,
  initialVerifiedWeight, initialQualityGrade, initialInspectionResult,
  initialCatchDateTime, initialSellerNote,
  onCancel, onSaved,
}) => {
  const isInitialCustom = Boolean(initialSpecies && !PRESET_SPECIES.includes(initialSpecies));
  const [selectedSpeciesOption, setSelectedSpeciesOption] = useState<string>(
    isInitialCustom ? '__custom__' : (initialSpecies || PRESET_SPECIES[0])
  );
  const [customSpeciesName, setCustomSpeciesName] = useState<string>(
    isInitialCustom ? initialSpecies : ''
  );
  const [quantity,         setQuantity]         = useState(initialQuantity);
  const [price,            setPrice]            = useState(initialPrice);
  const [location,         setLocation]         = useState<string | null>(initialLocation);
  const [verifiedWeight,   setVerifiedWeight]   = useState(initialVerifiedWeight ?? '');
  const [qualityGrade,     setQualityGrade]     = useState(initialQualityGrade ?? '');
  const [inspectionResult, setInspectionResult] = useState(initialInspectionResult ?? 'Pending');
  const [catchDateTime,    setCatchDateTime]    = useState(initialCatchDateTime ?? '');
  const [sellerNote,       setSellerNote]       = useState(initialSellerNote ?? '');
  const [photoBase64,      setPhotoBase64]      = useState('');
  const [photoPreview,     setPhotoPreview]     = useState('');
  const [submitted,        setSubmitted]        = useState(false);
  const [error,            setError]            = useState('');
  const [fieldErrors,      setFieldErrors]      = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Photo size exceeds 5MB limit. Please upload a smaller photo.');
      return;
    }
    setPhotoPreview(URL.createObjectURL(file));
    const reader = new FileReader();
    reader.onloadend = () => setPhotoBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
        ()    => setLocation('Negombo Pier (Simulated)')
      );
    } else {
      setLocation('Negombo Pier (Simulated)');
    }
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    const resolvedSpecies = selectedSpeciesOption === '__custom__'
      ? customSpeciesName.trim()
      : selectedSpeciesOption;

    if (!resolvedSpecies) {
      errs.species = selectedSpeciesOption === '__custom__'
        ? 'Please enter the custom fish species name.'
        : 'Please select a fish species.';
    } else if (resolvedSpecies.length > 80) {
      errs.species = 'Fish species name cannot exceed 80 characters.';
    }

    const qtyNum = Number(quantity);
    if (!quantity || isNaN(qtyNum) || qtyNum <= 0) {
      errs.quantity = 'Quantity must be a positive number greater than 0 kg.';
    } else if (qtyNum > 10000) {
      errs.quantity = 'Quantity cannot exceed 10,000 kg.';
    }

    const priceNum = Number(price);
    if (!price || isNaN(priceNum) || priceNum <= 0) {
      errs.price = 'Asking price must be a positive number greater than 0.';
    } else if (priceNum < 50) {
      errs.price = 'Asking price must be at least Rs. 50/kg.';
    } else if (priceNum > 100000) {
      errs.price = 'Asking price cannot exceed Rs. 100,000/kg.';
    }

    if (verifiedWeight) {
      const vWeightNum = Number(verifiedWeight);
      if (isNaN(vWeightNum) || vWeightNum <= 0) {
        errs.verifiedWeight = 'Verified weight must be greater than 0 kg.';
      } else if (vWeightNum > 10000) {
        errs.verifiedWeight = 'Verified weight cannot exceed 10,000 kg.';
      }
    }

    if (!qualityGrade) {
      errs.qualityGrade = 'Please select a declared quality grade (A+, A, B, or C).';
    }

    if (catchDateTime) {
      const catchDate = new Date(catchDateTime);
      const now = new Date();
      if (isNaN(catchDate.getTime())) {
        errs.catchDateTime = 'Invalid catch date and time.';
      } else if (catchDate > now) {
        errs.catchDateTime = 'Catch date & time cannot be in the future.';
      } else if (now.getTime() - catchDate.getTime() > 30 * 24 * 60 * 60 * 1000) {
        errs.catchDateTime = 'Catch date cannot be older than 30 days.';
      }
    }

    if (sellerNote && sellerNote.length > 500) {
      errs.sellerNote = 'Seller note cannot exceed 500 characters.';
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      setError('Please review and correct the highlighted fields before submitting.');
      return;
    }

    const finalSpecies = selectedSpeciesOption === '__custom__'
      ? customSpeciesName.trim()
      : selectedSpeciesOption;

    try {
      const payload = {
        fishSpecies:          finalSpecies,
        quantityKg:           Number(quantity),
        askingPricePerKg:     Number(price),
        location:             location || 'Pending Location',
        photoUrl:             photoBase64 || '',
        verifiedWeightKg:     verifiedWeight ? Number(verifiedWeight) : 0,
        declaredQualityGrade: qualityGrade,
        inspectionResult:     inspectionResult,
        catchDateTime:        catchDateTime || null,
        sellerNote:           sellerNote,
      };
      if (editId !== null) {
        await axios.put(`${API_BASE_URL}/api/Catches/${editId}`, payload, getAuthHeader());
      } else {
        await axios.post(`${API_BASE_URL}/api/Catches`, payload, getAuthHeader());
      }
      setSubmitted(true);
      setTimeout(() => onSaved(), 1800);
    } catch (err: any) {
      setError(formatErrorMessage(err, 'Error saving catch.'));
    }
  };

  // Real-time weight discrepancy calculation for AI awareness
  const declaredQty = Number(quantity);
  const vWeight = Number(verifiedWeight);
  const weightDiffPct = (declaredQty > 0 && vWeight > 0)
    ? Math.abs(declaredQty - vWeight) / declaredQty * 100
    : 0;

  if (submitted) {
    return (
      <div className="workflow-card" style={{ textAlign: 'center', padding: '40px', borderLeftColor: '#10b981' }}>
        <CheckCircle color="#10b981" size={60} style={{ margin: '0 auto 20px' }} />
        <h3>{editId ? 'Catch Updated!' : 'Catch Saved as Draft!'}</h3>
        <p style={{ color: '#64748b' }}>
          {editId ? 'Your changes have been saved.' : 'Your catch is saved as Draft. Publish it when ready.'}
        </p>
      </div>
    );
  }

  return (
    <div className="workflow-card">
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fee2e2',
          border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <AlertCircle color="#ef4444" size={18} style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, color: '#991b1b', fontSize: '0.9rem' }}>{typeof error === 'string' ? error : formatErrorMessage(error)}</p>
        </div>
      )}
      <form onSubmit={handleSubmit} className="auth-form" style={{ maxWidth: '520px' }}>
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ margin: 0 }}>Fish Species <span style={{ color: '#ef4444' }}>*</span></label>
            {selectedSpeciesOption === '__custom__' && (
              <button
                type="button"
                onClick={() => {
                  setSelectedSpeciesOption(PRESET_SPECIES[0]);
                  clearFieldError('species');
                }}
                style={{
                  background: 'none', border: 'none', color: '#0284c7', fontSize: '0.78rem',
                  cursor: 'pointer', padding: 0, textDecoration: 'underline'
                }}
              >
                ← Back to standard list
              </button>
            )}
          </div>

          <select
            required
            value={selectedSpeciesOption}
            onChange={(e) => {
              setSelectedSpeciesOption(e.target.value);
              clearFieldError('species');
            }}
            style={{ borderColor: fieldErrors.species ? '#ef4444' : undefined }}
          >
            <optgroup label="Popular Species">
              {PRESET_SPECIES.map(sp => (
                <option key={sp} value={sp}>{sp}</option>
              ))}
            </optgroup>
            <optgroup label="Custom Option">
              <option value="__custom__">✨ + Other (Add custom fish species)...</option>
            </optgroup>
          </select>

          {selectedSpeciesOption === '__custom__' && (
            <div style={{ marginTop: '8px' }}>
              <label style={{ fontSize: '0.78rem', color: '#0369a1', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Enter Custom Fish Species Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                autoFocus
                maxLength={80}
                placeholder="e.g. Thalapath, Seer Fish (Thora), Modha, Lobster..."
                value={customSpeciesName}
                onChange={(e) => {
                  setCustomSpeciesName(e.target.value);
                  clearFieldError('species');
                }}
                style={{ borderColor: fieldErrors.species ? '#ef4444' : undefined }}
              />
            </div>
          )}

          {fieldErrors.species && (
            <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '3px', display: 'block' }}>
              {fieldErrors.species}
            </span>
          )}
        </div>
        <div className="form-group">
          <label>Quantity (kg) <span style={{ color: '#ef4444' }}>*</span></label>
          <input
            type="number"
            min="1"
            max="10000"
            step="any"
            placeholder="e.g. 150"
            required
            value={quantity}
            onChange={(e) => { setQuantity(e.target.value); clearFieldError('quantity'); }}
            style={{ borderColor: fieldErrors.quantity ? '#ef4444' : undefined }}
          />
          {fieldErrors.quantity && (
            <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '3px', display: 'block' }}>
              {fieldErrors.quantity}
            </span>
          )}
        </div>
        <div className="form-group">
          <label>Asking Price (Rs/kg) <span style={{ color: '#ef4444' }}>*</span></label>
          <input
            type="number"
            min="50"
            max="100000"
            step="any"
            placeholder="e.g. 1400"
            required
            value={price}
            onChange={(e) => { setPrice(e.target.value); clearFieldError('price'); }}
            style={{ borderColor: fieldErrors.price ? '#ef4444' : undefined }}
          />
          {fieldErrors.price && (
            <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '3px', display: 'block' }}>
              {fieldErrors.price}
            </span>
          )}
        </div>

        {/* ── Quality & Inspection Fields ── */}
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px',
          padding: '16px', marginTop: '4px' }}>
          <p style={{ margin: '0 0 14px', fontWeight: 700, color: '#0369a1', fontSize: '0.88rem',
            display: 'flex', alignItems: 'center', gap: '6px' }}>
            🔍 Quality & Inspection Details
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Verified Weight (kg)</label>
              <input
                type="number"
                min="1"
                max="10000"
                step="any"
                placeholder="e.g. 98"
                value={verifiedWeight}
                onChange={e => { setVerifiedWeight(e.target.value); clearFieldError('verifiedWeight'); }}
                style={{ borderColor: fieldErrors.verifiedWeight ? '#ef4444' : undefined }}
              />
              {fieldErrors.verifiedWeight ? (
                <span style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: '3px', display: 'block' }}>
                  {fieldErrors.verifiedWeight}
                </span>
              ) : (
                <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                  Physical weight at pier
                </p>
              )}
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label>Declared Quality Grade <span style={{ color: '#ef4444' }}>*</span></label>
              <select
                value={qualityGrade}
                onChange={e => { setQualityGrade(e.target.value); clearFieldError('qualityGrade'); }}
                style={{ borderColor: fieldErrors.qualityGrade ? '#ef4444' : undefined }}
              >
                <option value="">Select grade</option>
                <option value="A+">A+ (Premium)</option>
                <option value="A">A (Good)</option>
                <option value="B">B (Average)</option>
                <option value="C">C (Below avg)</option>
              </select>
              {fieldErrors.qualityGrade && (
                <span style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: '3px', display: 'block' }}>
                  {fieldErrors.qualityGrade}
                </span>
              )}
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label>Inspection Result</label>
              <select value={inspectionResult} onChange={e => setInspectionResult(e.target.value)}>
                <option value="Pending">Pending</option>
                <option value="Passed">✅ Passed</option>
                <option value="Failed">❌ Failed</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label>Catch Date & Time</label>
              <input
                type="datetime-local"
                max={new Date().toISOString().slice(0, 16)}
                value={catchDateTime}
                onChange={e => { setCatchDateTime(e.target.value); clearFieldError('catchDateTime'); }}
                style={{ borderColor: fieldErrors.catchDateTime ? '#ef4444' : undefined }}
              />
              {fieldErrors.catchDateTime && (
                <span style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: '3px', display: 'block' }}>
                  {fieldErrors.catchDateTime}
                </span>
              )}
            </div>
          </div>

          {/* AI Discrepancy Insight Alert */}
          {weightDiffPct > 15 && (
            <div style={{
              marginTop: '12px',
              padding: '8px 12px',
              background: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: '6px',
              fontSize: '0.76rem',
              color: '#92400e',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>⚠️</span>
              <span>
                <strong>Weight Discrepancy ({weightDiffPct.toFixed(1)}%):</strong> Differences over 15% will be flagged for review by the AI Quality Agent.
              </span>
            </div>
          )}

          <div className="form-group" style={{ margin: '12px 0 0' }}>
            <label>Seller Note (optional)</label>
            <input
              type="text"
              maxLength={500}
              placeholder="e.g. Fresh morning catch, iced immediately"
              value={sellerNote}
              onChange={e => { setSellerNote(e.target.value); clearFieldError('sellerNote'); }}
            />
            {fieldErrors.sellerNote && (
              <span style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: '3px', display: 'block' }}>
                {fieldErrors.sellerNote}
              </span>
            )}
          </div>
        </div>

        {/* Photo */}
        <div className="form-group">
          <label>Catch Photo</label>
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handlePhotoUpload} />
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className={photoBase64 ? 'btn-primary' : 'btn-outline'}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: 'fit-content' }}>
            {photoBase64 ? <CheckCircle size={18} /> : <Camera size={18} />}
            {photoBase64 ? 'Photo Attached ✓' : 'Upload Photo'}
          </button>
          {photoPreview && (
            <div style={{ marginTop: '12px', position: 'relative', display: 'inline-block' }}>
              <img src={photoPreview} alt="Preview"
                style={{ width: '200px', height: '140px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #10b981' }} />
              <button type="button" onClick={() => { setPhotoBase64(''); setPhotoPreview(''); }}
                style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', border: 'none',
                  borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* GPS */}
        <div className="form-group">
          <label>GPS Location</label>
          <button type="button" onClick={handleGetLocation}
            className={location ? 'btn-primary' : 'btn-outline'}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: 'fit-content' }}>
            {location ? <CheckCircle size={18} /> : <MapPin size={18} />}
            {location ?? 'Get GPS Location'}
          </button>
        </div>

        <button type="submit" className="btn-primary" style={{ marginTop: '20px', width: '100%' }}>
          {editId ? '💾 Save Changes' : '📋 Save as Draft'}
        </button>
      </form>
    </div>
  );
};

// ── Catch Bids & Highest Bid Section ──────────────────────────────────────────

const CatchBidsSection: React.FC<{
  catchId: number;
  askingPrice: number;
  quantityKg: number;
  catchStatus?: string;
  onActionCompleted?: () => void;
}> = ({ catchId, askingPrice, quantityKg, catchStatus, onActionCompleted }) => {
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchBids = () => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    axios.get<BidRecord[]>(`${API_BASE_URL}/api/Bids/catch/${catchId}`, { headers })
      .then(res => {
        if (Array.isArray(res.data)) {
          setBids(res.data);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchBids();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catchId]);

  const handleAcceptBid = async (bid: BidRecord) => {
    const totalAmount = Number(bid.bidPricePerKg) * quantityKg;
    const confirmed = window.confirm(
      `Accept bid from ${bid.buyer?.fullName || 'Buyer'} for Rs. ${Number(bid.bidPricePerKg).toLocaleString()}/kg?\n\n` +
      `• Catch Weight: ${quantityKg} kg\n` +
      `• Total Deal Amount: Rs. ${totalAmount.toLocaleString()}\n\n` +
      `Accepting will finalize this deal, close bidding, mark other bids as lost, and dispatch the Logistics Agent.`
    );
    if (!confirmed) return;

    setActionLoadingId(bid.id);
    setFeedback(null);
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      await axios.patch(`${API_BASE_URL}/api/Bids/${bid.id}/accept`, {}, { headers });
      setBids(prev => prev.map(b => b.id === bid.id ? { ...b, status: 'Accepted' } : { ...b, status: 'Lost' }));
      setFeedback({
        type: 'success',
        message: `🎉 Bid from ${bid.buyer?.fullName || 'Buyer'} accepted! Sales order created and catch marked as Sold.`
      });

      // Notify Buyer and Admin in real time
      try {
        const acceptedInfo = {
          bidId: bid.id,
          buyerName: bid.buyer?.fullName || 'Buyer',
          buyerId: bid.buyer?.id || 1,
          price: Number(bid.bidPricePerKg),
          time: new Date().toISOString(),
          quantityKg: quantityKg,
          species: 'Yellowfin Tuna'
        };
        localStorage.setItem('fishlink_latest_accepted_bid', JSON.stringify(acceptedInfo));
        window.dispatchEvent(new CustomEvent('fishlink:bid_accepted', { detail: acceptedInfo }));
      } catch {}

      if (onActionCompleted) onActionCompleted();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data || 'Failed to accept bid. Please try again.';
      setFeedback({ type: 'error', message: String(msg) });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectBid = async (bid: BidRecord) => {
    const confirmed = window.confirm(
      `Are you sure you want to reject the bid of Rs. ${Number(bid.bidPricePerKg).toLocaleString()}/kg from ${bid.buyer?.fullName || 'Buyer'}?`
    );
    if (!confirmed) return;

    setActionLoadingId(bid.id);
    setFeedback(null);
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      await axios.patch(`${API_BASE_URL}/api/Bids/${bid.id}/reject`, {}, { headers });
      setBids(prev => prev.map(b => b.id === bid.id ? { ...b, status: 'Rejected' } : b));
      setFeedback({
        type: 'success',
        message: `Bid of Rs. ${Number(bid.bidPricePerKg).toLocaleString()}/kg was rejected.`
      });
      if (onActionCompleted) onActionCompleted();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data || 'Failed to reject bid. Please try again.';
      setFeedback({ type: 'error', message: String(msg) });
    } finally {
      setActionLoadingId(null);
    }
  };

  if (bids.length === 0) {
    return (
      <div style={{ marginTop: '10px', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '0.82rem', color: '#64748b' }}>
        ⏳ Awaiting initial buyer bids...
      </div>
    );
  }

  const acceptedBid = bids.find(b => b.status === 'Accepted');
  const activeBids = bids.filter(b => b.status !== 'Rejected' && b.status !== 'Lost');
  const highestBid = activeBids.length > 0
    ? Math.max(...activeBids.map(b => Number(b.bidPricePerKg)))
    : Math.max(...bids.map(b => Number(b.bidPricePerKg)));
  const highestBidObj = (activeBids.length > 0 ? activeBids : bids).find(b => Number(b.bidPricePerKg) === highestBid);
  const diffFromAsking = askingPrice > 0 ? ((highestBid - askingPrice) / askingPrice * 100).toFixed(1) : '0';

  const isSold = catchStatus === 'Sold' || !!acceptedBid;

  return (
    <div style={{
      marginTop: '12px',
      background: isSold ? '#f5f3ff' : '#f0fdf4',
      border: `1px solid ${isSold ? '#c4b5fd' : '#86efac'}`,
      borderRadius: '10px',
      padding: '12px 14px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          {acceptedBid ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.98rem', fontWeight: 800, color: '#6d28d9' }}>
                  🏆 Accepted Winning Bid: Rs. {Number(acceptedBid.bidPricePerKg).toLocaleString()}/kg
                </span>
                <span style={{
                  padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700,
                  background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd'
                }}>
                  ✅ DEAL CLOSED
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#5b21b6' }}>
                Winner: <strong>{acceptedBid.buyer?.fullName ?? 'Buyer'}</strong> · Total Value: <strong>Rs. {(Number(acceptedBid.bidPricePerKg) * quantityKg).toLocaleString()}</strong>
              </p>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.98rem', fontWeight: 800, color: '#15803d' }}>
                  🏆 Current Highest Bid: Rs. {highestBid.toLocaleString()}/kg
                </span>
                <span style={{
                  padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700,
                  background: Number(diffFromAsking) >= 0 ? '#dcfce7' : '#fee2e2',
                  color: Number(diffFromAsking) >= 0 ? '#166534' : '#991b1b'
                }}>
                  {Number(diffFromAsking) >= 0 ? `+${diffFromAsking}%` : `${diffFromAsking}%`} vs asking
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#166534' }}>
                Placed by <strong>{highestBidObj?.buyer?.fullName ?? 'Verified Buyer'}</strong> · Total value: <strong>Rs. {(highestBid * quantityKg).toLocaleString()}</strong>
              </p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Quick-action top accept button if highest bid is pending and not yet sold */}
          {!isSold && highestBidObj && (highestBidObj.status === 'Pending' || !highestBidObj.status) && (
            <button
              type="button"
              onClick={() => handleAcceptBid(highestBidObj)}
              disabled={actionLoadingId !== null}
              style={{
                background: '#16a34a', color: '#ffffff', border: 'none',
                borderRadius: '6px', padding: '6px 14px', fontSize: '0.82rem', fontWeight: 700,
                cursor: actionLoadingId !== null ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
                boxShadow: '0 2px 5px rgba(22,163,74,0.3)',
                transition: 'all 0.15s ease'
              }}
            >
              {actionLoadingId === highestBidObj.id ? '⏳ Accepting...' : `✓ Accept Top Bid (Rs. ${highestBid.toLocaleString()}/kg)`}
            </button>
          )}

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              background: '#ffffff',
              border: `1px solid ${isSold ? '#8b5cf6' : '#10b981'}`,
              color: isSold ? '#6d28d9' : '#047857',
              borderRadius: '6px', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            {expanded ? '▲ Hide Bids' : `▼ View All Bids (${bids.length})`}
          </button>
        </div>
      </div>

      {feedback && (
        <div style={{
          marginTop: '10px',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '0.82rem',
          fontWeight: 600,
          background: feedback.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: feedback.type === 'success' ? '#15803d' : '#b91c1c',
          border: `1px solid ${feedback.type === 'success' ? '#86efac' : '#fca5a5'}`
        }}>
          {feedback.message}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: '12px', borderTop: `1px solid ${isSold ? '#ddd6fe' : '#bbf7d0'}`, paddingTop: '10px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 700, color: isSold ? '#6d28d9' : '#166534', textTransform: 'uppercase' }}>
            Buyer Bids Overview ({bids.length}):
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {bids.slice().sort((a, b) => Number(b.bidPricePerKg) - Number(a.bidPricePerKg)).map((b, idx) => {
              const isBidAccepted = b.status === 'Accepted';
              const isBidRejected = b.status === 'Rejected';
              const isBidLost     = b.status === 'Lost';
              const isBidPending  = !b.status || b.status === 'Pending';
              const canAct        = isBidPending && !isSold;

              return (
                <div
                  key={b.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
                    background: isBidAccepted ? '#f0fdf4' : isBidRejected ? '#fef2f2' : idx === 0 && !isSold ? '#f0fdf4' : '#ffffff',
                    border: `1px solid ${isBidAccepted ? '#86efac' : isBidRejected ? '#fca5a5' : idx === 0 && !isSold ? '#86efac' : '#e2e8f0'}`,
                    borderRadius: '8px', padding: '10px 14px', fontSize: '0.82rem'
                  }}
                >
                  <div style={{ flex: '1 1 200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#1e293b' }}>
                        {idx === 0 && '🥇 '}{idx === 1 && '🥈 '}{idx === 2 && '🥉 '}
                        {b.buyer?.fullName || `Buyer #${b.id}`}
                      </span>
                      {b.buyer?.email && (
                        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                          ({b.buyer.email})
                        </span>
                      )}
                      {/* Status Badges */}
                      {isBidAccepted && (
                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                          ✅ Accepted Winner
                        </span>
                      )}
                      {isBidRejected && (
                        <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                          ❌ Rejected
                        </span>
                      )}
                      {isBidLost && (
                        <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600 }}>
                          Outbid / Lost
                        </span>
                      )}
                      {isBidPending && (
                        <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                          ⏳ Pending Decision
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px' }}>
                      Bid placed: {new Date(b.bidTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(b.bidTime).toLocaleDateString()})
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: '#0f766e', fontSize: '0.95rem' }}>
                        Rs. {Number(b.bidPricePerKg).toLocaleString()}/kg
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Total: Rs. {(Number(b.bidPricePerKg) * quantityKg).toLocaleString()}
                      </div>
                    </div>

                    {/* Action buttons for Fisherman */}
                    {canAct && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleAcceptBid(b)}
                          disabled={actionLoadingId !== null}
                          title="Accept this bid and finalize the deal"
                          style={{
                            background: '#16a34a', color: '#ffffff', border: 'none',
                            borderRadius: '6px', padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700,
                            cursor: actionLoadingId !== null ? 'not-allowed' : 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            boxShadow: '0 1px 3px rgba(22,163,74,0.3)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {actionLoadingId === b.id ? '⏳' : '✓ Accept'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectBid(b)}
                          disabled={actionLoadingId !== null}
                          title="Reject this bid"
                          style={{
                            background: '#ffffff', color: '#dc2626', border: '1px solid #fca5a5',
                            borderRadius: '6px', padding: '6px 10px', fontSize: '0.78rem', fontWeight: 600,
                            cursor: actionLoadingId !== null ? 'not-allowed' : 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          ✕ Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Buyer Match Panel (shown on Published/Bidding cards) ─────────────────────

interface BuyerMatch {
  id: number;
  fishSpecies: string;
  quantityKg: number;
  askingPricePerKg: number;
  location: string;
  fishermanName: string;
  matchScore: number;
  matchReasons: string;
  qualityGrade: string;
}

const matchColor = (s: number) => s >= 80 ? '#059669' : s >= 60 ? '#d97706' : '#6b7280';
const matchBg    = (s: number) => s >= 80 ? '#d1fae5' : s >= 60 ? '#fef3c7' : '#f3f4f6';

const BuyerMatchPanel: React.FC<{ c: CatchRecord }> = ({ c }) => {
  const [open,          setOpen]          = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [matches,       setMatches]       = useState<BuyerMatch[]>([]);
  const [fetched,       setFetched]       = useState(false);
  const [error,         setError]         = useState('');
  const [selectedBuyer, setSelectedBuyer] = useState<{ id: number; name: string } | null>(null);

  const fetchMatches = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

      // Use the new preference-based scoring endpoint
      const res = await axios.get<{
        catchId: number;
        totalBuyers: number;
        scoredBuyers: {
          id: number; name: string; email: string;
          matchScore: number; matchReasons: string;
          hasPreference: boolean; totalBids: number;
          preferredSpecies: string; maxBudget: number; preferredCity: string;
        }[]
      }>(`${API_BASE_URL}/api/BuyerMatch/score-buyers/${c.id}`, { headers });

      setMatches(res.data.scoredBuyers as any);
      setFetched(true);
    } catch {
      setError('Could not reach matching service. Make sure the API is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!open && !fetched) fetchMatches();
    setOpen(o => !o);
  };

  // Only show for Published or Bidding catches
  if (!['Published', 'Bidding'].includes(c.status)) return null;

  return (
    <>
    {/* Buyer Profile Modal */}
      {selectedBuyer && (
        <BuyerProfileModal
          buyerId={selectedBuyer.id}
          buyerName={selectedBuyer.name}
          onClose={() => setSelectedBuyer(null)}
        />
      )}
    <div style={{ marginTop: '14px', border: '1px solid #e0f2fe', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Toggle header */}
      <button
        onClick={handleToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: '#f0f9ff', border: 'none', cursor: 'pointer',
          fontSize: '0.85rem', fontWeight: 600, color: '#0369a1',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot size={16} /> 🤖 AI Buyer Matching
          {fetched && !loading && (
            <span style={{ background: matches.length > 0 ? '#dbeafe' : '#fee2e2',
              color: matches.length > 0 ? '#1e40af' : '#991b1b',
              padding: '1px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700 }}>
              {matches.length} match{matches.length !== 1 ? 'es' : ''}
            </span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {fetched && !loading && (
            <RefreshCw size={13} onClick={e => { e.stopPropagation(); setFetched(false); fetchMatches(); }}
              style={{ opacity: 0.6 }} />
          )}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Panel body */}
      {open && (
        <div style={{ padding: '14px', background: 'white' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.85rem' }}>
              <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
              Running AI buyer matching algorithm…
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', gap: '8px', background: '#fee2e2', borderRadius: '6px',
              padding: '10px', fontSize: '0.82rem', color: '#991b1b' }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}

          {!loading && !error && fetched && matches.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '0.85rem' }}>
              <Users size={28} style={{ marginBottom: '6px', opacity: 0.4 }} />
              <p style={{ margin: 0 }}>No buyer matches found yet for this listing.</p>
            </div>
          )}

          {!loading && matches.length > 0 && (
            <div>
              <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b' }}>
                Top {matches.length} registered buyer{matches.length !== 1 ? 's' : ''} — click to view profile:
              </p>
              {matches.map((m: any, i) => (
                <div key={m.id}
                  onClick={() => setSelectedBuyer({ id: m.id, name: m.name })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 12px', marginBottom: '8px',
                    background: i === 0 ? '#f0fdf4' : '#f8fafc',
                    borderRadius: '8px',
                    border: `1px solid ${i === 0 ? '#bbf7d0' : '#e2e8f0'}`,
                    cursor: 'pointer', transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                >
                  {/* Avatar with initial */}
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: i === 0 ? '#10b981' : i === 1 ? '#3b82f6' : '#94a3b8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: 800, fontSize: '0.9rem' }}>
                    {m.name?.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
                        {m.name}
                      </p>
                      {/* Preference badge */}
                      {m.hasPreference ? (
                        <span style={{ padding: '1px 6px', borderRadius: '8px', fontSize: '0.68rem',
                          fontWeight: 700, background: '#dbeafe', color: '#1e40af' }}>
                          ⚙ Prefs set
                        </span>
                      ) : (
                        <span style={{ padding: '1px 6px', borderRadius: '8px', fontSize: '0.68rem',
                          fontWeight: 700, background: '#f3f4f6', color: '#9ca3af' }}>
                          No prefs
                        </span>
                      )}
                      {m.totalBids > 0 && (
                        <span style={{ padding: '1px 6px', borderRadius: '8px', fontSize: '0.68rem',
                          fontWeight: 700, background: '#d1fae5', color: '#059669' }}>
                          {m.totalBids} bid{m.totalBids !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {/* Preference summary */}
                    {m.hasPreference && (
                      <p style={{ margin: '0 0 2px', fontSize: '0.73rem', color: '#0369a1' }}>
                        Wants: {m.preferredSpecies || 'Any'} ·
                        Budget: Rs.{Number(m.maxBudget).toLocaleString()}/kg
                        {m.preferredCity ? ` · ${m.preferredCity}` : ''}
                      </p>
                    )}
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.matchReasons}
                    </p>
                  </div>

                  {/* Score + hint */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 800,
                      background: matchBg(m.matchScore), color: matchColor(m.matchScore),
                    }}>
                      {m.matchScore}%
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>View →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
    </>
  );
};

// ── Buyer Profile Modal ───────────────────────────────────────────────────────

interface BuyerProfile {
  id: number;
  fullName: string;
  email: string;
  joinedAt: string;
  totalBids: number;
  acceptedBids: number;
  pendingBids: number;
  bidHistory: {
    id: number;
    bidPricePerKg: number;
    bidTime: string;
    status: string;
    species: string;
    quantity: number;
    location: string;
  }[];
}

const BuyerProfileModal: React.FC<{ buyerId: number; buyerName: string; onClose: () => void }> = ({ buyerId, buyerName, onClose }) => {
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

    const load = async () => {
      try {
        // If buyerId looks wrong (it may be catch ID), find real buyer ID by name first
        let realId = buyerId;

        // Always look up from buyers list to get correct ID
        const buyersRes = await axios.get<{ id: number; fullName: string }[]>(
          `${API_BASE_URL}/api/BuyerMatch/buyers`, { headers }
        );
        const found = buyersRes.data.find(
          b => b.fullName.toLowerCase() === buyerName.toLowerCase()
        );
        if (found) realId = found.id;

        const res = await axios.get<BuyerProfile>(
          `${API_BASE_URL}/api/BuyerMatch/buyers/${realId}`, { headers }
        );
        setProfile(res.data);
      } catch {
        setError('Could not load buyer profile.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [buyerId, buyerName]);

  const statusColor = (s: string) =>
    s === 'Accepted' ? '#059669' : s === 'Pending' ? '#d97706' : '#ef4444';
  const statusBg = (s: string) =>
    s === 'Accepted' ? '#d1fae5' : s === 'Pending' ? '#fef3c7' : '#fee2e2';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 520,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 48px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dbeafe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem', fontWeight: 800, color: '#1e40af' }}>
              {buyerName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#1e293b' }}>{buyerName}</h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Buyer Profile</p>
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}>
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
              <p style={{ margin: 0 }}>Loading profile…</p>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', gap: 8, background: '#fee2e2', borderRadius: 8,
              padding: 12, color: '#991b1b', fontSize: '0.85rem' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}

          {profile && (
            <>
              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Total Bids',    value: profile.totalBids,    color: '#005b96' },
                  { label: 'Accepted',      value: profile.acceptedBids, color: '#059669' },
                  { label: 'Pending',       value: profile.pendingBids,  color: '#d97706' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#f8fafc', borderRadius: 10,
                    padding: '12px 10px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 800, color: s.color }}>
                      {s.value}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>

              {/* Info */}
              <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '12px 14px', marginBottom: 20 }}>
                <p style={{ margin: '0 0 4px', fontSize: '0.83rem', color: '#334155' }}>
                  📧 <strong>Email:</strong> {profile.email}
                </p>
                <p style={{ margin: 0, fontSize: '0.83rem', color: '#334155' }}>
                  📅 <strong>Member since:</strong> {new Date(profile.joinedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>

              {/* Bid history */}
              <h4 style={{ margin: '0 0 12px', color: '#334155', fontSize: '0.9rem' }}>
                Bid History ({profile.bidHistory.length})
              </h4>
              {profile.bidHistory.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>
                  No bids placed yet.
                </p>
              ) : (
                profile.bidHistory.map(b => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', padding: '10px 12px', marginBottom: 8,
                    background: '#f8fafc', borderRadius: 8, gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
                        {b.species} · {b.quantity}kg
                      </p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                        Rs. {Number(b.bidPricePerKg).toLocaleString()}/kg ·{' '}
                        {new Date(b.bidTime).toLocaleDateString()}
                      </p>
                    </div>
                    <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: '0.75rem',
                      fontWeight: 700, background: statusBg(b.status), color: statusColor(b.status),
                      flexShrink: 0 }}>
                      {b.status}
                    </span>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onClose} className="btn-outline" style={{ width: '100%' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export const FishermanDashboard = () => {
  const [showForm,    setShowForm]    = useState(false);
  const [editTarget,  setEditTarget]  = useState<CatchRecord | null>(null);
  const [catches,     setCatches]     = useState<CatchRecord[]>([]);
  const [actionError, setActionError] = useState<string>('');

  let currentFishermanId = 0;
  try {
    const token = localStorage.getItem('token') ?? '';
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      currentFishermanId = Number(
        payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] ??
        payload['nameid'] ??
        payload['sub'] ??
        0
      );
    }
  } catch {}

  const [filter,      setFilter]      = useState<'all' | 'active' | 'bidding' | 'sold'>('all');
  const [allBidsMap,  setAllBidsMap]  = useState<Record<number, BidRecord[]>>({});

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const fetchCatches = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/Catches?pageSize=100`, getAuthHeader());
      // API now returns PagedResult<Catch> — extract items
      const data = res.data;
      const items: CatchRecord[] = Array.isArray(data) ? data : (data.items ?? []);
      setCatches(items);

      // Fetch bids for bidding catches to populate live bids count
      const biddingItems = items.filter(c => c.status === 'Bidding');
      if (biddingItems.length > 0) {
        const bidsObj: Record<number, BidRecord[]> = {};
        await Promise.all(
          biddingItems.map(async (c) => {
            try {
              const bRes = await axios.get<BidRecord[]>(`${API_BASE_URL}/api/Bids/catch/${c.id}`, getAuthHeader());
              bidsObj[c.id] = bRes.data;
            } catch {}
          })
        );
        setAllBidsMap(bidsObj);
      }
    } catch (err) {
      console.error('Failed to fetch catches', err);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchCatches(); }, []);

  const handleEdit = (c: CatchRecord) => {
    if (!EDITABLE.includes(c.status)) {
      setActionError(`Cannot edit a "${c.status}" listing. Only Draft or Published listings can be edited.`);
      return;
    }
    setActionError('');
    setEditTarget(c);
    setShowForm(true);
  };

  const handlePublish = async (c: CatchRecord) => {
    if (!window.confirm(`Publish "${c.fishSpecies} (${c.quantityKg}kg)" listing? The AI Quality Agent will validate it.`)) return;
    try {
      await axios.patch(`${API_BASE_URL}/api/Catches/${c.id}/publish`, {}, getAuthHeader());
      await fetchCatches();
      setActionError('');

      // 🤖 Trigger AI Quality Validation Agent via ASP.NET Core proxy (mandatory backend rule)
      const workflowId = `workflow-${c.id}-${Date.now()}`;
      let fishermanId = 0;
      try {
        const token = localStorage.getItem('token') ?? '';
        const payload = JSON.parse(atob(token.split('.')[1]));
        fishermanId = Number(payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] ?? 0);
      } catch { fishermanId = 0; }

      try {
        // Route through ASP.NET Core — NOT directly to port 8000
        await axios.post(`${API_BASE_URL}/api/AgentGateway/workflow/start`, {
          workflowId,
          catchId:               c.id,
          fishermanId,
          quantityKg:            Number(c.quantityKg),
          askingPrice:           Number(c.askingPricePerKg),
          fishSpecies:           c.fishSpecies,
          verifiedWeightKg:      Number(c.verifiedWeightKg ?? 0),
          declaredQualityGrade:  c.declaredQualityGrade ?? '',
          inspectionResult:      c.inspectionResult ?? 'Pending',
          catchDatetime:         c.catchDateTime ?? null,
          sellerNote:            c.sellerNote ?? '',
        }, getAuthHeader());
        setActionError('');
        setTimeout(() => fetchCatches(), 6000);
      } catch {
        console.warn('AI agent offline — validation skipped');
      }
    } catch (err: any) {
      setActionError(formatErrorMessage(err, 'Error publishing listing.'));
    }
  };

  const handleCancel = async (c: CatchRecord) => {
    if (!CANCELLABLE.includes(c.status)) {
      setActionError(`Cannot cancel a "${c.status}" listing.`);
      return;
    }
    if (!window.confirm(`Cancel the listing for "${c.fishSpecies} (${c.quantityKg}kg)"? This cannot be undone.`)) return;
    try {
      await axios.patch(`${API_BASE_URL}/api/Catches/${c.id}/cancel`, {}, getAuthHeader());
      await fetchCatches();
      setActionError('');
    } catch (err: any) {
      setActionError(formatErrorMessage(err, 'Error cancelling listing.'));
    }
  };

  const handleDelete = async (c: CatchRecord) => {
    if (!DELETABLE.includes(c.status)) {
      setActionError(`Cannot delete a "${c.status}" listing. Use Cancel instead.`);
      return;
    }
    if (!window.confirm(`Permanently delete the Draft listing for "${c.fishSpecies}"?`)) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/Catches/${c.id}`, getAuthHeader());
      await fetchCatches();
      setActionError('');
    } catch (err: any) {
      setActionError(formatErrorMessage(err, 'Error deleting listing.'));
    }
  };

  const handleFormSaved = async () => {
    await fetchCatches();
    setShowForm(false);
    setEditTarget(null);
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditTarget(null);
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalRevenue   = catches.filter(c => c.status === 'Sold')
    .reduce((acc, c) => {
      const acceptedBid = allBidsMap[c.id]?.find(b => b.status === 'Accepted');
      const rate = acceptedBid ? Number(acceptedBid.bidPricePerKg) : Number(c.askingPricePerKg);
      return acc + Number(c.quantityKg) * rate;
    }, 0);
  const activeCatches  = catches.filter(c => ['Published', 'Bidding'].includes(c.status));
  const activeCount    = activeCatches.length;
  const biddingCatches = catches.filter(c => c.status === 'Bidding');
  const biddingCount   = biddingCatches.length;
  const soldCatches    = catches.filter(c => c.status === 'Sold');
  const soldCount      = soldCatches.length;
  const totalLiveBidsCount = Object.values(allBidsMap).reduce((acc, list) => acc + list.length, 0);

  const displayedCatches = catches.filter(c => {
    if (filter === 'active')  return ['Published', 'Bidding'].includes(c.status);
    if (filter === 'bidding') return c.status === 'Bidding';
    if (filter === 'sold')    return c.status === 'Sold';
    return true;
  });

  // ── Form view ──────────────────────────────────────────────────────────────
  if (showForm) {
    return (
      <div className="dashboard-content">
        <h2>{editTarget ? 'Edit Catch' : 'Register New Catch'}</h2>
        <button type="button" className="btn-outline" onClick={handleFormCancel} style={{ marginBottom: '20px' }}>
          ← Back to Dashboard
        </button>
        <CatchForm
          key={editTarget ? `edit-${editTarget.id}` : 'new'}
          editId={editTarget?.id ?? null}
          initialSpecies={editTarget?.fishSpecies ?? 'Tuna (Yellowfin)'}
          initialQuantity={editTarget?.quantityKg?.toString() ?? ''}
          initialPrice={editTarget?.askingPricePerKg?.toString() ?? ''}
          initialLocation={editTarget?.location ?? null}
          initialVerifiedWeight={editTarget?.verifiedWeightKg?.toString() ?? ''}
          initialQualityGrade={editTarget?.declaredQualityGrade ?? ''}
          initialInspectionResult={editTarget?.inspectionResult ?? 'Pending'}
          initialCatchDateTime={editTarget?.catchDateTime?.slice(0, 16) ?? ''}
          initialSellerNote={editTarget?.sellerNote ?? ''}
          onCancel={handleFormCancel}
          onSaved={handleFormSaved}
        />
      </div>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-content">
      <h2>My Catch Listings</h2>

      {/* Interactive 4 Stats Cards */}
      <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {/* Card 1: Total Listings */}
        <div
          className="stat-card"
          onClick={() => setFilter('all')}
          style={{
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            border: filter === 'all' ? '2px solid #005b96' : '1px solid #e2e8f0',
            background: filter === 'all' ? '#f0f9ff' : '#ffffff',
            boxShadow: filter === 'all' ? '0 6px 16px rgba(0,91,150,0.18)' : '0 2px 6px rgba(0,0,0,0.05)',
            transform: filter === 'all' ? 'translateY(-2px)' : 'none',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>TOTAL LISTINGS</h3>
            {filter === 'all' && (
              <span style={{ fontSize: '0.7rem', background: '#005b96', color: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                ALL
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '1.9rem', fontWeight: 800, color: '#03396c' }}>{catches.length}</p>
          <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#0284c7', fontWeight: 600 }}>
            👁 Click to view all ({catches.length})
          </div>
        </div>

        {/* Card 2: Active (Published + Bidding) */}
        <div
          className="stat-card"
          onClick={() => setFilter(f => f === 'active' ? 'all' : 'active')}
          style={{
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            border: filter === 'active' ? '2px solid #10b981' : '1px solid #e2e8f0',
            background: filter === 'active' ? '#ecfdf5' : '#ffffff',
            boxShadow: filter === 'active' ? '0 6px 16px rgba(16,185,129,0.18)' : '0 2px 6px rgba(0,0,0,0.05)',
            transform: filter === 'active' ? 'translateY(-2px)' : 'none',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>ACTIVE (PUBLISHED + BIDDING)</h3>
            {filter === 'active' && (
              <span style={{ fontSize: '0.7rem', background: '#10b981', color: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                FILTERED
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '1.9rem', fontWeight: 800, color: '#059669' }}>{activeCount}</p>
          <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>
            🟢 Click to filter active ({activeCount} live)
          </div>
        </div>

        {/* Card 3: Bidding Now */}
        <div
          className="stat-card"
          onClick={() => setFilter(f => f === 'bidding' ? 'all' : 'bidding')}
          style={{
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            border: filter === 'bidding' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
            background: filter === 'bidding' ? '#eff6ff' : '#ffffff',
            boxShadow: filter === 'bidding' ? '0 6px 16px rgba(59,130,246,0.18)' : '0 2px 6px rgba(0,0,0,0.05)',
            transform: filter === 'bidding' ? 'translateY(-2px)' : 'none',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>BIDDING NOW</h3>
            {filter === 'bidding' && (
              <span style={{ fontSize: '0.7rem', background: '#3b82f6', color: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                FILTERED
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <p style={{ margin: 0, fontSize: '1.9rem', fontWeight: 800, color: '#2563eb' }}>{biddingCount}</p>
            {totalLiveBidsCount > 0 && (
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '2px 8px', borderRadius: '12px' }}>
                ⚡ {totalLiveBidsCount} bids
              </span>
            )}
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#2563eb', fontWeight: 600 }}>
            ⚡ Click to view ({biddingCount} catches, {totalLiveBidsCount} live bids)
          </div>
        </div>

        {/* Card 4: Total Revenue (Sold) */}
        <div
          className="stat-card"
          onClick={() => setFilter(f => f === 'sold' ? 'all' : 'sold')}
          style={{
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            border: filter === 'sold' ? '2px solid #8b5cf6' : '1px solid #e2e8f0',
            background: filter === 'sold' ? '#faf5ff' : '#ffffff',
            boxShadow: filter === 'sold' ? '0 6px 16px rgba(139,92,246,0.18)' : '0 2px 6px rgba(0,0,0,0.05)',
            transform: filter === 'sold' ? 'translateY(-2px)' : 'none',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>TOTAL REVENUE (SOLD)</h3>
            {filter === 'sold' && (
              <span style={{ fontSize: '0.7rem', background: '#8b5cf6', color: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                FILTERED
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#6d28d9' }}>Rs. {totalRevenue.toLocaleString()}</p>
          <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#7c3aed', fontWeight: 600 }}>
            💰 Click to view sales ({soldCount} sold catches)
          </div>
        </div>
      </div>

      {/* Interactive Filter & Detail Breakdown Banner */}
      <div style={{
        marginTop: '20px',
        background: filter === 'bidding' ? '#eff6ff' : filter === 'sold' ? '#faf5ff' : filter === 'active' ? '#ecfdf5' : '#f8fafc',
        border: `1px solid ${filter === 'bidding' ? '#bfdbfe' : filter === 'sold' ? '#e9d5ff' : filter === 'active' ? '#a7f3d0' : '#e2e8f0'}`,
        borderRadius: '10px',
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>
              {filter === 'all' && '📋'}
              {filter === 'active' && '🟢'}
              {filter === 'bidding' && '⚡'}
              {filter === 'sold' && '💰'}
            </span>
            <h4 style={{ margin: 0, fontSize: '0.98rem', color: '#1e293b' }}>
              {filter === 'all' && `Showing All Listings (${displayedCatches.length})`}
              {filter === 'active' && `Filtered: Active Marketplace Listings (${displayedCatches.length} items)`}
              {filter === 'bidding' && `Filtered: Bidding Now (${displayedCatches.length} catches · ${totalLiveBidsCount} live buyer bids)`}
              {filter === 'sold' && `Filtered: Completed Sales (${displayedCatches.length} catches · Total Earned: Rs. ${totalRevenue.toLocaleString()})`}
            </h4>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            {filter === 'all' && 'Click any card above to filter by Active, Bidding Now, or Sold catches.'}
            {filter === 'active' && 'These catches are currently published or in auction and accessible to registered buyers.'}
            {filter === 'bidding' && 'Buyers are actively placing bids on these catches. Expand each card to see buyer details & bid prices.'}
            {filter === 'sold' && `Successfully delivered catches totaling Rs. ${totalRevenue.toLocaleString()} across ${soldCatches.reduce((a,c) => a + Number(c.quantityKg), 0)}kg of fish.`}
          </p>
        </div>

        {filter !== 'all' && (
          <button
            type="button"
            onClick={() => setFilter('all')}
            style={{
              background: 'white',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            ✕ Clear Filter (Show All)
          </button>
        )}
      </div>

      {/* Register button */}
      <button className="btn-primary"
        onClick={() => { setEditTarget(null); setShowForm(true); setActionError(''); }}
        style={{ marginTop: '20px', padding: '12px 24px', fontSize: '0.95rem' }}>
        + Register New Catch
      </button>

      {/* Action error */}
      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fee2e2',
          border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px', marginTop: '16px' }}>
          <AlertCircle color="#ef4444" size={18} />
          <p style={{ margin: 0, color: '#991b1b', fontSize: '0.9rem' }}>
            {typeof actionError === 'string' ? actionError : formatErrorMessage(actionError)}
          </p>
          <button onClick={() => setActionError('')}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>
            <X size={16} />
          </button>
        </div>
      )}

      <h3 style={{ marginTop: '30px', color: '#334155' }}>
        {filter === 'all' && 'My Recent Catches'}
        {filter === 'active' && `Active Marketplace Catches (${displayedCatches.length})`}
        {filter === 'bidding' && `Catches in Live Auction (${displayedCatches.length})`}
        {filter === 'sold' && `Completed & Sold Catches (${displayedCatches.length})`}
      </h3>

      {displayedCatches.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
          <p style={{ color: '#64748b', margin: 0 }}>No catches found for the selected filter.</p>
          <button onClick={() => setFilter('all')} className="btn-outline" style={{ marginTop: '12px' }}>
            Show All Catches
          </button>
        </div>
      ) : (
        displayedCatches.map((c) => {
          const cfg       = getStatusCfg(c.status);
          const isOwner   = !c.fishermanId || currentFishermanId === 0 || c.fishermanId === currentFishermanId;
          const canEdit   = isOwner && EDITABLE.includes(c.status);
          const canPublish = isOwner && PUBLISHABLE.includes(c.status);
          const canCancel = isOwner && CANCELLABLE.includes(c.status);
          const canDelete = isOwner && DELETABLE.includes(c.status);
          const isLocked  = !canEdit;

          return (
            <div key={c.id} className="workflow-card"
              style={{ borderLeftColor: cfg.border, opacity: c.status === 'Cancelled' || c.status === 'Expired' ? 0.7 : 1 }}>

              {/* Card Header */}
              <div className="card-header">
                <h3 style={{ margin: 0 }}>{c.fishSpecies} ({c.quantityKg}kg)</h3>
                <StatusBadge status={c.status} />
              </div>

              {/* Photo */}
              {c.photoUrl && (
                <div style={{ marginBottom: '12px', background: '#f8fafc', borderRadius: '8px', overflow: 'hidden' }}>
                  <img src={c.photoUrl} alt="Catch"
                    style={{ width: '100%', maxHeight: '280px', objectFit: 'contain',
                      objectPosition: 'left center', display: 'block', borderRadius: '8px' }} />
                </div>
              )}

              {/* Body */}
              <div className="card-body">
                <p><strong>Asking Price:</strong> Rs. {c.askingPricePerKg}/kg</p>
                <p><strong>Location:</strong> {c.location}</p>

                {/* Quality & fraud validation results */}
                {c.fraudRisk && c.fraudRisk !== 'Unassessed' && (
                  <div style={{
                    marginTop: '10px', padding: '10px 14px', borderRadius: '8px',
                    background: c.fraudRisk === 'High' ? '#fee2e2'
                               : c.fraudRisk === 'Medium' ? '#fef3c7' : '#d1fae5',
                    border: `1px solid ${c.fraudRisk === 'High' ? '#fca5a5'
                               : c.fraudRisk === 'Medium' ? '#fde68a' : '#6ee7b7'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.82rem',
                        color: c.fraudRisk === 'High' ? '#991b1b'
                               : c.fraudRisk === 'Medium' ? '#92400e' : '#065f46' }}>
                        {c.fraudRisk === 'High' ? '🚨' : c.fraudRisk === 'Medium' ? '⚠️' : '✅'}
                        {' '}Fraud Risk: {c.fraudRisk}
                        {c.requiresAdminReview && ' — Admin Review Required'}
                      </span>
                      {c.qualityScore !== undefined && c.qualityScore > 0 && (
                        <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                          Quality Score: <strong>{c.qualityScore}/100</strong>
                        </span>
                      )}
                    </div>
                    {c.weightDiscrepancyPct !== undefined && c.weightDiscrepancyPct > 0 && (
                      <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                        Weight discrepancy: {c.weightDiscrepancyPct}%
                        {c.verifiedWeightKg ? ` (Verified: ${c.verifiedWeightKg}kg)` : ''}
                      </p>
                    )}
                  </div>
                )}

                {/* Live Bids Breakdown / Accepted Bid History */}
                {(c.status === 'Bidding' || c.status === 'Sold') && (
                  <CatchBidsSection
                    catchId={c.id}
                    askingPrice={Number(c.askingPricePerKg)}
                    quantityKg={Number(c.quantityKg)}
                    catchStatus={c.status}
                    onActionCompleted={fetchCatches}
                  />
                )}

                {/* Sold Revenue Breakdown — only show for Sold status */}
                {c.status === 'Sold' && (() => {
                  const accepted = allBidsMap[c.id]?.find(b => b.status === 'Accepted');
                  const soldPrice = accepted ? Number(accepted.bidPricePerKg) : Number(c.askingPricePerKg);
                  return (
                    <div style={{
                      marginTop: '12px', background: '#faf5ff', border: '1px solid #d8b4fe',
                      borderRadius: '10px', padding: '12px 14px', display: 'flex',
                      justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'
                    }}>
                      <div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b21a8', textTransform: 'uppercase' }}>
                          🎉 Completed Deal · Verified Sale
                        </span>
                        <p style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 800, color: '#581c87' }}>
                          Total Revenue Earned: Rs. {(Number(c.quantityKg) * soldPrice).toLocaleString()}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#7e22ce' }}>
                          Sold: <strong>{c.quantityKg} kg</strong> @ <strong>Rs. {soldPrice.toLocaleString()}/kg</strong>
                        </p>
                      </div>
                      <span style={{
                        padding: '4px 12px', borderRadius: '16px', fontSize: '0.78rem', fontWeight: 700,
                        background: '#ede9fe', color: '#6b21a8', border: '1px solid #c084fc'
                      }}>
                        ✓ Payment Processed & Delivered
                      </span>
                    </div>
                  );
                })()}

                {/* Locked notice */}
                {isLocked && c.status !== 'Cancelled' && c.status !== 'Expired' && (
                  <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '0.82rem',
                    display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={14} /> This listing is locked for editing ({c.status}).
                  </p>
                )}
              </div>


              {/* Actions */}
              <div className="card-actions" style={{
                borderTop: '1px solid #f1f5f9', paddingTop: '14px',
                marginTop: '14px', justifyContent: 'flex-start', gap: '10px', flexWrap: 'wrap',
              }}>
                {/* Publish — only for Draft */}
                {canPublish && (
                  <button className="btn-primary" onClick={() => handlePublish(c)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px 16px', fontSize: '0.85rem', marginTop: 0 }}>
                    <Send size={15} /> Publish Listing
                  </button>
                )}

                {/* Edit — only Draft/Published */}
                {canEdit && (
                  <button className="btn-outline" onClick={() => handleEdit(c)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px 14px', color: '#3b82f6', borderColor: '#3b82f6', fontSize: '0.85rem' }}>
                    <Edit size={15} /> Edit
                  </button>
                )}

                {/* Cancel — Draft/Published */}
                {canCancel && (
                  <button className="btn-outline" onClick={() => handleCancel(c)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px 14px', color: '#f97316', borderColor: '#f97316', fontSize: '0.85rem' }}>
                    <Ban size={15} /> Cancel Listing
                  </button>
                )}

                {/* Delete — Draft only (full remove) */}
                {canDelete && (
                  <button className="btn-outline" onClick={() => handleDelete(c)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px 14px', color: '#ef4444', borderColor: '#ef4444', fontSize: '0.85rem' }}>
                    <Trash2 size={15} /> Delete Draft
                  </button>
                )}
              </div>

              {/* 🤖 Buyer Matching Agent panel */}
              <BuyerMatchPanel c={c} />
            </div>
          );
        })
      )}
    </div>
  );
};
