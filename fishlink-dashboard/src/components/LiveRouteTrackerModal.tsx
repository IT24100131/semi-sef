import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Navigation,
  Truck,
  MapPin,
  Clock,
  Thermometer,
  ShieldCheck,
  CheckCircle,
  ExternalLink,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Calendar
} from 'lucide-react';

interface LiveRouteTrackerModalProps {
  plan: {
    id: number;
    planId: string;
    catchId?: number;
    vehicleCode: string;
    driverCode: string;
    coldStorageCode?: string;
    pickupLocation: string;
    deliveryLocation: string;
    selectedRoute: string;
    distanceKm: number;
    estimatedMinutes: number;
    pickupTime?: string | null;
    estimatedETA?: string | null;
    status: string;
  };
  onClose: () => void;
  onDelivered?: (planId: number) => void;
}

// Sri Lanka Port & City Coordinates for Map Plotting
const SRI_LANKA_COORDS: Record<string, { lat: number; lng: number; x: number; y: number; name: string }> = {
  Negombo: { lat: 7.2083, lng: 79.8358, x: 120, y: 160, name: 'Negombo Pier' },
  Colombo: { lat: 6.9271, lng: 79.8612, x: 150, y: 250, name: 'Colombo Central' },
  Peliyagoda: { lat: 6.9553, lng: 79.8988, x: 170, y: 230, name: 'Peliyagoda Fish Market' },
  Beruwala: { lat: 6.4789, lng: 79.9828, x: 190, y: 330, name: 'Beruwala Harbour' },
  Galle: { lat: 6.0535, lng: 80.221, x: 230, y: 400, name: 'Galle Fishery Port' },
  Matara: { lat: 5.9549, lng: 80.555, x: 300, y: 420, name: 'Matara Port' },
  Kandy: { lat: 7.2906, lng: 80.6337, x: 340, y: 180, name: 'Kandy Central Market' },
  Jaffna: { lat: 9.6615, lng: 80.0255, x: 170, y: 40, name: 'Jaffna Fisheries Harbour' },
  Trincomalee: { lat: 8.5874, lng: 81.2152, x: 410, y: 110, name: 'Trincomalee Harbour' }
};

function normalizeCity(name: string): string {
  if (!name) return 'Colombo';
  const l = name.toLowerCase();
  if (l.includes('negombo')) return 'Negombo';
  if (l.includes('peliyagoda')) return 'Peliyagoda';
  if (l.includes('colombo')) return 'Colombo';
  if (l.includes('beruwala')) return 'Beruwala';
  if (l.includes('galle')) return 'Galle';
  if (l.includes('matara')) return 'Matara';
  if (l.includes('kandy')) return 'Kandy';
  if (l.includes('jaffna')) return 'Jaffna';
  if (l.includes('trincomalee')) return 'Trincomalee';
  return 'Colombo';
}

