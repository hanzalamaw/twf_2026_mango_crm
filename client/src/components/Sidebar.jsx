import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

/* ── Icons ─────────────────────────────────────────────────── */
const DashboardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const ControlIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const BookingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
);
const OperationsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);
const FarmIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3v4"/><path d="M16 3v4"/><rect x="3" y="11" width="18" height="10" rx="1"/>
    <path d="M12 11v10"/><path d="M3 15h18"/>
  </svg>
);
const ProcurementIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const AccountingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    <path d="M7 14h.01M7 18h.01"/>
  </svg>
);
const PerformanceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
  </svg>
);
const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const ChevronIcon = ({ direction = 'right' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: direction === 'left' ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);
const HamburgerIcon = ({ isOpen }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    {isOpen ? (
      <>
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </>
    ) : (
      <>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </>
    )}
  </svg>
);

/* ── Menu Data ──────────────────────────────────────────────── */
const MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard', managersOnly: true },
  { id: 'control', label: 'Control Management', icon: <ControlIcon />, path: '/control', permission: 'control_management' },
  { id: 'bookings', label: 'Bookings Management', icon: <BookingsIcon />, path: '/bookings', permission: 'booking_management' },
  { id: 'operations', label: 'Operations Management', icon: <OperationsIcon />, path: '/operations', permission: 'operation_management' },
  { id: 'farm', label: 'Farm Management', icon: <FarmIcon />, path: '/farm', permission: 'farm_management' },
  { id: 'procurement', label: 'Procurement Management', icon: <ProcurementIcon />, path: '/procurement', permission: 'procurement_management' },
  { id: 'accounting', label: 'Accounting & Finance', icon: <AccountingIcon />, path: '/accounting', permission: 'accounting_and_finance' },
  { id: 'performance', label: 'Performance Management', icon: <PerformanceIcon />, path: '/performance', permission: 'performance_management' },
];

const PERFORMANCE_MENU_ITEMS = [
  { id: 'perf-admin', label: 'Admin', icon: <PerformanceIcon />, path: '/performance/admin', permission: 'performance_management' },
  { id: 'perf-dashboard', label: 'Dashboard', icon: <DashboardIcon />, path: '/performance/dashboard', permission: 'performance_management' },
];

const BOOKING_MENU_ITEMS = [
  { id: 'bm-dashboard', label: 'Dashboard', iconDefault: '/icons/dashboard_default.png', iconActive: '/icons/dashboard_active.png', path: '/bookings/dashboard', permission: 'booking_management' },
  { id: 'bm-new-query', label: 'New Query', iconDefault: '/icons/new_query_default.png', iconActive: '/icons/new_query_active.png', path: '/bookings/new-query', permission: 'booking_management' },
  { id: 'bm-new-order', label: 'New Order', iconDefault: '/icons/new_order_default.png', iconActive: '/icons/new_order_active.png', path: '/bookings/new-order', permission: 'booking_management' },
  { id: 'bm-queries', label: 'Query Management', iconDefault: '/icons/query_management_default.png', iconActive: '/icons/query_management_active.png', path: '/bookings/queries', permission: 'booking_management' },
  { id: 'bm-orders', label: 'Order Management', iconDefault: '/icons/order_management_default.png', iconActive: '/icons/order_management_active.png', path: '/bookings/orders', permission: 'booking_management' },
  { id: 'bm-transactions', label: 'Transactions', iconDefault: '/icons/transactions_default.png', iconActive: '/icons/transactions_active.png', path: '/bookings/transactions', permission: 'booking_management' },
];
const OPERATIONS_MENU_ITEMS = [
  { id: 'op-riders', label: 'Rider Management', iconDefault: '/icons/order_management_default.png', iconActive: '/icons/order_management_active.png', path: '/operations/riders', permissionAny: ['operation_rider_management', 'operation_rider_management_supervisor'] },
  { id: 'op-supervisors', label: 'Supervisor Management', iconDefault: '/icons/query_management_default.png', iconActive: '/icons/query_management_active.png', path: '/operations/riders/supervisors', permission: 'operation_rider_management' },
];

const SLAUGHTER_MENU_ITEMS = [
  { id: 'sl-dashboard', label: 'Dashboard', iconDefault: '/icons/dashboard_default.png', iconActive: '/icons/dashboard_active.png', path: '/operations/slaughter/dashboard', permission: 'operation_slaughter_management' },
  { id: 'sl-management', label: 'Management', iconDefault: '/icons/order_management_default.png', iconActive: '/icons/order_management_active.png', path: '/operations/slaughter/management', permission: 'operation_slaughter_management' },
];

