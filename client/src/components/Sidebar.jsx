import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

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
const OperationsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
);
const BookingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
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
    {isOpen ? (<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>) : (<><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>)}
  </svg>
);

const MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard', managersOnly: true },
  { id: 'control', label: 'Control Management', icon: <ControlIcon />, path: '/control', permission: 'control_management' },
  { id: 'bookings', label: 'Bookings Management', icon: <BookingsIcon />, path: '/bookings', permission: 'booking_management' },
  { id: 'operations', label: 'Operations Management', icon: <OperationsIcon />, path: '/operations', permission: 'operation_management' },
  { id: 'accounting', label: 'Accounting & Finance', icon: <AccountingIcon />, path: '/accounting', permission: 'accounting_and_finance' },
  { id: 'performance', label: 'Performance Management', icon: <PerformanceIcon />, path: '/performance', permission: 'performance_management' },
];

const PERFORMANCE_MENU_ITEMS = [
  { id: 'perf-admin', label: 'Admin', icon: <PerformanceIcon />, path: '/performance/admin', permission: 'performance_management' },
  { id: 'perf-dashboard', label: 'Dashboard', icon: <DashboardIcon />, path: '/performance/dashboard', permission: 'performance_management' },
];

const BOOKING_MENU_ITEMS = [
  { id: 'bm-dashboard', label: 'Dashboard', iconDefault: '/icons/dashboard_default.png', iconActive: '/icons/dashboard_active.png', path: '/bookings/dashboard', permission: 'booking_management' },
  { id: 'bm-new-order', label: 'New Order', iconDefault: '/icons/new_order_default.png', iconActive: '/icons/new_order_active.png', path: '/bookings/new-order', permission: 'booking_management' },
  { id: 'bm-orders', label: 'Order Management', iconDefault: '/icons/order_management_default.png', iconActive: '/icons/order_management_active.png', path: '/bookings/orders', permission: 'booking_management' },
  { id: 'bm-transactions', label: 'Transactions', iconDefault: '/icons/transactions_default.png', iconActive: '/icons/transactions_active.png', path: '/bookings/transactions', permission: 'booking_management' },
  { id: 'bm-batches', label: 'Batch Management', iconDefault: '/icons/batch_management_default.png', iconActive: '/icons/batch_management_active.png', path: '/bookings/batches', permission: 'booking_management', managersOnly: true },
];

const OPERATIONS_MENU_ITEMS = [
  { id: 'op-riders', label: 'Rider Management', icon: <OperationsIcon />, path: '/operations/riders', permission: 'operation_rider_management' },
  { id: 'op-deliveries', label: 'Deliveries Management', icon: <OperationsIcon />, path: '/operations/deliveries', permission: 'operation_deliveries_management' },
];

const ACCOUNTING_MENU_ITEMS = [
  { id: 'acc-dashboard', label: 'Dashboard', iconDefault: '/icons/dashboard_default.png', iconActive: '/icons/dashboard_active.png', path: '/accounting/dashboard', permission: 'accounting_and_finance' },
  { id: 'acc-expenses', label: 'Expenses', iconDefault: '/icons/expenses_default.png', iconActive: '/icons/expenses_active.png', path: '/accounting/expenses', permission: 'accounting_and_finance' },
];

const DEFAULT_PROFILE_IMAGE = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face';

const STAFF_BOOKINGS_ROLE = 'Staff - Bookings';
const CO_MANAGER_BOOKINGS_ROLE = 'Co-Manager - Bookings';
const SIDEBAR_EXPANDED_KEY = 'mango_crm_sidebar_expanded';

function readSidebarExpanded() {
  try { return sessionStorage.getItem(SIDEBAR_EXPANDED_KEY) === '1'; } catch { return false; }
}

