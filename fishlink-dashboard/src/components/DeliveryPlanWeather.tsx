import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

export interface DeliveryPlanWeatherProps {
  pickupLocation: string;
  deliveryLocation: string;
  weatherNote?: string;
}

export const extractCity = (loc: string): string => {
  if (!loc) return 'Colombo';
  const lower = loc.toLowerCase();
  if (lower.includes('anuradhapura')) return 'Anuradhapura';
  if (lower.includes('jaffna')) return 'Jaffna';
  if (lower.includes('trincomalee')) return 'Trincomalee';
  if (lower.includes('batticaloa')) return 'Batticaloa';
  if (lower.includes('hambantota')) return 'Hambantota';
  if (lower.includes('tangalle')) return 'Tangalle';
  if (lower.includes('matara')) return 'Matara';
  if (lower.includes('galle')) return 'Galle';
  if (lower.includes('beruwala')) return 'Beruwala';
  if (lower.includes('kalutara')) return 'Kalutara';
  if (lower.includes('puttalam')) return 'Puttalam';
  if (lower.includes('kalpitiya')) return 'Kalpitiya';
  if (lower.includes('chilaw')) return 'Chilaw';
  if (lower.includes('mannar')) return 'Mannar';
  if (lower.includes('kurunegala')) return 'Kurunegala';
  if (lower.includes('dambulla')) return 'Dambulla';
  if (lower.includes('nuwara')) return 'Nuwara Eliya';
  if (lower.includes('badulla')) return 'Badulla';
  if (lower.includes('ratnapura')) return 'Ratnapura';
  if (lower.includes('negombo')) return 'Negombo';
  if (lower.includes('colombo') || lower.includes('peliyagoda')) return 'Colombo';
  if (lower.includes('kandy')) return 'Kandy';
  const first = loc.trim().split(/[\s,]+/)[0];
  return first || 'Colombo';
};

export const DeliveryPlanWeather: React.FC<DeliveryPlanWeatherProps> = ({
  pickupLocation,
  deliveryLocation,
  weatherNote
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fromCity = extractCity(pickupLocation);
  const toCity = extractCity(deliveryLocation);

  useEffect(() => {
    let isMounted = true;
    const authHeader = { Authorization: `Bearer ${localStorage.getItem('token')}` };

    axios
      .get(
        `${API_BASE_URL}/api/Weather/logistics?from=${encodeURIComponent(fromCity)}&to=${encodeURIComponent(toCity)}`,
        { headers: authHeader }
      )
      .then(res => {
        if (isMounted) setData(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [fromCity, toCity]);

  const riskColor = (r?: string) =>
    r === 'High' ? '#ef4444' : r === 'Moderate' ? '#f59e0b' : '#10b981';

  return (
    <div
      style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '12px 14px',
        marginBottom: 12
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 8
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '1rem' }}>🌤️</span>
          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
            Route Weather: {fromCity} ➔ {toCity}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
            ({data?.source || 'Live Weather Telemetry'})
          </span>
        </div>

        {data && (
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 10,
              background: riskColor(data.overallDrivingRisk) + '18',
              color: riskColor(data.overallDrivingRisk)
            }}
          >
            Transit Risk: {data.overallDrivingRisk || 'Low'}
          </span>
        )}
      </div>

      {data ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 8,
              marginBottom: 8
            }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: 8,
                padding: '8px 12px',
                border: '1px solid #e2e8f0'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Origin ({fromCity})
                </span>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0369a1' }}>
                  {data.fromWeather?.tempCelsius}°C
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                {data.fromWeather?.condition} · Wind: {data.fromWeather?.windSpeedKmh} km/h
              </p>
            </div>

            <div
              style={{
                background: '#ffffff',
                borderRadius: 8,
                padding: '8px 12px',
                border: '1px solid #e2e8f0'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Destination ({toCity})
                </span>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0369a1' }}>
                  {data.toWeather?.tempCelsius}°C
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                {data.toWeather?.condition} · Wind: {data.toWeather?.windSpeedKmh} km/h
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.76rem',
              color: '#475569',
              background: '#ffffff',
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #f1f5f9'
            }}
          >
            <span>🛣️</span>
            <span>{data.advice}</span>
            {data.recommendedBufferMinutes > 0 && (
              <span style={{ color: '#d97706', fontWeight: 700 }}>
                (+{data.recommendedBufferMinutes} min buffer)
              </span>
            )}
          </div>
        </>
      ) : (
        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
          {loading ? 'Fetching route live weather telemetry...' : (weatherNote || 'Standard coastal weather conditions reported.')}
        </div>
      )}

      {weatherNote && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px dashed #e2e8f0',
            fontSize: '0.75rem',
            color: '#0369a1',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6
          }}
        >
          <span>🧊</span>
          <span><strong>AI Cold-Chain Advisory:</strong> {weatherNote}</span>
        </div>
      )}
    </div>
  );
};
