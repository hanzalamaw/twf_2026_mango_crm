import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

function clearSessionAndRedirectToLogin() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

const OPTIONS = [
  {
    id: 'control',
    name: 'Control Management',
    path: '/control',
    permission: 'control_management',
    emoji: '⚙️',
    desc: 'System controls & settings',
    accent: '#FF5722',
    soft: '#FFF5F2',
  },
  {
    id: 'bookings',
    name: 'Bookings Management',
    path: '/bookings',
    permission: 'booking_management',
    emoji: '📋',
    desc: 'Manage orders & queries',
    accent: '#E65100',
    soft: '#FFF3E0',
  },
  {
    id: 'operations',
    name: 'Operations Management',
    path: '/operations',
    permission: 'operation_management',
    emoji: '📡',
    desc: 'Live ops & monitoring',
    accent: '#BF360C',
    soft: '#FBE9E7',
  },
  {
    id: 'farm',
    name: 'Farm Management',
    path: '/farm',
    permission: 'farm_management',
    emoji: '🌾',
    desc: 'Livestock & farm data',
    accent: '#558B2F',
    soft: '#F1F8E9',
  },
  {
    id: 'procurement',
    name: 'Procurement Management',
    path: '/procurement',
    permission: 'procurement_management',
    emoji: '📦',
    desc: 'Supply chain & vendors',
    accent: '#1565C0',
    soft: '#E3F2FD',
  },
  {
    id: 'accounting',
    name: 'Accounting & Finance',
    path: '/accounting',
    permission: 'accounting_and_finance',
    emoji: '💳',
    desc: 'Financials & reporting',
    accent: '#6A1B9A',
    soft: '#F3E5F5',
  },
  {
    id: 'performance',
    name: 'Performance Management',
    path: '/performance',
    permission: 'performance_management',
    emoji: '📊',
    desc: 'Analytics & KPIs',
    accent: '#00838F',
    soft: '#E0F7FA',
  },
];

