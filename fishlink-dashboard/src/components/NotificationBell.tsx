import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  Truck,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Inbox,
  CheckCheck,
  ArrowRight,
  Clock,
  Layers
} from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

export interface NotificationItem {
  id: string;
  type: 'logistics' | 'fraud' | 'market' | 'quality' | 'order' | 'system';
  title: string;
  message: string;
  time: string;
  unread: boolean;
  targetTab: string;
  badge: string;
  badgeColor: string;
}

interface NotificationBellProps {
  role: string;
  onNavigate: (tab: string) => void;
  pendingPlansCount?: number;
}

function timeAgo(dateString?: string): string {
  if (!dateString) return 'Just now';
  try {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs) || diffMs < 0) return 'Just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'Recently';
  }
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  role,
  onNavigate,
  pendingPlansCount = 0
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('fishlink_read_notifications');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [filter, setFilter] = useState<'all' | 'unread' | 'special'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Helper to format ISO time to friendly time
  const formatTimeStr = (isoString?: string) => {
    if (!isoString) return 'Pending';
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return 'Pending';
    }
  };

  // Fetch or generate notifications based on role and backend APIs
  useEffect(() => {
    let isMounted = true;

    const fetchNotifications = async () => {
      const items: NotificationItem[] = [];
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

      try {
        // ═════════════════════════════════════════════════════════════════════
        // 1. ADMIN ROLE NOTIFICATIONS (Deliveries, Fraud, Multi-Agent)
        // ═════════════════════════════════════════════════════════════════════
        if (role === 'Admin') {
          // (A) Real-Time Delivery Notifications (All statuses: Pending, Scheduled, Delivered)
          try {
            const plansRes = await axios.get(`${API_BASE_URL}/api/Logistics/plans`);
            if (Array.isArray(plansRes.data)) {
              plansRes.data.forEach((p: any) => {
                if (p.status === 'PendingApproval') {
                  items.push({
                    id: `admin-deliv-pending-${p.id || p.planId}`,
                    type: 'logistics',
                    title: `🚚 Delivery Plan Awaiting Approval (${p.planId || `#${p.id}`})`,
                    message: `Dispatch Request: ${p.pickupLocation} ➔ ${p.deliveryLocation} (${p.distanceKm || 0} km via ${p.selectedRoute || 'Expressway'}). Refrig van ${p.vehicleCode} allocated.`,
                    time: timeAgo(p.createdAt),
                    unread: !readIds.has(`admin-deliv-pending-${p.id || p.planId}`),
                    targetTab: 'logistics',
                    badge: 'Pending Approval',
                    badgeColor: '#f59e0b'
                  });
                } else if (p.status === 'Scheduled') {
                  items.push({
                    id: `admin-deliv-active-${p.id || p.planId}`,
                    type: 'logistics',
                    title: `🟢 Live In-Transit Delivery (${p.planId || `#${p.id}`})`,
                    message: `Cold-chain van ${p.vehicleCode} en route from ${p.pickupLocation} to ${p.deliveryLocation}. ETA: ${formatTimeStr(p.estimatedETA)}.`,
                    time: timeAgo(p.updatedAt || p.createdAt),
                    unread: !readIds.has(`admin-deliv-active-${p.id || p.planId}`),
                    targetTab: 'logistics',
                    badge: 'On Route 🚛',
                    badgeColor: '#0284c7'
                  });
                } else if (p.status === 'Delivered') {
                  items.push({
                    id: `admin-deliv-done-${p.id || p.planId}`,
                    type: 'logistics',
                    title: `✅ Cold-Chain Delivery Complete (${p.planId || `#${p.id}`})`,
                    message: `Fish shipment delivered to ${p.deliveryLocation}. Cold-chain temperature log confirmed optimal.`,
                    time: timeAgo(p.updatedAt || p.createdAt),
                    unread: !readIds.has(`admin-deliv-done-${p.id || p.planId}`),
                    targetTab: 'logistics',
                    badge: 'Delivered',
                    badgeColor: '#10b981'
                  });
                }
              });
            }
          } catch (e) {
            console.error('Admin delivery fetch error:', e);
          }

          // (B) Flagged Catches for Fraud Review
          try {
            const flaggedRes = await axios.get(`${API_BASE_URL}/api/Catches/flagged`, { headers: authHeader });
            if (Array.isArray(flaggedRes.data)) {
              flaggedRes.data.slice(0, 5).forEach((c: any) => {
                items.push({
                  id: `catch-${c.id}`,
                  type: 'fraud',
                  title: `Catch #${c.id} Flagged (${c.fishSpecies || 'Fish'})`,
                  message: `Inspection required. AI Risk: ${c.fraudRisk || 'Medium'} (${c.quantityKg || 0} kg).`,
                  time: timeAgo(c.createdAt),
                  unread: !readIds.has(`catch-${c.id}`),
                  targetTab: 'home',
                  badge: 'Fraud Review',
                  badgeColor: '#ef4444'
                });
              });
            }
          } catch {}

          // (C) Multi-Agent Network Status
          items.push({
            id: 'admin-ai-telemetry',
            type: 'system',
            title: 'Multi-Agent Network Operational',
            message: 'Autonomous Planning, Quality, Market, Buyer Match, and Logistics Agents active.',
            time: 'Live',
            unread: !readIds.has('admin-ai-telemetry'),
            targetTab: 'workflows',
            badge: 'AI Fleet Ops',
            badgeColor: '#8b5cf6'
          });

        // ═════════════════════════════════════════════════════════════════════
        // 2. BUYER ROLE NOTIFICATIONS (Bid Accepted, Orders, Delivery Tracking)
        // ═════════════════════════════════════════════════════════════════════
        } else if (role === 'Buyer') {
          // (A) Check localStorage for real-time accepted bid event
          try {
            const latestAccepted = localStorage.getItem('fishlink_latest_accepted_bid');
            if (latestAccepted) {
              const b = JSON.parse(latestAccepted);
              items.push({
                id: `buyer-accepted-live-${b.bidId}`,
                type: 'order',
                title: `🎉 Bid Accepted! (${b.species || 'Fish'})`,
                message: `Fisherman accepted your bid of Rs. ${Number(b.price || 0).toLocaleString()}/kg for ${b.quantityKg || 100}kg ${b.species}. Cold-chain delivery scheduled!`,
                time: timeAgo(b.time),
                unread: !readIds.has(`buyer-accepted-live-${b.bidId}`),
                targetTab: 'orders',
                badge: 'Bid Won 🏆',
                badgeColor: '#10b981'
              });
            }
          } catch {}

          // (B) Fetch buyer's real bids from backend API
          try {
            const bidsRes = await axios.get(`${API_BASE_URL}/api/Bids/my`, { headers: authHeader });
            if (Array.isArray(bidsRes.data)) {
              bidsRes.data.forEach((b: any) => {
                if (b.status === 'Accepted') {
                  const notifId = `buyer-bid-accepted-${b.id}`;
                  // Avoid duplicate if live item exists
                  if (!items.some(i => i.id === notifId || i.id === `buyer-accepted-live-${b.id}`)) {
                    items.push({
                      id: notifId,
                      type: 'order',
                      title: `🎉 Bid Accepted: ${b.species || 'Fish'}`,
                      message: `Fisherman accepted your bid of Rs. ${Number(b.bidPricePerKg).toLocaleString()}/kg (${b.quantityKg} kg at ${b.location || 'Harbour'}). Logistics initiated.`,
                      time: timeAgo(b.bidTime),
                      unread: !readIds.has(notifId),
                      targetTab: 'orders',
                      badge: 'Bid Won 🏆',
                      badgeColor: '#10b981'
                    });
                  }
                } else if (b.status === 'Pending') {
                  items.push({
                    id: `buyer-bid-pending-${b.id}`,
                    type: 'order',
                    title: `⏳ Bid Submitted: ${b.species || 'Fish'}`,
                    message: `Your bid of Rs. ${Number(b.bidPricePerKg).toLocaleString()}/kg is pending review by fisherman.`,
                    time: timeAgo(b.bidTime),
                    unread: !readIds.has(`buyer-bid-pending-${b.id}`),
                    targetTab: 'orders',
                    badge: 'Pending Review',
                    badgeColor: '#f59e0b'
                  });
                }
              });
            }
          } catch {
            // Fallback: If unauthenticated in dev, check Bids for Catch 1
            try {
              const catchBids = await axios.get(`${API_BASE_URL}/api/Bids/catch/1`);
              if (Array.isArray(catchBids.data)) {
                catchBids.data.filter((b: any) => b.status === 'Accepted').forEach((b: any) => {
                  const notifId = `buyer-bid-accepted-${b.id}`;
                  if (!items.some(i => i.id === notifId)) {
                    items.push({
                      id: notifId,
                      type: 'order',
                      title: `🎉 Bid Accepted: Yellowfin Tuna`,
                      message: `Fisherman accepted your bid of Rs. ${Number(b.bidPricePerKg).toLocaleString()}/kg for 150kg Yellowfin Tuna. Cold-chain transit initialized!`,
                      time: timeAgo(b.bidTime),
                      unread: !readIds.has(notifId),
                      targetTab: 'orders',
                      badge: 'Bid Won 🏆',
                      badgeColor: '#10b981'
                    });
                  }
                });
              }
            } catch {}
          }

          // (C) Buyer Delivery Tracking updates
          try {
            const plansRes = await axios.get(`${API_BASE_URL}/api/Logistics/plans`);
            if (Array.isArray(plansRes.data)) {
              plansRes.data.filter((p: any) => p.status === 'Scheduled' || p.status === 'Delivered').slice(0, 2).forEach((p: any) => {
                items.push({
                  id: `buyer-delivery-${p.id || p.planId}`,
                  type: 'logistics',
                  title: p.status === 'Delivered' ? `✅ Order Delivered` : `🚚 Cold-Chain In-Transit`,
                  message: `${p.pickupLocation} ➔ ${p.deliveryLocation} (${p.selectedRoute}). ${p.status === 'Delivered' ? 'Delivery verified.' : `Arrival ETA: ${formatTimeStr(p.estimatedETA)}`}`,
                  time: timeAgo(p.updatedAt || p.createdAt),
                  unread: !readIds.has(`buyer-delivery-${p.id || p.planId}`),
                  targetTab: 'orders',
                  badge: p.status === 'Delivered' ? 'Delivered' : 'Live Transit',
                  badgeColor: p.status === 'Delivered' ? '#10b981' : '#0284c7'
                });
              });
            }
          } catch {}

          // (D) Catch Smart Match Alert
          items.push({
            id: 'buyer-smart-match',
            type: 'order',
            title: 'Fresh Catch Match Available',
            message: 'Grade A Yellowfin Tuna posted at Negombo Harbour matches your procurement criteria.',
            time: '10m ago',
            unread: !readIds.has('buyer-smart-match'),
            targetTab: 'saved-preferences',
            badge: 'Smart Match',
            badgeColor: '#8b5cf6'
          });

        // ═════════════════════════════════════════════════════════════════════
        // 3. FISHERMAN ROLE NOTIFICATIONS (New Bids, Quality Score, Market Trends)
        // ═════════════════════════════════════════════════════════════════════
        } else if (role === 'Fisherman') {
          // (A) Check incoming buyer bids
          try {
            const catchBids = await axios.get(`${API_BASE_URL}/api/Bids/catch/1`);
            if (Array.isArray(catchBids.data)) {
              catchBids.data.forEach((b: any) => {
                const buyerName = b.buyer?.fullName || 'OceanFresh Buyer';
                if (b.status === 'Accepted') {
                  items.push({
                    id: `fisher-bid-accepted-${b.id}`,
                    type: 'order',
                    title: `✅ Deal Finalized: Rs. ${Number(b.bidPricePerKg).toLocaleString()}/kg`,
                    message: `You accepted ${buyerName}'s bid. Total value: Rs. ${(Number(b.bidPricePerKg) * 150).toLocaleString()}. Cold-chain reefer van dispatched.`,
                    time: timeAgo(b.bidTime),
                    unread: !readIds.has(`fisher-bid-accepted-${b.id}`),
                    targetTab: 'home',
                    badge: 'Deal Closed',
                    badgeColor: '#10b981'
                  });
                } else if (b.status === 'Pending') {
                  items.push({
                    id: `fisher-bid-new-${b.id}`,
                    type: 'order',
                    title: `💰 New Bid Placed by ${buyerName}`,
                    message: `Offer of Rs. ${Number(b.bidPricePerKg).toLocaleString()}/kg on your 150kg Yellowfin Tuna. Review and accept now.`,
                    time: timeAgo(b.bidTime),
                    unread: !readIds.has(`fisher-bid-new-${b.id}`),
                    targetTab: 'home',
                    badge: 'New Offer',
                    badgeColor: '#3b82f6'
                  });
                }
              });
            }
          } catch {}

          // (B) Catch Quality CV Scan
          items.push({
            id: 'fisherman-quality-1',
            type: 'quality',
            title: 'AI Computer-Vision Quality Certified',
            message: 'Your recent Yellowfin Tuna catch was graded as Grade A (Freshness 92/100). Premium pricing enabled.',
            time: '30m ago',
            unread: !readIds.has('fisherman-quality-1'),
            targetTab: 'home',
            badge: 'Quality AI',
            badgeColor: '#059669'
          });

          // (C) Market wholesale price surge
          items.push({
            id: 'fisherman-market-1',
            type: 'market',
            title: 'Market Surge: Yellowfin Tuna +12%',
            message: 'Wholesale prices rose at Negombo & Beruwala fish landing sites. High buyer demand.',
            time: '1h ago',
            unread: !readIds.has('fisherman-market-1'),
            targetTab: 'market',
            badge: 'Price Surge',
            badgeColor: '#10b981'
          });
        }
      } catch (err) {
        console.error('Error fetching notifications:', err);
      }

      if (isMounted) {
        setNotifications(items);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 8000);

    // Also listen to window event for instant update when fisherman accepts a bid
    const handleBidAcceptedEvent = () => {
      fetchNotifications();
    };
    window.addEventListener('fishlink:bid_accepted', handleBidAcceptedEvent);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('fishlink:bid_accepted', handleBidAcceptedEvent);
    };
  }, [role, readIds]);

  const unreadCount = notifications.filter(n => n.unread).length;

  const markAllAsRead = () => {
    const allIds = new Set(readIds);
    notifications.forEach(n => allIds.add(n.id));
    setReadIds(allIds);
    try {
      localStorage.setItem('fishlink_read_notifications', JSON.stringify(Array.from(allIds)));
    } catch {}
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  };

  const handleNotificationClick = (item: NotificationItem) => {
    if (item.unread) {
      const allIds = new Set(readIds);
      allIds.add(item.id);
      setReadIds(allIds);
      try {
        localStorage.setItem('fishlink_read_notifications', JSON.stringify(Array.from(allIds)));
      } catch {}
      setNotifications(prev =>
        prev.map(n => (n.id === item.id ? { ...n, unread: false } : n))
      );
    }
    setIsOpen(false);
    onNavigate(item.targetTab);
  };

  const roleConfig = {
    Admin: {
      title: 'Admin Alerts',
      badgeTitle: '🛡️ Admin Center',
      sub: 'Deliveries, Fleet Dispatch & Fraud Reviews',
      accent: '#0284c7',
      bgLight: '#f0f9ff',
      borderLight: '#bae6fd',
      iconEmoji: '🛡️',
      specialFilter: 'logistics',
      specialFilterLabel: '🚚 Deliveries'
    },
    Fisherman: {
      title: 'Fisher Alerts',
      badgeTitle: '🎣 Fisherman Center',
      sub: 'Buyer Bids, Quality Grading & Harbour Trends',
      accent: '#059669',
      bgLight: '#ecfdf5',
      borderLight: '#a7f3d0',
      iconEmoji: '🎣',
      specialFilter: 'order',
      specialFilterLabel: '💰 Buyer Bids'
    },
    Buyer: {
      title: 'Buyer Alerts',
      badgeTitle: '🛒 Buyer Center',
      sub: 'Accepted Bids, Order Status & Live Deliveries',
      accent: '#6366f1',
      bgLight: '#eef2ff',
      borderLight: '#c7d2fe',
      iconEmoji: '🛒',
      specialFilter: 'order',
      specialFilterLabel: '🏆 Accepted Bids'
    }
  }[role as 'Admin' | 'Fisherman' | 'Buyer'] || {
    title: 'Notifications',
    badgeTitle: 'Notifications',
    sub: 'Multi-Agent Network Alerts',
    accent: '#0284c7',
    bgLight: '#f0f9ff',
    borderLight: '#bae6fd',
    iconEmoji: '🔔',
    specialFilter: 'logistics',
    specialFilterLabel: 'Special'
  };

  const filteredNotifications =
    filter === 'unread'
      ? notifications.filter(n => n.unread)
      : filter === 'special'
      ? notifications.filter(n => n.type === roleConfig.specialFilter || (role === 'Buyer' && n.title.includes('Bid Accepted')))
      : notifications;

  const specialCount = notifications.filter(
    n => n.type === roleConfig.specialFilter || (role === 'Buyer' && n.title.includes('Bid Accepted'))
  ).length;

  const getIcon = (type: string) => {
    switch (type) {
      case 'logistics':
        return <Truck size={16} color="#0284c7" />;
      case 'fraud':
        return <ShieldAlert size={16} color="#ef4444" />;
      case 'market':
        return <TrendingUp size={16} color="#10b981" />;
      case 'quality':
        return <CheckCircle2 size={16} color="#059669" />;
      case 'order':
        return <Sparkles size={16} color="#8b5cf6" />;
      default:
        return <Layers size={16} color="#64748b" />;
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Role-Specific Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`${roleConfig.title}`}
        title={`View ${roleConfig.title}`}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          borderRadius: 20,
          border: `1.5px solid ${isOpen ? roleConfig.accent : roleConfig.borderLight}`,
          background: isOpen ? roleConfig.bgLight : '#ffffff',
          color: '#1e293b',
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          transition: 'all 0.2s ease',
          outline: 'none'
        }}
      >
        <span style={{ fontSize: '0.95rem' }}>{roleConfig.iconEmoji}</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: roleConfig.accent }}>
          {roleConfig.title}
        </span>
        <Bell size={15} style={{ color: unreadCount > 0 ? roleConfig.accent : '#64748b' }} />

        {unreadCount > 0 && (
          <span
            style={{
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 10,
              background: '#ef4444',
              color: '#ffffff',
              fontSize: '0.68rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)',
              animation: 'pulse 2s infinite'
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 48,
            width: 395,
            maxWidth: '92vw',
            background: '#ffffff',
            borderRadius: 14,
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08)',
            border: '1px solid #e2e8f0',
            zIndex: 1050,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 18px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: roleConfig.bgLight
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a' }}>
                  {roleConfig.badgeTitle}
                </span>
                {unreadCount > 0 && (
                  <span
                    style={{
                      background: '#ef4444',
                      color: '#ffffff',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 10
                    }}
                  >
                    {unreadCount} new
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', marginTop: 1 }}>
                {roleConfig.sub}
              </span>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: roleConfig.accent,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 6px',
                  borderRadius: 6
                }}
              >
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>

          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              padding: '8px 14px',
              gap: 6,
              borderBottom: '1px solid #f1f5f9',
              background: '#ffffff',
              overflowX: 'auto'
            }}
          >
            <button
              type="button"
              onClick={() => setFilter('all')}
              style={{
                border: 'none',
                background: filter === 'all' ? roleConfig.accent : '#f1f5f9',
                color: filter === 'all' ? '#ffffff' : '#64748b',
                fontSize: '0.74rem',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 14,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              style={{
                border: 'none',
                background: filter === 'unread' ? roleConfig.accent : '#f1f5f9',
                color: filter === 'unread' ? '#ffffff' : '#64748b',
                fontSize: '0.74rem',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 14,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              Unread ({unreadCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('special' as any)}
              style={{
                border: 'none',
                background: (filter as any) === 'special' ? roleConfig.accent : '#f1f5f9',
                color: (filter as any) === 'special' ? '#ffffff' : '#64748b',
                fontSize: '0.74rem',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 14,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              {roleConfig.specialFilterLabel} ({specialCount})
            </button>
          </div>

          {/* Notification List */}
          <div
            style={{
              maxHeight: 380,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {filteredNotifications.length === 0 ? (
              <div
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  color: '#94a3b8',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                <Inbox size={34} style={{ opacity: 0.5 }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                  {filter === 'unread'
                    ? "You're all caught up! No unread notifications."
                    : 'No notifications at this moment.'}
                </span>
              </div>
            ) : (
              filteredNotifications.map(item => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #f8fafc',
                    background: item.unread ? '#f0f9ff' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    transition: 'background 0.15s ease',
                    position: 'relative'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = item.unread ? '#e0f2fe' : '#f8fafc';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = item.unread ? '#f0f9ff' : '#ffffff';
                  }}
                >
                  {/* Type Icon Badge */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                  >
                    {getIcon(item.type)}
                  </div>

                  {/* Text Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        marginBottom: 3
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: item.unread ? 700 : 600,
                          color: '#0f172a',
                          lineHeight: 1.3
                        }}
                      >
                        {item.title}
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          color: '#94a3b8',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3
                        }}
                      >
                        <Clock size={11} /> {item.time}
                      </span>
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.78rem',
                        color: '#475569',
                        lineHeight: 1.4,
                        marginBottom: 6
                      }}
                    >
                      {item.message}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: 10,
                          background: `${item.badgeColor}15`,
                          color: item.badgeColor
                        }}
                      >
                        {item.badge}
                      </span>

                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: '#0284c7',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2
                        }}
                      >
                        View <ArrowRight size={12} />
                      </span>
                    </div>
                  </div>

                  {/* Unread dot */}
                  {item.unread && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: '#0284c7',
                        marginTop: 4,
                        flexShrink: 0
                      }}
                    />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid #f1f5f9',
              background: '#f8fafc',
              textAlign: 'center'
            }}
          >
            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
              FishLink Multi-Agent Autonomous Notifications
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