const LINE_MENU_ITEMS = [
  { id: 'ln-dashboard', label: 'Dashboard', iconDefault: '/icons/dashboard_default.png', iconActive: '/icons/dashboard_active.png', path: '/operations/line/dashboard', permission: 'operation_line_management' },
  { id: 'ln-management', label: 'Management', iconDefault: '/icons/order_management_default.png', iconActive: '/icons/order_management_active.png', path: '/operations/line/management', permission: 'operation_line_management' },
];

const STAFF_BOOKINGS_ROLE = 'Staff - Bookings';
const CO_MANAGER_BOOKINGS_ROLE = 'Co-Manager - Bookings';

// ── NEW: Farm Management sub-menu (mirrors Booking pattern) ──
const FARM_MENU_ITEMS = [
  { id: 'fm-dashboard',  label: 'Dashboard',        iconDefault: '/icons/dashboard_default.png',         iconActive: '/icons/dashboard_active.png',         path: '/farm/dashboard',        permission: 'farm_management' },
  { id: 'fm-new-query',  label: 'New Query',         iconDefault: '/icons/new_query_default.png',         iconActive: '/icons/new_query_active.png',         path: '/farm/new-query',        permission: 'farm_management' },
  { id: 'fm-new-order',  label: 'New Order',         iconDefault: '/icons/new_order_default.png',         iconActive: '/icons/new_order_active.png',         path: '/farm/new-order',        permission: 'farm_management' },
  { id: 'fm-queries',    label: 'Query Management',  iconDefault: '/icons/query_management_default.png',  iconActive: '/icons/query_management_active.png',  path: '/farm/query-management', permission: 'farm_management' },
  { id: 'fm-orders',     label: 'Order Management',  iconDefault: '/icons/order_management_default.png',  iconActive: '/icons/order_management_active.png',  path: '/farm/orders',           permission: 'farm_management' },
  { id: 'fm-transactions', label: 'Transactions',    iconDefault: '/icons/transactions_default.png',      iconActive: '/icons/transactions_active.png',      path: '/farm/transactions',     permission: 'farm_management' },
];

// ── NEW: Procurement Management sub-menu ──
const PROCUREMENT_MENU_ITEMS = [
  { id: 'pm-dashboard', label: 'Dashboard', iconDefault: '/icons/dashboard_default.png', iconActive: '/icons/dashboard_active.png', path: '/procurement/dashboard', permission: 'procurement_management' },
  { id: 'pm-new', label: 'New Procurement', iconDefault: '/icons/new_order_default.png', iconActive: '/icons/new_order_active.png', path: '/procurement/new-procurement', permission: 'procurement_management' },
  { id: 'pm-manage', label: 'Procurement Management', iconDefault: '/icons/order_management_default.png', iconActive: '/icons/order_management_active.png', path: '/procurement/manage', permission: 'procurement_management' },
  { id: 'pm-transactions', label: 'Transactions', iconDefault: '/icons/transactions_default.png', iconActive: '/icons/transactions_active.png', path: '/procurement/transactions', permission: 'procurement_management' },
  { id: 'pm-expenses', label: 'Expenses', iconDefault: '/icons/expenses_default.png', iconActive: '/icons/expenses_active.png', path: '/procurement/expenses', permission: 'procurement_management' },
];

const ACCOUNTING_MENU_ITEMS = [
  { id: 'acc-dashboard', label: 'Dashboard', iconDefault: '/icons/dashboard_default.png', iconActive: '/icons/dashboard_active.png', path: '/accounting/dashboard', permission: 'accounting_and_finance' },
  { id: 'acc-expenses', label: 'Expenses', iconDefault: '/icons/expenses_default.png', iconActive: '/icons/expenses_active.png', path: '/accounting/expenses', permission: 'accounting_and_finance' },
];

const SIDEBAR_EXPANDED_KEY = 'cattle_crm_sidebar_expanded';

function readSidebarExpanded() {
  try {
    return sessionStorage.getItem(SIDEBAR_EXPANDED_KEY) === '1';
  } catch {
    return false;
  }
}