export const LiveRouteTrackerModal: React.FC<LiveRouteTrackerModalProps> = ({
  plan,
  onClose,
  onDelivered
}) => {
  // Time parsing
  const { departureDate, arrivalDate, totalTripMinutes } = useMemo(() => {
    const now = new Date();
    const dep = plan.pickupTime ? new Date(plan.pickupTime) : new Date(now.getTime() - 12 * 60000);
    const arr = plan.estimatedETA
      ? new Date(plan.estimatedETA)
      : new Date(dep.getTime() + (plan.estimatedMinutes || 60) * 60000);

    const diffMin = Math.max(10, Math.round((arr.getTime() - dep.getTime()) / 60000));
    return {
      departureDate: dep,
      arrivalDate: arr,
      totalTripMinutes: diffMin
    };
  }, [plan.pickupTime, plan.estimatedETA, plan.estimatedMinutes]);

  // Compute Initial Progress based on real wall-clock time
  const initialRealProgress = useMemo(() => {
    const now = Date.now();
    const start = departureDate.getTime();
    const end = arrivalDate.getTime();
    if (now <= start) return 5; // just departing
    if (now >= end) return 100; // arrived
    const pct = ((now - start) / (end - start)) * 100;
    return Math.max(5, Math.min(99, Math.round(pct)));
  }, [departureDate, arrivalDate]);

  // States
  const [progress, setProgress] = useState<number>(initialRealProgress);
  const [trackingMode, setTrackingMode] = useState<'realtime' | 'demo'>('realtime');
  const [simSpeed, setSimSpeed] = useState<number>(1); // 1x, 5x, 20x
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [temperature, setTemperature] = useState<number>(-18.4);
  const [speed, setSpeed] = useState<number>(56);

  const originKey = normalizeCity(plan.pickupLocation);
  const destKey = normalizeCity(plan.deliveryLocation);

  const startCoord = SRI_LANKA_COORDS[originKey] || { lat: 7.2083, lng: 79.8358, x: 120, y: 160, name: plan.pickupLocation };
  const endCoord = SRI_LANKA_COORDS[destKey] || { lat: 6.9271, lng: 79.8988, x: 260, y: 280, name: plan.deliveryLocation };

  // Calculate current interpolated coordinates
  const currentX = startCoord.x + (endCoord.x - startCoord.x) * (progress / 100);
  const currentY = startCoord.y + (endCoord.y - startCoord.y) * (progress / 100);
  const currentLat = (startCoord.lat + (endCoord.lat - startCoord.lat) * (progress / 100)).toFixed(4);
  const currentLng = (startCoord.lng + (endCoord.lng - startCoord.lng) * (progress / 100)).toFixed(4);

  const remainingKm = Math.max(0, plan.distanceKm * (1 - progress / 100)).toFixed(1);
  const remainingMins = Math.max(0, Math.round(totalTripMinutes * (1 - progress / 100)));
  const elapsedMins = Math.max(0, Math.round(totalTripMinutes * (progress / 100)));

  // Progress ticker:
  // - In 'realtime' mode: advances accurately according to the real clock (e.g. 1% every totalTripMinutes * 600 ms)
  // - In 'demo' mode: advances smoothly based on selected simulation speed (1x, 5x, 20x)
  useEffect(() => {
    if (!isPlaying || progress >= 100) return;

    // In real-time mode: calculate interval so entire trip takes full estimatedMinutes
    // 100 steps across totalTripMinutes: interval = (totalTripMinutes * 60 * 1000) / 100 / simSpeed
    const stepDurationMs =
      trackingMode === 'realtime'
        ? Math.max(1000, (totalTripMinutes * 60 * 1000) / 100 / simSpeed)
        : Math.max(400, 3000 / simSpeed);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          setIsPlaying(false);
          return 100;
        }
        return Math.min(100, parseFloat((prev + 0.5).toFixed(1)));
      });

      // Realistic sensor fluctuations
      setSpeed(Math.round(50 + Math.random() * 12));
      setTemperature(parseFloat((-18.4 + (Math.random() * 0.4 - 0.2)).toFixed(1)));
    }, stepDurationMs);

    return () => clearInterval(interval);
  }, [isPlaying, progress, trackingMode, simSpeed, totalTripMinutes]);

  // Google Maps Direct Navigation URL
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    plan.pickupLocation + ', Sri Lanka'
  )}&destination=${encodeURIComponent(plan.deliveryLocation + ', Sri Lanka')}&travelmode=driving`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(6px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 16,
          width: '100%',
          maxWidth: 920,
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          border: '1px solid #cbd5e1'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#0f172a',
            color: '#ffffff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)'
              }}
            >
              <Truck size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  Live Cold-Chain GPS Tracking · {plan.planId}
                </h3>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    background: progress >= 100 ? '#10b981' : '#0284c7',
                    color: '#ffffff'
                  }}
                >
                  {progress >= 100 ? '🏁 Arrived at Destination' : '🟢 Live In-Transit'}
                </span>
              </div>
              <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                Vehicle: {plan.vehicleCode} · Driver: {plan.driverCode} · Route: {plan.selectedRoute}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Live Telemetry KPI Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 1,
            background: '#e2e8f0',
            borderBottom: '1px solid #e2e8f0'
          }}
        >
          <div style={{ background: '#ffffff', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
              <Navigation size={13} color="#0284c7" /> Live GPS Coordinates
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              {currentLat}°N, {currentLng}°E
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
              <Clock size={13} color="#f59e0b" /> Speed & Distance Left
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              {speed} km/h · {remainingKm} km left
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
              <Thermometer size={13} color="#06b6d4" /> Cold-Chain Reefer Temp
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0284c7', marginTop: 4 }}>
              {temperature}°C · Grade A Active
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
              <ShieldCheck size={13} color="#10b981" /> Departure & Arrival ETA
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981', marginTop: 4 }}>
              🛫 {departureDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ➔ 🏁{' '}
              {arrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {/* Time Progress & Speed Mode Controls */}
        <div
          style={{
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Calendar size={14} color="#0284c7" /> Real Journey Clock:
            </span>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              {elapsedMins} mins elapsed · <strong>{remainingMins} mins remaining</strong> ({progress}%)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>Tracking Speed:</span>
            {[
              { label: '🕒 Real-Time (1x)', mode: 'realtime', speed: 1 },
              { label: '⏩ 5x Demo', mode: 'demo', speed: 5 },
              { label: '🚀 20x Demo', mode: 'demo', speed: 20 }
            ].map(m => (
              <button
                key={m.label}
                type="button"
                onClick={() => {
                  setTrackingMode(m.mode as any);
                  setSimSpeed(m.speed);
                  setIsPlaying(true);
                }}
                style={{
                  border: '1px solid',
                  borderColor: simSpeed === m.speed && trackingMode === m.mode ? '#0284c7' : '#cbd5e1',
                  background: simSpeed === m.speed && trackingMode === m.mode ? '#e0f2fe' : '#ffffff',
                  color: simSpeed === m.speed && trackingMode === m.mode ? '#0369a1' : '#475569',
                  borderRadius: 14,
                  padding: '3px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Map Visual */}
        <div
          style={{
            position: 'relative',
            background: 'linear-gradient(135deg, #091e3a 0%, #0d2847 100%)',
            height: 350,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {/* Subtle Grid Map Canvas Pattern */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '36px 36px'
            }}
          />

          {/* SVG Map Route Canvas */}
          <svg
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
            viewBox="0 0 500 460"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Background Map Contours of Sri Lanka (Coastline simulation) */}
            <path
              d="M 120 40 Q 220 30 260 90 T 420 120 T 360 260 T 310 420 T 210 400 T 170 320 T 140 240 T 120 150 Z"
              fill="rgba(255,255,255,0.02)"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1.5"
              strokeDasharray="4,4"
            />

            {/* Base Highway Path */}
            <line
              x1={startCoord.x}
              y1={startCoord.y}
              x2={endCoord.x}
              y2={endCoord.y}
              stroke="#334155"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Active Traveled Expressway Segment */}
            <line
              x1={startCoord.x}
              y1={startCoord.y}
              x2={currentX}
              y2={currentY}
              stroke="#0284c7"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Dotted Centerline Waypoints */}
            <line
              x1={startCoord.x}
              y1={startCoord.y}
              x2={endCoord.x}
              y2={endCoord.y}
              stroke="#38bdf8"
              strokeWidth="2"
              strokeDasharray="6,6"
            />

            {/* Origin Pin */}
            <circle cx={startCoord.x} cy={startCoord.y} r="10" fill="#10b981" />
            <circle cx={startCoord.x} cy={startCoord.y} r="18" fill="#10b981" opacity="0.3" />
            <text
              x={startCoord.x - 30}
              y={startCoord.y - 14}
              fill="#a7f3d0"
              fontSize="12"
              fontWeight="700"
              filter="drop-shadow(0px 1px 3px rgba(0,0,0,0.8))"
            >
              ⚓ {originKey}
            </text>

            {/* Destination Pin */}
            <circle cx={endCoord.x} cy={endCoord.y} r="10" fill="#ef4444" />
            <circle cx={endCoord.x} cy={endCoord.y} r="18" fill="#ef4444" opacity="0.3" />
            <text
              x={endCoord.x - 20}
              y={endCoord.y + 24}
              fill="#fca5a5"
              fontSize="12"
              fontWeight="700"
              filter="drop-shadow(0px 1px 3px rgba(0,0,0,0.8))"
            >
              🏪 {destKey}
            </text>

            {/* Moving Vehicle Radar Waves */}
            <circle cx={currentX} cy={currentY} r="22" fill="#0284c7" opacity="0.25" />
            <circle cx={currentX} cy={currentY} r="12" fill="#38bdf8" />
          </svg>

          {/* Floating Vehicle Badge on Map */}
          <div
            style={{
              position: 'absolute',
              left: `${(currentX / 500) * 100}%`,
              top: `${(currentY / 460) * 100}%`,
              transform: 'translate(-50%, -135%)',
              background: '#0284c7',
              color: '#ffffff',
              padding: '5px 12px',
              borderRadius: 16,
              fontSize: '0.78rem',
              fontWeight: 700,
              boxShadow: '0 6px 16px rgba(2, 132, 199, 0.6)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              transition: 'all 0.3s ease',
              border: '2px solid #ffffff'
            }}
          >
            🚚 {plan.vehicleCode} ({speed} km/h · {progress}%)
          </div>

          {/* Simulation Controls on bottom-left */}
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              left: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(8px)',
              padding: '6px 12px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.15)'
            }}
          >
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.74rem',
                fontWeight: 600
              }}
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              {isPlaying ? 'Pause' : 'Resume'}
            </button>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
            <button
              onClick={() => {
                setProgress(initialRealProgress);
                setIsPlaying(true);
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.74rem'
              }}
            >
              <RotateCcw size={12} /> Sync Clock
            </button>
          </div>

          {/* Big Open in Google Maps button on top-right */}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              background: '#ffffff',
              color: '#0f172a',
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              textDecoration: 'none',
              boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
              border: '1px solid #e2e8f0',
              transition: 'all 0.2s'
            }}
          >
            <ExternalLink size={14} color="#0284c7" /> Open Live in Google Maps
          </a>
        </div>

        {/* Milestone Steps Timeline & Interactive Scrubber Slider */}
        <div style={{ padding: '16px 22px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          {/* Interactive Progress Slider */}
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sliders size={13} color="#0284c7" /> Route Scrubber:
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={e => {
                setProgress(parseFloat(e.target.value));
              }}
              style={{
                flex: 1,
                cursor: 'pointer',
                accentColor: '#0284c7'
              }}
            />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0284c7', minWidth: 42 }}>
              {progress}%
            </span>
          </div>

          {/* Milestones */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                right: 14,
                height: 3,
                background: '#cbd5e1',
                zIndex: 0
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: '#0284c7',
                  width: `${progress}%`,
                  transition: 'width 0.3s ease'
                }}
              />
            </div>

            {[
              { label: `Departed ${originKey}`, desc: 'Cold box checked', threshold: 0 },
              { label: 'Expressway Transit', desc: 'Optimal speed', threshold: 30 },
              { label: 'Suburban Corridor', desc: 'Low traffic buffer', threshold: 70 },
              { label: `Arrived at ${destKey}`, desc: 'Handover & QC', threshold: 100 }
            ].map((step, idx) => {
              const reached = progress >= step.threshold;
              return (
                <div
                  key={idx}
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center'
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: reached ? '#0284c7' : '#ffffff',
                      border: `3px solid ${reached ? '#0284c7' : '#cbd5e1'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      marginBottom: 4,
                      transition: 'all 0.2s'
                    }}
                  >
                    {reached ? <CheckCircle size={15} /> : idx + 1}
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: reached ? '#0f172a' : '#64748b' }}>
                    {step.label}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{step.desc}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid #e2e8f0',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#64748b' }}>
            <MapPin size={16} color="#0284c7" />
            <span>
              <strong>Route:</strong> {plan.pickupLocation} ➔ {plan.deliveryLocation} ({plan.distanceKm} km)
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {onDelivered && (
              <button
                onClick={() => {
                  onDelivered(plan.id);
                  onClose();
                }}
                className="btn-approve"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '9px 18px',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <CheckCircle size={16} /> Complete Delivery
              </button>
            )}
            <button
              onClick={onClose}
              className="btn-outline"
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