const SubSystemSelection = ({ forceMobileLayout = false } = {}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [accessBlocked, setAccessBlocked] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pressedId, setPressedId] = useState(null);

  useEffect(() => {
    if (forceMobileLayout) return undefined;
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [forceMobileLayout]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { clearSessionAndRedirectToLogin(); return; }
    const validate = async () => {
      try {
        const res = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) { setSessionChecked(true); return; }
        if (res.status === 401) {
          const refreshToken = localStorage.getItem('refreshToken');
          if (!refreshToken) { clearSessionAndRedirectToLogin(); return; }
          const refreshRes = await fetch(`${API_BASE}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (!refreshRes.ok) { clearSessionAndRedirectToLogin(); return; }
          const data = await refreshRes.json().catch(() => ({}));
          if (!data?.token) { clearSessionAndRedirectToLogin(); return; }
          localStorage.setItem('token', data.token);
          setSessionChecked(true);
          return;
        }
        clearSessionAndRedirectToLogin();
      } catch (_err) {
        setSessionChecked(true);
      }
    };
    validate();
  }, []);

  useEffect(() => {
    if (sessionChecked) setTimeout(() => setMounted(true), 50);
  }, [sessionChecked]);

  const permissions = user?.permissions || {};
  const hasAccess = (perm) => !!permissions[perm];

  const hasOperationsEntry = (p) =>
    !!(p.operation_management || p.operation_rider_management || p.operation_rider_management_supervisor);

  const isOptionAccessible = (option) => {
    if (option.id === 'operations') return hasOperationsEntry(permissions);
    return hasAccess(option.permission);
  };

  const handleClick = (option) => {
    if (!isOptionAccessible(option)) {
      setAccessBlocked(option.name);
      setTimeout(() => setAccessBlocked(null), 3000);
      return;
    }
    setAccessBlocked(null);
    navigate(option.path);
  };

  // Loading screen
  if (!sessionChecked) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100vh', background: '#FFFFFF',
        fontFamily: "'Poppins', 'Inter', sans-serif",
      }}>
        <p style={{ color: '#888', fontSize: '14px' }}>Checking session…</p>
      </div>
    );
  }

  /* ── Mobile Layout ─────────────────────────────────────────── */
  if (forceMobileLayout || isMobile) {
    const accessibleCount = OPTIONS.filter((o) => isOptionAccessible(o)).length;

    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

          .mob-root {
            min-height: 100vh;
            width: 100%;
            background: #F7F7F8;
            font-family: 'Plus Jakarta Sans', 'Poppins', sans-serif;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            overflow-x: hidden;
          }

          /* Hero header */
          .mob-hero {
            background: linear-gradient(145deg, #FF5722 0%, #FF7043 60%, #FF8A65 100%);
            padding: 52px 20px 28px;
            position: relative;
            overflow: hidden;
            flex-shrink: 0;
          }
          .mob-hero::before {
            content: '';
            position: absolute;
            width: 220px; height: 220px;
            border-radius: 50%;
            background: rgba(255,255,255,0.07);
            top: -60px; right: -50px;
          }
          .mob-hero::after {
            content: '';
            position: absolute;
            width: 140px; height: 140px;
            border-radius: 50%;
            background: rgba(255,255,255,0.05);
            bottom: -40px; left: 20px;
          }

          .mob-hero-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 0;
            position: relative;
            z-index: 1;
          }

          .mob-hero-left {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
          }

          .mob-user-pill {
            display: flex;
            align-items: center;
            gap: 9px;
            background: rgba(255,255,255,0.18);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.25);
            border-radius: 40px;
            padding: 5px 12px 5px 5px;
          }
          .mob-user-avatar {
            width: 30px; height: 30px;
            border-radius: 50%;
            overflow: hidden;
            border: 2px solid rgba(255,255,255,0.6);
            flex-shrink: 0;
          }
          .mob-user-avatar img { width: 100%; height: 100%; object-fit: cover; }
          .mob-user-text { display: flex; flex-direction: column; gap: 1px; }
          .mob-user-name {
            font-size: 11px; font-weight: 700;
            color: #fff; line-height: 1; white-space: nowrap;
          }
          .mob-user-role {
            font-size: 9px; font-weight: 500;
            color: rgba(255,255,255,0.75);
            text-transform: uppercase; letter-spacing: 0.5px; line-height: 1;
          }

          .mob-logout {
            display: flex; align-items: center; gap: 5px;
            padding: 7px 13px;
            background: rgba(255,255,255,0.18);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.25);
            border-radius: 8px;
            color: #fff;
            font-size: 11px; font-weight: 700;
            cursor: pointer;
            font-family: inherit;
            transition: background 0.2s;
          }
          .mob-logout:active { background: rgba(255,255,255,0.28); }

          .mob-hero-body { position: relative; z-index: 1; }
          .mob-brand {
            font-size: 10px; font-weight: 700;
            color: rgba(255,255,255,0.7);
            letter-spacing: 1px; text-transform: uppercase;
            margin-bottom: 6px;
          }
          .mob-title {
            font-size: 26px; font-weight: 800;
            color: #fff; margin: 0 0 6px;
            letter-spacing: -0.5px; line-height: 1.1;
          }
          .mob-subtitle {
            font-size: 12px; font-weight: 500;
            color: rgba(255,255,255,0.72);
            margin: 0;
          }

          /* Toast */
          .mob-toast {
            display: flex; align-items: center; gap: 8px;
            margin: 14px 16px 0;
            padding: 11px 14px;
            background: #FFF5F2;
            border: 1px solid #FFE0D6;
            border-radius: 10px;
            color: #FF5722;
            font-size: 12px; font-weight: 600;
            opacity: 0; transform: translateY(-4px);
            pointer-events: none;
            transition: all 0.25s ease;
            max-height: 0; overflow: hidden;
          }
          .mob-toast.show {
            opacity: 1; transform: translateY(0);
            max-height: 60px; pointer-events: all;
          }

          /* Grid */
          .mob-grid {
            padding: 16px 24px 32px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            /* Prevent grid rows from stretching and leaving empty space in each card */
            flex: initial;
            align-content: start;
            justify-content: center;
            max-width: 1100px;
            margin: 0 auto;
          }

          /* Desktop-ish grid: 4 cards in row 1, 3 in row 2 (for 7 options) */
          @media (min-width: 900px) {
            .mob-grid {
              grid-template-columns: repeat(4, minmax(0, 1fr));
              padding-left: 40px;
              padding-right: 40px;
            }
          }

          /* Card */
          .mob-card {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            padding: 16px 14px;
            background: #fff;
            border: 1.5px solid #F0F0F0;
            border-radius: 18px;
            cursor: pointer;
            font-family: inherit;
            text-align: left;
            box-sizing: border-box;
            box-shadow: 0 2px 10px rgba(0,0,0,0.04);
            transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
            position: relative;
            overflow: hidden;
            align-self: start;
            opacity: 0;
            transform: translateY(16px);
            animation: cardReveal 0.45s ease forwards;
          }

          @keyframes cardReveal {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }

          @media (prefers-reduced-motion: reduce) {
            .mob-card {
              animation: none;
              opacity: 1;
              transform: none;
            }
          }

          .mob-card:active {
            transform: scale(0.96);
            box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          }

          .mob-card.locked {
            opacity: 0.45;
            cursor: not-allowed;
            background: #FAFAFA;
          }
          .mob-card.locked:active { transform: none; }

          /* Card wide (last item if odd) */
          .mob-card.wide {
            grid-column: span 2;
            flex-direction: row;
            align-items: center;
            gap: 14px;
            padding: 14px 16px;
          }
          .mob-card.wide .mob-card-body { flex: 1; }

          .mob-card-icon {
            width: 42px; height: 42px;
            border-radius: 12px;
            display: flex; align-items: center; justify-content: center;
            font-size: 20px;
            margin-bottom: 12px;
            flex-shrink: 0;
            transition: transform 0.2s;
          }
          .mob-card:not(.locked):active .mob-card-icon { transform: scale(1.1); }
          .mob-card.wide .mob-card-icon { margin-bottom: 0; }

          .mob-card-name {
            font-size: 12px; font-weight: 700;
            color: #111827;
            line-height: 1.3;
            margin-bottom: 3px;
          }
          .mob-card-desc {
            font-size: 10px; font-weight: 500;
            color: #9ca3af;
            line-height: 1.3;
          }

          .mob-card-arrow {
            position: absolute;
            bottom: 12px; right: 12px;
            opacity: 0;
            transition: opacity 0.2s;
            color: #d1d5db;
          }
          .mob-card:not(.locked):active .mob-card-arrow { opacity: 1; }
          .mob-card.wide .mob-card-arrow {
            position: static;
            opacity: 1;
            flex-shrink: 0;
          }

          /* Keep last card the same size in 4-col mode */
          @media (min-width: 900px) {
            .mob-card.wide {
              grid-column: span 1;
              flex-direction: column;
              align-items: flex-start;
              gap: 0;
              padding: 16px 14px;
            }
            .mob-card.wide .mob-card-body { flex: initial; }
            .mob-card.wide .mob-card-icon { margin-bottom: 12px; }
            .mob-card.wide .mob-card-arrow {
              position: absolute;
              opacity: 0;
              flex-shrink: 0;
            }
            .mob-card.wide:not(.locked):active .mob-card-arrow { opacity: 1; }
          }

          .mob-lock-badge {
            position: absolute;
            top: 10px; right: 10px;
            width: 20px; height: 20px;
            background: #F3F4F6;
            border-radius: 6px;
            display: flex; align-items: center; justify-content: center;
            color: #9ca3af;
            font-size: 10px;
          }

          /* Bottom count */
          .mob-count {
            text-align: center;
            padding: 0 16px 28px;
            font-size: 11px; font-weight: 500;
            color: #d1d5db;
            letter-spacing: 0.2px;
          }
        `}</style>

        <div className="mob-root">
          {/* Hero */}
          <div className="mob-hero" style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.4s ease' }}>
            <div className="mob-hero-top">
              <div className="mob-hero-left">
                <p className="mob-brand">TWF Cattle CRM</p>
                <h1 className="mob-title">Select Management</h1>
                <p className="mob-subtitle">{accessibleCount} of {OPTIONS.length} systems available</p>
              </div>
              <button type="button" className="mob-logout" onClick={logout}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Logout
              </button>
            </div>
          </div>

          {/* Toast */}
          <div className={`mob-toast ${accessBlocked ? 'show' : ''}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            No permission for {accessBlocked}
          </div>

          {/* Cards grid */}
          <div className="mob-grid">
            {OPTIONS.map((option, idx) => {
              const accessible = isOptionAccessible(option);
              const isLastOdd = idx === OPTIONS.length - 1 && OPTIONS.length % 2 !== 0;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`mob-card ${!accessible ? 'locked' : ''} ${isLastOdd ? 'wide' : ''}`}
                  style={{
                    animationDelay: `${idx * 55}ms`,
                    borderColor: pressedId === option.id ? option.accent : undefined,
                  }}
                  onClick={() => handleClick(option)}
                  onTouchStart={() => accessible && setPressedId(option.id)}
                  onTouchEnd={() => setPressedId(null)}
                  onMouseDown={() => accessible && setPressedId(option.id)}
                  onMouseUp={() => setPressedId(null)}
                >
                  <div className="mob-card-icon" style={{ background: option.soft }}>
                    {option.emoji}
                  </div>
                  <div className="mob-card-body">
                    <div className="mob-card-name">{option.name}</div>
                    <div className="mob-card-desc">{option.desc}</div>
                  </div>
                  {!accessible && (
                    <span className="mob-lock-badge">🔒</span>
                  )}
                  {isLastOdd && accessible && (
                    <span className="mob-card-arrow">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  /* ── Desktop Layout (original, zero changes) ───────────────── */
  const btnStyle = {
    padding: '16px 20px',
    textAlign: 'center',
    background: '#FAFAFA',
    border: '1px solid #F0F0F0',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#333',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      width: '100vw',
      background: '#FFFFFF',
      fontFamily: "'Poppins', 'Inter', sans-serif",
      padding: '40px 20px',
      boxSizing: 'border-box',
      margin: 0,
      position: 'fixed',
      top: 0,
      left: 0,
      overflow: 'auto',
    }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: '920px', flexShrink: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: '#FFE4DB', borderRadius: '24px',
          transform: 'rotate(2deg) translate(6px, 8px)',
          animation: 'cardDrift1 6s ease-in-out infinite', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: '#FFEDE6', borderRadius: '22px',
          transform: 'rotate(-1.5deg) translate(-5px, -6px)',
          animation: 'cardDrift2 5s ease-in-out infinite', zIndex: 1,
        }} />
        <div style={{
          background: '#FFFFFF', borderRadius: '20px', width: '100%',
          position: 'relative', padding: '30px', boxSizing: 'border-box',
          zIndex: 2, boxShadow: '0 5px 25px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: '16px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)', padding: '28px',
            width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <p style={{ color: '#FF5722', fontSize: '12px', fontWeight: '500', margin: '0 0 4px 0' }}>TWF Cattle CRM</p>
                <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#333', margin: 0 }}>Select Management</h1>
              </div>
              <button type="button" onClick={logout} style={{
                padding: '8px 14px', background: '#FFF5F2',
                border: '1px solid #FFE0D6', borderRadius: '8px',
                fontSize: '12px', fontWeight: '600', color: '#FF5722', cursor: 'pointer',
              }}>
                Logout
              </button>
            </div>

            {accessBlocked && (
              <div style={{
                marginBottom: '16px', padding: '10px 14px',
                background: '#FFF5F2', border: '1px solid #FFE0D6',
                borderRadius: '8px', color: '#FF5722', fontSize: '12px',
              }}>
                Access blocked. You do not have permission to open {accessBlocked}.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {OPTIONS.slice(0, 4).map((option) => (
                  <button key={option.id} type="button" onClick={() => handleClick(option)} style={btnStyle}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#FFEDE6'; e.currentTarget.style.borderColor = '#FFE0D6'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#FAFAFA'; e.currentTarget.style.borderColor = '#F0F0F0'; }}>
                    {option.name}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {OPTIONS.slice(4, 7).map((option) => (
                  <button key={option.id} type="button" onClick={() => handleClick(option)} style={btnStyle}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#FFEDE6'; e.currentTarget.style.borderColor = '#FFE0D6'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#FAFAFA'; e.currentTarget.style.borderColor = '#F0F0F0'; }}>
                    {option.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes cardDrift1 {
          0%, 100% { transform: rotate(2deg) translate(6px, 8px); }
          50% { transform: rotate(3deg) translate(10px, -4px); }
        }
        @keyframes cardDrift2 {
          0%, 100% { transform: rotate(-1.5deg) translate(-5px, -6px); }
          50% { transform: rotate(-2.5deg) translate(-8px, 6px); }
        }
      `}</style>
    </div>
  );
};

export default SubSystemSelection;