function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(readSidebarExpanded);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const drawerRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const permissions = user?.permissions || {};
  const roleId = user?.role_id;
  const isManager = [3, 5, 7].includes(roleId);
  const isBookingContext = location.pathname.startsWith('/bookings');
  const isOperationsContext = location.pathname.startsWith('/operations');
  const isPerformanceContext = location.pathname.startsWith('/performance');
  const isAccountingContext = location.pathname.startsWith('/accounting');
  const isAdminOrManager = [1, 2, 3, 5, 7].includes(roleId);
  const roleName = user?.role;

  const moduleSidebarChrome = location.pathname === '/dashboard' || /^\/(bookings|operations|accounting|performance)(\/|$)/.test(location.pathname);

  const items = isBookingContext ? BOOKING_MENU_ITEMS
    : isOperationsContext ? OPERATIONS_MENU_ITEMS
    : isPerformanceContext ? PERFORMANCE_MENU_ITEMS
    : isAccountingContext ? ACCOUNTING_MENU_ITEMS
    : MENU_ITEMS;

  const roleVisibleItems = isBookingContext && roleName === STAFF_BOOKINGS_ROLE
    ? items.filter((item) => ['/bookings/new-order', '/bookings/orders'].includes(item.path))
    : isBookingContext && roleName === CO_MANAGER_BOOKINGS_ROLE
    ? items.filter((item) => ['/bookings/new-order', '/bookings/orders', '/bookings/transactions'].includes(item.path))
    : items;

  const visibleItems = roleVisibleItems.filter((item) => {
    if (item.managersOnly) return isBookingContext ? isAdminOrManager : isManager;
    if (item.permissionAny?.length) return item.permissionAny.some((perm) => !!permissions[perm]);
    if (item.permission) return !!permissions[item.permission];
    return true;
  });

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');
  const handleLogout = () => { logout(); navigate('/login'); };
  const handleNavigate = (path) => { navigate(path); if (isMobile) setMobileOpen(false); };

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e) => { if (drawerRef.current && !drawerRef.current.contains(e.target)) setMobileOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [mobileOpen]);

  useEffect(() => {
    if (isMobile) document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen, isMobile]);

  useEffect(() => {
    try { sessionStorage.setItem(SIDEBAR_EXPANDED_KEY, isExpanded ? '1' : '0'); } catch { /* ignore */ }
  }, [isExpanded]);

  const sectionLabel = isBookingContext ? 'BOOKING MANAGEMENT'
    : isPerformanceContext ? 'PERFORMANCE'
    : isAccountingContext ? 'ACCOUNTING & FINANCE'
    : 'MANAGEMENT';

  if (isMobile) {
    return (
      <>
        {!mobileOpen && (
          <button className="mobile-fab" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <HamburgerIcon isOpen={false} />
          </button>
        )}
        <div className={`mobile-overlay ${mobileOpen ? 'visible' : ''}`} onClick={() => setMobileOpen(false)} />
        <aside ref={drawerRef} className={`mobile-drawer ${mobileOpen ? 'open' : ''}`}>
          <div className="drawer-header">
            <div className="drawer-profile">
              <div className="drawer-avatar">
                <img src={DEFAULT_PROFILE_IMAGE} alt="Profile" />
              </div>
              <div className="drawer-user-info">
                <span className="drawer-role">{user?.role || 'USER'}</span>
                <span className="drawer-name">{user?.username || 'User'}</span>
              </div>
            </div>
            <button className="drawer-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <HamburgerIcon isOpen={true} />
            </button>
          </div>
          <div className="drawer-section-label">{sectionLabel}</div>
          <nav className="drawer-nav">
            <ul className="drawer-nav-list">
              {visibleItems.map((item, idx) => (
                <li key={item.id} className={`drawer-nav-item ${isActive(item.path) ? 'active' : ''}`} style={{ animationDelay: `${idx * 40}ms` }}>
                  <button type="button" className={`drawer-nav-link ${isActive(item.path) ? 'active' : ''}`} onClick={() => handleNavigate(item.path)}>
                    <span className="drawer-nav-icon">
                      {item.iconDefault ? <img src={isActive(item.path) ? item.iconActive : item.iconDefault} alt="" style={{ width: '20px', height: '20px' }} /> : item.icon}
                    </span>
                    <span className="drawer-nav-label">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="drawer-footer">
            <button type="button" className="drawer-back-btn" onClick={() => handleNavigate('/')}>
              <img src="/icons/select_system.png" alt="" style={{ width: '20px', height: '20px' }} />
              <span>Select Management</span>
            </button>
            <button type="button" className="drawer-logout-btn" onClick={handleLogout}><LogoutIcon /><span>Logout</span></button>
          </div>
        </aside>
      </>
    );
  }

  return (
    <aside className={`sidebar ${isExpanded ? 'expanded' : 'collapsed'}${moduleSidebarChrome ? ' sidebar--module' : ''}`}>
      <div className="sidebar-profile">
        <div className="profile-avatar">
          <img src={DEFAULT_PROFILE_IMAGE} alt="Profile" />
        </div>
        {isExpanded && (
          <div className="profile-info">
            <span className="profile-role">{user?.role || 'USER'}</span>
            <span className="profile-name">{user?.username || 'User'}</span>
            <button type="button" className="logout-btn" onClick={handleLogout}><LogoutIcon /><span>Logout</span></button>
          </div>
        )}
        {!isExpanded && (
          <button type="button" className="logout-btn-collapsed" onClick={handleLogout} title="Logout"><LogoutIcon /></button>
        )}
        <button type="button" className="toggle-btn" onClick={() => setIsExpanded(!isExpanded)} aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}>
          <ChevronIcon direction={isExpanded ? 'left' : 'right'} />
        </button>
      </div>
      <nav className="sidebar-nav">
        <span className="nav-section-label">{isExpanded ? sectionLabel : ''}</span>
        <ul className="nav-list">
          {visibleItems.map((item) => (
            <li key={item.id} className={`nav-item ${isActive(item.path) ? 'active' : ''}`}>
              <button type="button" className={`nav-link ${isActive(item.path) ? 'active' : ''}`} onClick={() => navigate(item.path)}>
                <span className="nav-icon nav-icon-main">
                  {item.iconDefault ? <img src={isActive(item.path) ? item.iconActive : item.iconDefault} alt="" style={{ width: '20px', height: '20px', display: 'block' }} /> : item.icon}
                </span>
                {isExpanded && <span className="nav-label">{item.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className="nav-link sidebar-back-btn" onClick={() => navigate('/')} title="Back to Select Management">
          <span className="nav-icon nav-icon-main">
            <img src="/icons/select_system.png" alt="" style={{ width: '20px', height: '20px', display: 'block' }} />
          </span>
          {isExpanded && <span className="nav-label">Select Management</span>}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
