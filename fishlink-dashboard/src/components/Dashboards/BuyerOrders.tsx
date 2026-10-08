import React, { useState, useEffect } from 'react';
import { ShoppingCart, Truck, AlertCircle, RefreshCw, Package, X, CheckCircle, Clock, Printer } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL, formatErrorMessage } from '../../config/api';

interface DeliveryDetails {
  planId?: string;
  vehicle?: string;
  driver?: string;
  storage?: string;
  route?: string;
  distanceKm?: number;
  estimatedMinutes?: number;
  status?: string;
  pickupLocation?: string;
  deliveryLocation?: string;
  eta?: string;
  pickupTime?: string;
  reasoning?: string;
}

interface BuyerOrder {
  orderId: number;
  orderCode: string;
  bidId: number;
  catchId?: number;
  fishSpecies: string;
  quantityKg: number;
  bidPricePerKg: number;
  totalAmount: number;
  status: string;
  createdAt: string;
  pickupLocation: string;
  photoUrl?: string;
  qualityGrade?: string;
  delivery?: DeliveryDetails | null;
}

interface MyBid {
  id: number;
  catchId: number;
  bidPricePerKg: number;
  bidTime: string;
  status: string; // 'Pending' | 'Accepted' | 'Lost' | 'Rejected'
  species: string;
  quantityKg: number;
  location: string;
  askingPrice: number;
  qualityGrade: string;
  currentHighest: number;
}

interface BuyerOrdersProps {
  onBrowseMarket?: () => void;
}

