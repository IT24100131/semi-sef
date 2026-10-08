import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { Fish, MapPin, Activity, Ship, ShoppingCart, LogOut, ShieldAlert, Settings, SlidersHorizontal } from 'lucide-react';
import axios from 'axios';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { Landing } from './components/Landing';
import { FishermanDashboard } from './components/Dashboards/FishermanDashboard';
import { MarketTrends } from './components/Dashboards/MarketTrends';
import { BuyerDashboard } from './components/Dashboards/BuyerDashboard';
import { BuyerOrders } from './components/Dashboards/BuyerOrders';
import { AdminDashboard } from './components/Dashboards/AdminDashboard';
import { LogisticsDashboard } from './components/Dashboards/LogisticsDashboard';
import { AccountSettingsModal } from './components/AccountSettingsModal';
import { NotificationBell } from './components/NotificationBell';
import { API_BASE_URL } from './config/api';
import './App.css';

const DashboardLayout = () => {
  const [role, setRole] = useState<string>(() => localStorage.getItem('role') || 'Admin');
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('home');
  const [showSettings, setShowSettings] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [pendingPlansCount, setPendingPlansCount] = useState<number>(0);

  const handleRoleSwitch = (newRole: string) => {
    setRole(newRole);
    localStorage.setItem('role', newRole);
    setActiveTab('home');
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await axios.get(`${API_BASE_URL}/api/Users/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data?.fullName) {
          setUserName(res.data.fullName);
        }
      } catch {
        try {
          const token = localStorage.getItem('token') ?? '';
          if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const name = payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'];
            if (name) setUserName(name);
          }
        } catch {}
      }
    };
    fetchUser();

    const fetchPendingPlans = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/Logistics/plans/pending`);
        if (Array.isArray(res.data)) {
          setPendingPlansCount(res.data.length);
        }
      } catch {}
    };
    fetchPendingPlans();
    const interval = setInterval(fetchPendingPlans, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('role');
    localStorage.removeItem('token');
    navigate('/');
  };

  const renderContent = () => {
    if (role === 'Admin') {
      const currentTab = activeTab === 'logistics' ? 'logistics' : activeTab === 'workflows' ? 'workflows' : 'flagged';
      return (
        <AdminDashboard
          defaultTab={currentTab}
          onTabChange={(tab) => {
            if (tab === 'flagged') setActiveTab('home');
            else setActiveTab(tab);
          }}
        />
      );
    }
    if (role === 'Logistics') {
      return <LogisticsDashboard />;
    }
    if (role === 'Buyer') {
      if (activeTab === 'home')              return <BuyerDashboard initialTab="recommend" onNavigateTab={(t: string) => setActiveTab(t)} />;
      if (activeTab === 'saved-preferences') return <BuyerDashboard initialTab="saved-preferences" onNavigateTab={(t: string) => setActiveTab(t)} />;
      if (activeTab === 'preferences')       return <BuyerDashboard initialTab="preferences" onNavigateTab={(t: string) => setActiveTab(t)} />;
      if (activeTab === 'orders')            return <BuyerOrders onBrowseMarket={() => setActiveTab('home')} />;
    }
    if (role === 'Fisherman') {
      if (activeTab === 'home')   return <FishermanDashboard />;
      if (activeTab === 'market') return <MarketTrends />;
    }
    return null;
  };

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="logo-container">
          <Fish color="white" size={32} />
          <h2>FishLink AI</h2>
        </div>

        {/* Quick Role Switcher (Admin / Fisherman / Buyer) */}
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.6)',
            fontWeight: 700,
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>Switch Role</span>
            <span style={{ fontSize: '0.65rem', background: '#0284c7', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>{role}</span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 8,
            padding: 3,
            gap: 3
          }}>
            {[
              { key: 'Admin', label: '🛡️ Admin' },
              { key: 'Fisherman', label: '🎣 Fisher' },
              { key: 'Buyer', label: '🛒 Buyer' },
            ].map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => handleRoleSwitch(r.key)}
                style={{
                  border: 'none',
                  borderRadius: 6,
                  padding: '7px 2px',
                  fontSize: '0.73rem',
                  fontWeight: role === r.key ? 700 : 500,
                  cursor: 'pointer',
                  background: role === r.key ? '#0284c7' : 'transparent',
                  color: role === r.key ? '#ffffff' : 'rgba(255,255,255,0.7)',
                  boxShadow: role === r.key ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                  transition: 'all 0.15s ease',
                  textAlign: 'center'
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <nav>
          <ul>
            {role === 'Admin' && (
              <>
                <li className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}>
                  <ShieldAlert size={18} /> <span>Fraud Review</span>
                </li>
                <li className={activeTab === 'workflows' ? 'active' : ''} onClick={() => setActiveTab('workflows')}>
                  <Activity size={18} /> <span>AI Workflows</span>
                </li>
                <li className={activeTab === 'logistics' ? 'active' : ''} onClick={() => setActiveTab('logistics')} style={{ display: 'flex', alignItems: 'center' }}>
                  <MapPin size={18} /> <span style={{ flex: 1 }}>Logistics</span>
                  {pendingPlansCount > 0 && (
                    <span
                      style={{
                        background: '#f59e0b',
                        color: '#ffffff',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        borderRadius: 12,
                        padding: '1px 7px',
                        boxShadow: '0 1px 4px rgba(245, 158, 11, 0.4)'
                      }}
                      title={`${pendingPlansCount} delivery plan(s) awaiting approval`}
                    >
                      {pendingPlansCount}
                    </span>
                  )}
                </li>
              </> 
            )}
            {role === 'Logistics' && (
              <>
                <li className={activeTab === 'logistics' || activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('logistics')}>
                  <MapPin size={18} /> <span>Logistics Dispatch</span>
                </li>
              </>
            )}
            {role === 'Fisherman' && (
              <>
                <li className={activeTab === 'home'   ? 'active' : ''} onClick={() => setActiveTab('home')}>
                  <Ship size={18} /> <span>My Catches</span>
                </li>
                <li className={activeTab === 'market' ? 'active' : ''} onClick={() => setActiveTab('market')}>
                  <Activity size={18} /> <span>Market Trends</span>
                </li>
              </>
            )}
            {role === 'Buyer' && (
              <>
                <li className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}>
                  <ShoppingCart size={18} /> <span>Live Market</span>
                </li>
                <li className={activeTab === 'saved-preferences' ? 'active' : ''} onClick={() => setActiveTab('saved-preferences')}>
                  <SlidersHorizontal size={18} /> <span>Saved Preferences</span>
                </li>
                <li className={activeTab === 'preferences' ? 'active' : ''} onClick={() => setActiveTab('preferences')}>
                  <Settings size={18} /> <span>My Preferences</span>
                </li>
                <li className={activeTab === 'orders' ? 'active' : ''} onClick={() => setActiveTab('orders')}>
                  <MapPin size={18} /> <span>My Orders</span>
                </li>
              </>
            )}
          </ul>
        </nav>
        <div style={{ marginTop: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setShowSettings(true)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'white', borderColor: 'rgba(255,255,255,0.3)', padding: '9px 14px', fontSize: '0.85rem' }}
          >
            <Settings size={15} /> Account Settings
          </button>
          <button className="btn-reject" onClick={handleLogout}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <LogOut size={16} /> Logout ({role})
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>{role} Portal</h1>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: '#f1f5f9',
              padding: '3px 4px',
              borderRadius: 24,
              border: '1px solid #cbd5e1'
            }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', padding: '0 8px' }}>
                Switch View:
              </span>
              {[
                { key: 'Admin', label: '🛡️ Admin' },
                { key: 'Fisherman', label: '🎣 Fisherman' },
                { key: 'Buyer', label: '🛒 Buyer' },
              ].map(r => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => handleRoleSwitch(r.key)}
                  style={{
                    border: 'none',
                    borderRadius: 18,
                    padding: '5px 12px',
                    fontSize: '0.78rem',
                    fontWeight: role === r.key ? 700 : 500,
                    cursor: 'pointer',
                    background: role === r.key ? '#005b96' : 'transparent',
                    color: role === r.key ? '#ffffff' : '#475569',
                    boxShadow: role === r.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NotificationBell
              role={role}
              pendingPlansCount={pendingPlansCount}
              onNavigate={(tab) => {
                setActiveTab(tab);
              }}
            />
            <div
              className="user-profile"
              onClick={() => setShowSettings(true)}
              title="Click to view and edit Account Settings"
              role="button"
              tabIndex={0}
            >
              <span className="user-profile-avatar">
                {userName ? userName.charAt(0).toUpperCase() : role.charAt(0)}
              </span>
              <span className="user-profile-name">{userName || `${role} User`}</span>
              <Settings size={14} style={{ opacity: 0.6 }} />
            </div>
          </div>
        </header>
        {renderContent()}

        {showSettings && (
          <AccountSettingsModal
            onClose={() => setShowSettings(false)}
            onUserUpdated={(u) => setUserName(u.fullName)}
          />
        )}
      </main>
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<DashboardLayout />} />
      </Routes>
    </Router>
  );
}

export default App;
