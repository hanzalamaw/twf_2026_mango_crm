import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { OPERATION_MODULES, countAccessibleOperationModules } from './operationModules';

/**
 * Matches Select Management (/) — same mob-* CSS, gradient hero, Logout only; no pill nav (cards only).
 */
export default function OperationsLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const p = user?.permissions || {};
  const accessibleCount = countAccessibleOperationModules(p);
  const total = OPERATION_MODULES.length;
  const isOverview = location.pathname === '/operations' || location.pathname === '/operations/';
  const isRidersSubtree = location.pathname.startsWith('/operations/riders');
  const isSlaughterSubtree = location.pathname.startsWith('/operations/slaughter');
  const isLineSubtree = location.pathname.startsWith('/operations/line');
  /** Rider admin / slaughter / line use sidebar; supervisor-only keeps this top bar. */
  const hideOpsSubTopbar =
    (isRidersSubtree && !!p.operation_rider_management) || isSlaughterSubtree || isLineSubtree;

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

        .mob-back-link {
          display: inline-block;
          margin-top: 10px;
          font-size: 12px;
          font-weight: 600;
          color: rgba(255,255,255,0.95);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .mob-back-link:hover { color: #fff; }

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

        .mob-grid {
          padding: 16px 24px 32px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          flex: initial;
          align-content: start;
          justify-content: center;
          max-width: 1100px;
          margin: 0 auto;
        }

        @media (min-width: 900px) {
          .mob-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            padding-left: 40px;
            padding-right: 40px;
          }
        }

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

        .mob-count {
          text-align: center;
          padding: 0 16px 28px;
          font-size: 11px; font-weight: 500;
          color: #d1d5db;
          letter-spacing: 0.2px;
        }

        .ops-outlet {
          flex: 1;
          min-height: 0;
        }

        .ops-sub-topbar {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 12px 20px;
          background: #fff;
          border-bottom: 1px solid #E8E8EA;
          position: relative;
          z-index: 2;
        }
        .ops-sub-topbar a {
          font-size: 12px;
          font-weight: 600;
          color: #FF5722;
          text-decoration: none;
        }
        .ops-sub-topbar a:hover {
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .ops-sub-topbar-nav {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .ops-sub-logout {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 7px 13px;
          background: #F3F4F6;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          color: #374151;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
        }
        .ops-sub-logout:hover {
          background: #E5E7EB;
        }
      `}</style>

      <div className="mob-root">
        {isOverview ? (
          <div className="mob-hero" style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.4s ease' }}>
            <div className="mob-hero-top">
              <div className="mob-hero-left">
                <p className="mob-brand">TWF Cattle CRM</p>
                <h1 className="mob-title">Operations Management</h1>
                <p className="mob-subtitle">{accessibleCount} of {total} modules available</p>
                <Link to="/" className="mob-back-link">
                  ← Back to main page
                </Link>
              </div>
              <button type="button" className="mob-logout" onClick={logout}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        ) : hideOpsSubTopbar ? null : (
          <div className="ops-sub-topbar">
            <div className="ops-sub-topbar-nav">
              <Link to="/operations">← Operations modules</Link>
            </div>
            <button type="button" className="ops-sub-logout" onClick={logout}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </div>
        )}

        <div className="ops-outlet">
          <Outlet />
        </div>
      </div>
    </>
  );
}