export const BuyerOrders: React.FC<BuyerOrdersProps> = ({ onBrowseMarket }) => {
  const [activeSubTab, setActiveSubTab] = useState<'orders' | 'bids'>('orders');
  const [bidFilter, setBidFilter] = useState<'ALL' | 'Pending' | 'Accepted' | 'Lost'>('ALL');
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [bids, setBids] = useState<MyBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Selected items for modal view
  const [selectedOrder, setSelectedOrder] = useState<BuyerOrder | null>(null);
  const [selectedBid, setSelectedBid] = useState<MyBid | null>(null);

  const authHeader = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [ordersRes, bidsRes] = await Promise.all([
        axios.get<BuyerOrder[]>(`${API_BASE_URL}/api/Bids/my-orders`, { headers: authHeader }),
        axios.get<MyBid[]>(`${API_BASE_URL}/api/Bids/my`, { headers: authHeader })
      ]);

      const fetchedOrders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
      const fetchedBids = Array.isArray(bidsRes.data) ? bidsRes.data : [];

      setOrders(fetchedOrders);
      setBids(fetchedBids);
    } catch (err: any) {
      setError(formatErrorMessage(err, 'Failed to load your orders and bids.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSpent = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
  const pendingBidsCount = bids.filter(b => b.status === 'Pending').length;
  const acceptedBidsCount = bids.filter(b => b.status === 'Accepted').length;

  // Filtered bids
  const filteredBids = bids.filter(b => {
    if (bidFilter === 'ALL') return true;
    if (bidFilter === 'Lost') return b.status === 'Lost' || b.status === 'Rejected';
    return b.status === bidFilter;
  });

  return (
    <div className="dashboard-content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={26} color="#005b96" /> My Fish Orders & Bids
          </h2>
          <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: '0.9rem' }}>
            Click on any card to inspect full purchase orders, cold-chain logistics plans, or pending bid offers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-outline"
            onClick={fetchData}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {onBrowseMarket && (
            <button
              type="button"
              className="btn-primary"
              onClick={onBrowseMarket}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', fontSize: '0.85rem', margin: 0 }}
            >
              <ShoppingCart size={15} /> Live Market
            </button>
          )}
        </div>
      </div>

      {/* ── Interactive KPI Cards (Clickable) ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        
        {/* Card 1: Confirmed Orders */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setActiveSubTab('orders');
            if (orders.length > 0) setSelectedOrder(orders[0]);
          }}
          className="workflow-card"
          style={{
            padding: '16px 20px',
            borderLeft: '4px solid #0284c7',
            cursor: 'pointer',
            transition: 'all 0.2s',
            outline: 'none',
            background: activeSubTab === 'orders' ? '#f0f9ff' : 'white',
            borderColor: activeSubTab === 'orders' ? '#bae6fd' : undefined
          }}
          title="Click to view all confirmed fish purchases"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Confirmed Orders</span>
            <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 700 }}>Click to View →</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
            {orders.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: 4 }}>
            Purchases accepted by fishers
          </span>
        </div>

        {/* Card 2: Total Purchase Value */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setActiveSubTab('orders');
            if (orders.length > 0) setSelectedOrder(orders[0]);
          }}
          className="workflow-card"
          style={{
            padding: '16px 20px',
            borderLeft: '4px solid #10b981',
            cursor: 'pointer',
            transition: 'all 0.2s',
            outline: 'none',
            background: activeSubTab === 'orders' ? '#f0fdf4' : 'white',
            borderColor: activeSubTab === 'orders' ? '#bbf7d0' : undefined
          }}
          title="Click to inspect purchase financial totals"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Total Purchase Value</span>
            <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>Click to View →</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#059669', marginTop: 4 }}>
            Rs. {totalSpent.toLocaleString()}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
            Total committed amount
          </span>
        </div>

        {/* Card 3: Active Pending Bids */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setActiveSubTab('bids');
            setBidFilter('Pending');
            const firstPending = bids.find(b => b.status === 'Pending');
            if (firstPending) setSelectedBid(firstPending);
          }}
          className="workflow-card"
          style={{
            padding: '16px 20px',
            borderLeft: '4px solid #f59e0b',
            cursor: 'pointer',
            transition: 'all 0.2s',
            outline: 'none',
            background: activeSubTab === 'bids' && bidFilter === 'Pending' ? '#fffbeb' : 'white',
            borderColor: activeSubTab === 'bids' && bidFilter === 'Pending' ? '#fde68a' : undefined
          }}
          title="Click to view details of your pending bids"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Active Pending Bids</span>
            <span style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: 700 }}>Click to View ({pendingBidsCount}) →</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#d97706', marginTop: 4 }}>
            {pendingBidsCount}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: 4 }}>
            Awaiting fisherman decision
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 10, width: 'fit-content' }}>
          <button
            type="button"
            onClick={() => setActiveSubTab('orders')}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: activeSubTab === 'orders' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'orders' ? '#005b96' : '#64748b',
              boxShadow: activeSubTab === 'orders' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            📦 Confirmed Orders ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('bids')}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: activeSubTab === 'bids' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'bids' ? '#005b96' : '#64748b',
              boxShadow: activeSubTab === 'bids' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            🏷️ All My Bids ({bids.length})
          </button>
        </div>

        {/* Filter Pills for Bids */}
        {activeSubTab === 'bids' && bids.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Filter:</span>
            {(['ALL', 'Pending', 'Accepted', 'Lost'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setBidFilter(f)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 14,
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: bidFilter === f ? 700 : 500,
                  cursor: 'pointer',
                  background: bidFilter === f ? '#005b96' : '#e2e8f0',
                  color: bidFilter === f ? '#ffffff' : '#475569'
                }}
              >
                {f === 'ALL' ? `All (${bids.length})` : f === 'Pending' ? `Pending (${pendingBidsCount})` : f === 'Accepted' ? `Won (${acceptedBidsCount})` : 'Closed'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{ display: 'flex', gap: 10, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: 14, marginBottom: 20 }}>
          <AlertCircle color="#ef4444" size={18} style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, color: '#991b1b', fontSize: '0.85rem' }}>{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
          <RefreshCw size={28} color="#005b96" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <p>Loading your orders and purchase history...</p>
        </div>
      )}

      {/* ── SubTab 1: Confirmed Orders ─────────────────────────────────────────── */}
      {!loading && activeSubTab === 'orders' && (
        <div>
          {orders.length === 0 ? (
            <div className="workflow-card" style={{ textAlign: 'center', padding: '50px 20px' }}>
              <Package size={52} color="#94a3b8" style={{ marginBottom: 14 }} />
              <h3 style={{ margin: '0 0 8px', color: '#334155' }}>No Confirmed Orders Yet</h3>
              <p style={{ color: '#64748b', maxWidth: 460, margin: '0 auto 20px', fontSize: '0.9rem' }}>
                When you place a bid on a live catch and the fisherman accepts your price, your official order and cold-chain logistics delivery plan will be generated and shown here.
              </p>
              {onBrowseMarket && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onBrowseMarket}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 20px' }}
                >
                  <ShoppingCart size={16} /> Browse Live Market to Place Bids
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              {orders.map(order => (
                <div
                  key={order.orderId}
                  className="workflow-card"
                  style={{
                    padding: '22px',
                    borderLeft: '4px solid #10b981',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.2s'
                  }}
                  onClick={() => setSelectedOrder(order)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#0f172a' }}>
                          {order.orderCode}
                        </span>
                        <span style={{
                          background: '#dcfce7', color: '#166534', padding: '3px 10px',
                          borderRadius: 12, fontSize: '0.75rem', fontWeight: 700, border: '1px solid #86efac'
                        }}>
                          ✓ Deal Accepted & Confirmed
                        </span>
                        <span style={{
                          background: '#e0f2fe', color: '#0369a1', padding: '3px 10px',
                          borderRadius: 12, fontSize: '0.75rem', fontWeight: 700
                        }}>
                          Grade {order.qualityGrade || 'A'}
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                        Ordered on {new Date(order.createdAt).toLocaleDateString()} at {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'block' }}>Total Order Amount</span>
                      <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#059669' }}>
                        Rs. {Number(order.totalAmount).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Order Specs */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 600, display: 'block' }}>Fish Species</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                        🐟 {order.fishSpecies}
                      </span>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 600, display: 'block' }}>Catch Weight</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                        ⚖️ {order.quantityKg} kg
                      </span>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 600, display: 'block' }}>Winning Bid Price</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0284c7' }}>
                        Rs. {Number(order.bidPricePerKg).toLocaleString()} / kg
                      </span>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 600, display: 'block' }}>Harbor Origin</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                        📍 {order.pickupLocation}
                      </span>
                    </div>
                  </div>

                  {/* Delivery & Logistics Status Card */}
                  <div style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 10,
                    padding: '14px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 10
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Truck size={20} color="#16a34a" />
                      <div>
                        <strong style={{ fontSize: '0.88rem', color: '#166534', display: 'block' }}>
                          Cold-Chain Logistics Planned & Assigned
                        </strong>
                        <span style={{ fontSize: '0.78rem', color: '#15803d' }}>
                          {order.delivery?.vehicle ? `Vehicle: ${order.delivery.vehicle} · Driver: ${order.delivery.driver || 'Certified'}` : 'Direct Harbor cold transport ready'}
                        </span>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOrder(order);
                      }}
                      style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      View Invoice & Logistics Details →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SubTab 2: My Bids ─────────────────────────────────────────────────── */}
      {!loading && activeSubTab === 'bids' && (
        <div>
          {filteredBids.length === 0 ? (
            <div className="workflow-card" style={{ textAlign: 'center', padding: '50px 20px' }}>
              <ShoppingCart size={48} color="#94a3b8" style={{ marginBottom: 12 }} />
              <h3 style={{ margin: '0 0 6px', color: '#334155' }}>
                {bidFilter === 'ALL' ? 'No Bids Placed Yet' : `No ${bidFilter} Bids Found`}
              </h3>
              <p style={{ color: '#64748b', maxWidth: 450, margin: '0 auto 18px', fontSize: '0.9rem' }}>
                {bidFilter === 'ALL'
                  ? "You haven't placed any bids on live catches. Explore the Live Market to find fish and place your offers."
                  : `You currently have 0 bids under the '${bidFilter}' category.`}
              </p>
              {onBrowseMarket && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onBrowseMarket}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px' }}
                >
                  <ShoppingCart size={15} /> Go to Live Market
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {filteredBids.map(bid => {
                const isAccepted = bid.status === 'Accepted';
                const isPending = bid.status === 'Pending';

                return (
                  <div
                    key={bid.id}
                    className="workflow-card"
                    style={{
                      padding: '16px 20px',
                      borderLeft: `4px solid ${isAccepted ? '#10b981' : isPending ? '#f59e0b' : '#94a3b8'}`,
                      cursor: 'pointer',
                      transition: 'transform 0.15s, box-shadow 0.15s'
                    }}
                    onClick={() => setSelectedBid(bid)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>
                            🐟 {bid.species}
                          </span>
                          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                            ({bid.quantityKg} kg)
                          </span>
                          <span style={{
                            padding: '3px 10px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700,
                            background: isAccepted ? '#dcfce7' : isPending ? '#fef3c7' : '#f1f5f9',
                            color: isAccepted ? '#15803d' : isPending ? '#b45309' : '#64748b',
                            border: `1px solid ${isAccepted ? '#86efac' : isPending ? '#fde68a' : '#e2e8f0'}`
                          }}>
                            {isAccepted ? '✓ Bid Accepted (Won)' : isPending ? '⏳ Pending Decision' : '✗ Outbid / Closed'}
                          </span>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                          Location: {bid.location} · Placed {new Date(bid.bidTime).toLocaleDateString()} at {new Date(bid.bidTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'block' }}>Your Offer</span>
                          <span style={{ fontSize: '1.2rem', fontWeight: 800, color: isAccepted ? '#059669' : '#0284c7' }}>
                            Rs. {Number(bid.bidPricePerKg).toLocaleString()} / kg
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>
                            Total: Rs. {(Number(bid.bidPricePerKg) * bid.quantityKg).toLocaleString()}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBid(bid);
                          }}
                          style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                        >
                          Details →
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Order Details Modal ───────────────────────────────────────────────── */}
      {selectedOrder && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 14, padding: 28, width: '100%', maxWidth: 580,
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: 14, marginBottom: 18 }}>
              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0284c7', fontWeight: 700 }}>
                  Official Purchase Invoice
                </span>
                <h3 style={{ margin: '2px 0 0', fontSize: '1.35rem', color: '#0f172a' }}>
                  {selectedOrder.orderCode}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Status & Date */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px 16px', borderRadius: 8, marginBottom: 18 }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Order Status</span>
                <strong style={{ color: '#166534', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem' }}>
                  <CheckCircle size={15} color="#16a34a" /> Confirmed & Dispatched
                </strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Order Date</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                  {new Date(selectedOrder.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Fish Catch Details */}
            <div style={{ marginBottom: 18 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '0.92rem', color: '#1e293b' }}>🐟 Fish Catch Specifications</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.85rem' }}>
                <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6 }}>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Species</span>
                  <strong>{selectedOrder.fishSpecies}</strong>
                </div>
                <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6 }}>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Quality Grade</span>
                  <strong>Grade {selectedOrder.qualityGrade || 'A'} (Fresh Quality)</strong>
                </div>
                <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6 }}>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Total Weight</span>
                  <strong>{selectedOrder.quantityKg} kg</strong>
                </div>
                <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6 }}>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Harbor Origin</span>
                  <strong>{selectedOrder.pickupLocation}</strong>
                </div>
              </div>
            </div>

            {/* Financials */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 14, marginBottom: 18 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.88rem', color: '#166534' }}>💰 Price Breakdown</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4, color: '#334155' }}>
                <span>Agreed Bid Price:</span>
                <span>Rs. {Number(selectedOrder.bidPricePerKg).toLocaleString()} / kg</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 6, color: '#334155' }}>
                <span>Weight:</span>
                <span>{selectedOrder.quantityKg} kg</span>
              </div>
              <div style={{ borderTop: '1px dashed #86efac', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.05rem', color: '#15803d' }}>
                <span>Total Amount:</span>
                <span>Rs. {Number(selectedOrder.totalAmount).toLocaleString()}</span>
              </div>
            </div>

            {/* Logistics Tracking */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Truck size={17} color="#0284c7" />
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a' }}>Cold-Chain Logistics Dispatch</h4>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.82rem', color: '#475569' }}>
                <div>
                  <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.72rem' }}>Refrigerated Transport</span>
                  <strong>{selectedOrder.delivery?.vehicle || 'VAN-01 (Active Chiller)'}</strong>
                </div>
                <div>
                  <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.72rem' }}>Certified Driver</span>
                  <strong>{selectedOrder.delivery?.driver || 'D-01 (Negombo Transport)'}</strong>
                </div>
                <div>
                  <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.72rem' }}>Departure Time</span>
                  <strong style={{ color: '#0369a1' }}>
                    🛫 {selectedOrder.delivery?.pickupTime ? new Date(selectedOrder.delivery.pickupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '01:25 PM'}
                  </strong>
                </div>
                <div>
                  <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.72rem' }}>Estimated Arrival (ETA)</span>
                  <strong style={{ color: '#16a34a' }}>
                    🏁 {selectedOrder.delivery?.eta ? new Date(selectedOrder.delivery.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '02:20 PM'}
                  </strong>
                </div>
                <div>
                  <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.72rem' }}>Cold Storage Facility</span>
                  <strong>{selectedOrder.delivery?.storage || 'CS-01 (Pre-chilled)'}</strong>
                </div>
                <div>
                  <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.72rem' }}>Delivery Route</span>
                  <strong>{selectedOrder.delivery?.route || 'Coastal Highway Fast-Track'}</strong>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn-outline"
                onClick={() => window.print()}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px' }}
              >
                <Printer size={15} /> Print Receipt
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setSelectedOrder(null)}
                style={{ flex: 1, padding: '9px 14px', margin: 0 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bid Details Modal ─────────────────────────────────────────────────── */}
      {selectedBid && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 14, padding: 28, width: '100%', maxWidth: 520,
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: 12, marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#d97706', fontWeight: 700 }}>
                  Bid Submission Details
                </span>
                <h3 style={{ margin: '2px 0 0', fontSize: '1.25rem', color: '#0f172a' }}>
                  🐟 {selectedBid.species} ({selectedBid.quantityKg} kg)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBid(null)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Status indicator */}
            <div style={{
              background: selectedBid.status === 'Accepted' ? '#dcfce7' : selectedBid.status === 'Pending' ? '#fef3c7' : '#f1f5f9',
              border: `1px solid ${selectedBid.status === 'Accepted' ? '#86efac' : selectedBid.status === 'Pending' ? '#fde68a' : '#cbd5e1'}`,
              borderRadius: 8, padding: '12px 14px', marginBottom: 16
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {selectedBid.status === 'Accepted' ? (
                  <CheckCircle size={18} color="#15803d" />
                ) : selectedBid.status === 'Pending' ? (
                  <Clock size={18} color="#b45309" />
                ) : (
                  <AlertCircle size={18} color="#64748b" />
                )}
                <div>
                  <strong style={{
                    color: selectedBid.status === 'Accepted' ? '#15803d' : selectedBid.status === 'Pending' ? '#b45309' : '#475569',
                    fontSize: '0.9rem'
                  }}>
                    {selectedBid.status === 'Accepted'
                      ? '✓ Bid Accepted! This catch was awarded to you.'
                      : selectedBid.status === 'Pending'
                      ? '⏳ Awaiting Fisherman Decision'
                      : '✗ Outbid or Listing Closed'}
                  </strong>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    {selectedBid.status === 'Pending'
                      ? 'The fisherman is currently reviewing bids. You will be notified when they accept.'
                      : selectedBid.status === 'Accepted'
                      ? 'An official purchase order and logistics delivery plan have been created.'
                      : 'Another buyer submitted a higher bid or the fisherman closed this listing.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Bid Price vs Asking */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.73rem', color: '#64748b', display: 'block' }}>Your Submitted Bid</span>
                <strong style={{ fontSize: '1.15rem', color: '#0284c7' }}>
                  Rs. {Number(selectedBid.bidPricePerKg).toLocaleString()} / kg
                </strong>
                <span style={{ fontSize: '0.73rem', color: '#64748b', display: 'block', marginTop: 2 }}>
                  Total: Rs. {(Number(selectedBid.bidPricePerKg) * selectedBid.quantityKg).toLocaleString()}
                </span>
              </div>

              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.73rem', color: '#64748b', display: 'block' }}>Original Asking Price</span>
                <strong style={{ fontSize: '1.15rem', color: '#334155' }}>
                  Rs. {Number(selectedBid.askingPrice).toLocaleString()} / kg
                </strong>
                <span style={{ fontSize: '0.73rem', color: '#64748b', display: 'block', marginTop: 2 }}>
                  Total: Rs. {(Number(selectedBid.askingPrice) * selectedBid.quantityKg).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Extra Catch Meta */}
            <div style={{ fontSize: '0.82rem', color: '#475569', background: '#f8fafc', padding: '10px 14px', borderRadius: 8, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Catch Location:</span>
                <strong>📍 {selectedBid.location}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Quality Score:</span>
                <strong>Grade {selectedBid.qualityGrade || 'A'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Bid Submitted On:</span>
                <span>{new Date(selectedBid.bidTime).toLocaleString()}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              {onBrowseMarket && (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => {
                    setSelectedBid(null);
                    onBrowseMarket();
                  }}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px' }}
                >
                  <ShoppingCart size={15} /> View Market
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={() => setSelectedBid(null)}
                style={{ flex: 1, padding: '9px 14px', margin: 0 }}
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};
