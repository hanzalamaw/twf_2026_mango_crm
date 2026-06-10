import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import SubSystemSelectionV2 from './pages/SubSystemSelectionV2';
import MainLayout from './components/layout/MainLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AuthCallback from './pages/AuthCallback';
import Control from './pages/Control';
import AccountingDashboard from './pages/AccountingDashboard';
import AccountingTransactions from './pages/AccountingTransactions';
import AccountingExpenses from './pages/AccountingExpenses';
import PerformanceAdmin from './pages/PerformanceAdmin';
import PerformanceDashboard from './pages/PerformanceDashboard';
import Dashboard from './pages/Dashboard';
import AcceptTerms from './pages/AcceptTerms';
import OrderManagement from './pages/OrderManagement';
import Transactions from './pages/Transactions';
import Expenses from './pages/Expenses';
import NewOrder from './pages/NewOrder';
import BatchManagement from './pages/BatchManagement';
import Stats from './pages/Stats';
import Operations from './pages/Operations';
import OperationsLayout from './pages/OperationsLayout';
import OperationsRiders from './pages/OperationsRiders';
import OperationsDeliveries from './pages/OperationsDeliveries';
import { API_BASE } from './config/api';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) {
    const redirect = encodeURIComponent(location.pathname || '/');
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return children;
};

const RequirePermission = ({ permission, children }) => {
  const { user } = useAuth();
  if (!user?.permissions?.[permission]) return <Navigate to="/" replace />;
  return children;
};

const RequireManager = ({ children }) => {
  const { user } = useAuth();
  if (![3, 5, 7].includes(user?.role_id)) return <Navigate to="/" replace />;
  return children;
};

const STAFF_BOOKINGS_ROLE = 'Staff - Bookings';
const CO_MANAGER_BOOKINGS_ROLE = 'Co-Manager - Bookings';

function bookingDefaultPath(role) {
  if (role === STAFF_BOOKINGS_ROLE) return '/bookings/new-order';
  if (role === CO_MANAGER_BOOKINGS_ROLE) return '/bookings/transactions';
  return '/bookings/dashboard';
}

function isBookingPathAllowedForRole(role, pathname) {
  if (role === STAFF_BOOKINGS_ROLE) {
    return pathname === '/bookings/new-order' || pathname === '/bookings/orders';
  }
  if (role === CO_MANAGER_BOOKINGS_ROLE) {
    return pathname === '/bookings/new-order' || pathname === '/bookings/orders' || pathname === '/bookings/transactions';
  }
  return true;
}

const BookingsIndexRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={bookingDefaultPath(user?.role)} replace />;
};

function hasOperationsShellAccess(permissions) {
  const p = permissions || {};
  return !!(p.operation_management || p.operation_rider_management || p.operation_deliveries_management);
}

const RequireOperationsShell = ({ children }) => {
  const { user } = useAuth();
  if (!hasOperationsShellAccess(user?.permissions)) return <Navigate to="/" replace />;
  return children;
};

const RequireOperationSub = ({ permission, children }) => {
  const { user } = useAuth();
  if (!hasOperationsShellAccess(user?.permissions)) return <Navigate to="/" replace />;
  if (!user?.permissions?.[permission]) return <Navigate to="/operations" replace />;
  return children;
};

const OperationsMainLayout = () => (
  <MainLayout showSidebar={false} systemName="Operations Management" />
);

const RequireBookingRoleAccess = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  if (!isBookingPathAllowedForRole(user?.role, location.pathname)) {
    return <Navigate to={bookingDefaultPath(user?.role)} replace />;
  }
  return children;
};

const TermsOrHome = () => {
  const { user } = useAuth();
  if (user && !user.has_prev_logged_in) return <Navigate to="/accept-terms" replace />;
  return <SubSystemSelectionV2 />;
};

function clearSessionAndRedirectToLogin() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