/* ── Component ──────────────────────────────────────────────── */
function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(readSidebarExpanded);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const drawerRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const permissions = user?.permissions || {};
  const roleId = user?.role_id;
  const isManager = [3, 5, 7].includes(roleId);
  const isBookingContext = location.pathname.startsWith('/bookings');
  const isSlaughterContext = location.pathname.startsWith('/operations/slaughter');
  const isLineContext = location.pathname.startsWith('/operations/line');
  const isOperationsContext = location.pathname.startsWith('/operations') && !isSlaughterContext && !isLineContext;
  const isOperationsRidersContext = location.pathname.startsWith('/operations/riders');
  const isOperationsSubmoduleBack = isOperationsRidersContext || isSlaughterContext || isLineContext;
  /** Supervisor-only rider screen keeps compact header; rider admin / manager gets avatar + logout. */
  const minimalRiderSidebarChrome =
    isOperationsRidersContext && !permissions.operation_rider_management;
  const isPerformanceContext = location.pathname.startsWith('/performance');
  const isFarmContext = location.pathname.startsWith('/farm');
  const isProcurementContext = location.pathname.startsWith('/procurement');
  const isAccountingContext = location.pathname.startsWith('/accounting');
  const isAdminOrManager = [1, 2, 3, 5, 7].includes(roleId);
  const roleName = user?.role;

  const moduleSidebarChrome =
    location.pathname === '/dashboard' ||
    /^\/(bookings|operations|farm|procurement|accounting|performance)(\/|$)/.test(location.pathname);

  const items = isBookingContext
    ? BOOKING_MENU_ITEMS
    : isSlaughterContext
    ? SLAUGHTER_MENU_ITEMS
    : isLineContext
    ? LINE_MENU_ITEMS
    : isOperationsContext
    ? OPERATIONS_MENU_ITEMS
    : isPerformanceContext
    ? PERFORMANCE_MENU_ITEMS
    : isFarmContext
    ? FARM_MENU_ITEMS
    : isProcurementContext
    ? PROCUREMENT_MENU_ITEMS
    : isAccountingContext
    ? ACCOUNTING_MENU_ITEMS
    : MENU_ITEMS;

  const roleVisibleItems = isBookingContext && roleName === STAFF_BOOKINGS_ROLE
    ? items.filter((item) => ['/bookings/new-query', '/bookings/queries'].includes(item.path))
    : isBookingContext && roleName === CO_MANAGER_BOOKINGS_ROLE
    ? items.filter((item) => ['/bookings/new-query', '/bookings/queries', '/bookings/transactions'].includes(item.path))
    : items;

  const visibleItems = roleVisibleItems.filter((item) => {
    if (item.managersOnly) return (isBookingContext || isFarmContext) ? isAdminOrManager : isManager;
    if (item.permissionAny?.length) return item.permissionAny.some((perm) => !!permissions[perm]);
    if (item.permission) return !!permissions[item.permission];
    return true;
  });

  // Auto-redirect to /farm/dashboard when entering /farm exactly
  useEffect(() => {
    if (location.pathname === '/farm') {
      navigate('/farm/dashboard', { replace: true });
    }
  }, [location.pathname, navigate]);

  // Auto-redirect to /procurement/dashboard when entering /procurement exactly
  useEffect(() => {
    if (location.pathname === '/procurement') {
      navigate('/procurement/dashboard', { replace: true });
    }
  }, [location.pathname, navigate]);

  const isActive = (path) => {
    if (path === '/operations/riders') {
      return location.pathname === '/operations/riders';
    }
    if (path === '/operations/riders/supervisors') {
      return location.pathname === '/operations/riders/supervisors';
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleNavigate = (path) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close drawer on outside tap
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [mobileOpen]);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = mobileOpen ? 'hidden' : '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen, isMobile]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SIDEBAR_EXPANDED_KEY, isExpanded ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [isExpanded]);

  const sectionLabel = isBookingContext
    ? 'BOOKING MANAGEMENT'
    : isSlaughterContext
    ? 'SLAUGHTER MANAGEMENT'
    : isLineContext
    ? 'LINE MANAGEMENT'
    : isOperationsContext
    ? 'OPERATIONS MANAGEMENT'
    : isPerformanceContext
    ? 'PERFORMANCE'
    : isFarmContext
    ? 'FARM MANAGEMENT'
    : isProcurementContext
    ? 'PROCUREMENT MANAGEMENT'
    : isAccountingContext
    ? 'ACCOUNTING & FINANCE'
    : 'MANAGEMENT';

  /* ── Mobile Layout ── */
  if (isMobile) {
    return (
      <>
        {/* Floating Hamburger Button */}
        {!mobileOpen && (
          <button
            className="mobile-fab"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <HamburgerIcon isOpen={false} />
          </button>
        )}

        {/* Overlay */}
        <div className={`mobile-overlay ${mobileOpen ? 'visible' : ''}`} onClick={() => setMobileOpen(false)} />

        {/* Drawer */}
        <aside ref={drawerRef} className={`mobile-drawer ${mobileOpen ? 'open' : ''}`}>
          {/* Drawer Header */}
          <div className={`drawer-header${minimalRiderSidebarChrome ? ' drawer-header--rider-minimal' : ''}`}>
            {!minimalRiderSidebarChrome && (
              <div className="drawer-profile">
                <div className="drawer-avatar">
                  <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face" alt="Profile" />
                </div>
                <div className="drawer-user-info">
                  <span className="drawer-role">{user?.role || 'USER'}</span>
                  <span className="drawer-name">{user?.username || 'User'}</span>
                </div>
              </div>
            )}
            <button className="drawer-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <HamburgerIcon isOpen={true} />
            </button>
          </div>

          {/* Section Label */}
          <div className="drawer-section-label">{sectionLabel}</div>

          {/* Nav Items */}
          <nav className="drawer-nav">
            <ul className="drawer-nav-list">
              {visibleItems.map((item, idx) => (
                <li key={item.id} className={`drawer-nav-item ${isActive(item.path) ? 'active' : ''}`}
                  style={{ animationDelay: `${idx * 40}ms` }}>
                  <button
                    type="button"
                    className={`drawer-nav-link ${isActive(item.path) ? 'active' : ''}`}
                    onClick={() => handleNavigate(item.path)}
                  >
                    <span className="drawer-nav-icon">
                      {item.iconDefault ? (
                        <img src={isActive(item.path) ? item.iconActive : item.iconDefault} alt="" style={{ width: '20px', height: '20px' }} />
                      ) : item.icon}
                    </span>
                    <span className="drawer-nav-label">{item.label}</span>
                    {isActive(item.path) && <span className="drawer-active-dot" />}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Drawer Footer */}
          <div className="drawer-footer">
            <button
              type="button"
              className="drawer-back-btn"
              onClick={() => handleNavigate(isOperationsSubmoduleBack ? '/operations' : '/')}
            >
              <img src="/icons/select_system.png" alt="" style={{ width: '20px', height: '20px' }} />
              <span>{isOperationsSubmoduleBack ? 'Select Operation' : 'Select Management'}</span>
            </button>
            <button type="button" className="drawer-logout-btn" onClick={handleLogout}>
              <LogoutIcon />
              <span>Logout</span>
            </button>
          </div>
        </aside>
      </>
    );
  }

  /* ── Desktop Layout (original sidebar) ── */
  return (
    <aside className={`sidebar ${isExpanded ? 'expanded' : 'collapsed'}${moduleSidebarChrome ? ' sidebar--module' : ''}`}>
      {minimalRiderSidebarChrome ? (
        <div className="sidebar-profile sidebar-profile--rider-minimal">
          <button type="button" className="toggle-btn" onClick={() => setIsExpanded(!isExpanded)} aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}>
            <ChevronIcon direction={isExpanded ? 'left' : 'right'} />
          </button>
        </div>
      ) : (
        <div className="sidebar-profile">
          <div className="profile-avatar">
            <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face" alt="Profile" />
          </div>
          {isExpanded && (
            <div className="profile-info">
              <span className="profile-role">{user?.role || 'USER'}</span>
              <span className="profile-name">{user?.username || 'User'}</span>
              <button type="button" className="logout-btn" onClick={handleLogout}>
                <LogoutIcon />
                <span>Logout</span>
              </button>
            </div>
          )}
          {!isExpanded && (
            <button type="button" className="logout-btn-collapsed" onClick={handleLogout} title="Logout">
              <LogoutIcon />
            </button>
          )}
          <button type="button" className="toggle-btn" onClick={() => setIsExpanded(!isExpanded)} aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}>
            <ChevronIcon direction={isExpanded ? 'left' : 'right'} />
          </button>
        </div>
      )}

      <nav className="sidebar-nav">
        <span className="nav-section-label">{isExpanded ? sectionLabel : ''}</span>
        <ul className="nav-list">
          {visibleItems.map((item) => (
            <li key={item.id} className={`nav-item ${isActive(item.path) ? 'active' : ''}`}>
              <button
                type="button"
                className={`nav-link ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <span className="nav-icon nav-icon-main">
                  {item.iconDefault ? (
                    <img src={isActive(item.path) ? item.iconActive : item.iconDefault} alt="" style={{ width: '20px', height: '20px', display: 'block' }} />
                  ) : item.icon ? item.icon : null}
                </span>
                {isExpanded && <span className="nav-label">{item.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-bottom">
        <button
          type="button"
          className="nav-link sidebar-back-btn"
          onClick={() => navigate(isOperationsSubmoduleBack ? '/operations' : '/')}
          title={isOperationsSubmoduleBack ? 'Back to operation modules' : 'Back to Select Management'}
        >
          <span className="nav-icon nav-icon-main">
            <img src="/icons/select_system.png" alt="" style={{ width: '20px', height: '20px', display: 'block' }} />
          </span>
          {isExpanded && <span className="nav-label">{isOperationsSubmoduleBack ? 'Select Operation' : 'Select Management'}</span>}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;