function AuthFetchInterceptor() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const res = await originalFetch.apply(this, args);
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const isApi = url.includes('/api/');
      const isAuthEndpoint = /\/api\/(login|register|refresh|forgot-password|reset-password|accept-terms)/.test(url);
      if (res.status === 401 && isApi && !isAuthEndpoint) {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) { clearSessionAndRedirectToLogin(); return res; }
        try {
          const refreshRes = await originalFetch(`${API_BASE}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (!refreshRes.ok) { clearSessionAndRedirectToLogin(); return res; }
          const data = await refreshRes.json().catch(() => ({}));
          if (!data?.token) { clearSessionAndRedirectToLogin(); return res; }
          localStorage.setItem('token', data.token);
          return originalFetch(args[0], { ...args[1], headers: { ...(args[1]?.headers || {}), Authorization: `Bearer ${data.token}` } });
        } catch {
          clearSessionAndRedirectToLogin();
        }
      }
      return res;
    };
    return () => { window.fetch = originalFetch; };
  }, [user]);
  return null;
}

const ROUTE_TITLES = {
  '/': 'Select Management',
  '/dashboard': 'Dashboard',
  '/control': 'Control Management',
  '/bookings': 'Booking Management',
  '/bookings/dashboard': 'Dashboard',
  '/bookings/new-order': 'New Order',
  '/bookings/batches': 'Batch Management',
  '/bookings/orders': 'Order Management',
  '/bookings/transactions': 'Transactions',
  '/bookings/expenses': 'Expenses',
  '/operations': 'Operations Management',
  '/operations/riders': 'Rider Management',
  '/operations/deliveries': 'Deliveries Management',
  '/accounting': 'Accounting & Finance',
  '/accounting/dashboard': 'Accounting Dashboard',
  '/accounting/transactions': 'Transactions',
  '/accounting/expenses': 'Expenses',
  '/performance': 'Performance Management',
  '/performance/admin': 'Performance Admin',
  '/performance/dashboard': 'Performance Dashboard',
};

function DocumentTitle() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    const title = ROUTE_TITLES[path] || ROUTE_TITLES[path.replace(/\/$/, '')] || 'Mango CRM';
    document.title = title === 'Mango CRM' ? title : `${title} | Mango CRM`;
  }, [location.pathname]);
  return null;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <DocumentTitle />
        <AuthFetchInterceptor />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/accept-terms" element={<ProtectedRoute><AcceptTerms /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><TermsOrHome /></ProtectedRoute>} />

          <Route path="/dashboard" element={<ProtectedRoute><RequireManager><MainLayout systemName="Dashboard" /></RequireManager></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
          </Route>

          <Route path="/control" element={<ProtectedRoute><RequirePermission permission="control_management"><MainLayout systemName="Control Management" showSidebar={false} /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Control />} />
          </Route>

          <Route path="/bookings" element={<ProtectedRoute><RequirePermission permission="booking_management"><MainLayout systemName="" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<BookingsIndexRedirect />} />
            <Route path="dashboard" element={<RequireBookingRoleAccess><Dashboard /></RequireBookingRoleAccess>} />
            <Route path="new-order" element={<RequireBookingRoleAccess><NewOrder /></RequireBookingRoleAccess>} />
            <Route path="batches" element={<RequireBookingRoleAccess><BatchManagement /></RequireBookingRoleAccess>} />
            <Route path="orders" element={<RequireBookingRoleAccess><OrderManagement /></RequireBookingRoleAccess>} />
            <Route path="transactions" element={<RequireBookingRoleAccess><Transactions /></RequireBookingRoleAccess>} />
            <Route path="expenses" element={<RequireBookingRoleAccess><Expenses /></RequireBookingRoleAccess>} />
          </Route>

          <Route path="/operations" element={<ProtectedRoute><RequireOperationsShell><OperationsMainLayout /></RequireOperationsShell></ProtectedRoute>}>
            <Route element={<OperationsLayout />}>
              <Route index element={<Operations />} />
              <Route path="riders" element={<RequireOperationSub permission="operation_rider_management"><OperationsRiders /></RequireOperationSub>} />
              <Route path="deliveries" element={<RequireOperationSub permission="operation_deliveries_management"><OperationsDeliveries /></RequireOperationSub>} />
            </Route>
          </Route>

          <Route path="/accounting" element={<ProtectedRoute><RequirePermission permission="accounting_and_finance"><MainLayout systemName="Accounting & Finance" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Navigate to="/accounting/dashboard" replace />} />
            <Route path="dashboard" element={<AccountingDashboard />} />
            <Route path="transactions" element={<AccountingTransactions />} />
            <Route path="expenses" element={<AccountingExpenses />} />
          </Route>

          <Route path="/performance" element={<ProtectedRoute><RequirePermission permission="performance_management"><MainLayout systemName="Performance Management" /></RequirePermission></ProtectedRoute>}>
            <Route index element={<Navigate to="/performance/admin" replace />} />
            <Route path="admin" element={<PerformanceAdmin />} />
            <Route path="dashboard" element={<PerformanceDashboard />} />
          </Route>

          <Route path="/stats" element={<ProtectedRoute><Stats /></ProtectedRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
