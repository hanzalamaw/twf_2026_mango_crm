import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';
import { useNavigate, Link } from 'react-router-dom';

// Modal Component - defined outside to prevent recreation on each render
const Modal = ({ show, onClose, children, title, hasAnimated, maxWidth = '550px' }) => {
  if (!show) return null;

  return (
    <div
      className="ctrl-modal-wrap"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: !hasAnimated ? 'fadeIn 0.2s ease-out' : 'none',
        opacity: 1
      }}
      onClick={onClose}
    >
      <div
        className="ctrl-modal-box"
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          padding: '16px',
          maxWidth: maxWidth,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          animation: !hasAnimated ? 'slideUp 0.3s ease-out' : 'none',
          position: 'relative',
          transform: 'translateY(0)',
          opacity: 1
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="ctrl-drag-handle" style={{ display: 'none', width: '40px', height: '4px', background: '#e0e0e0', borderRadius: '2px', margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              color: '#888',
              cursor: 'pointer',
              padding: '0',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#F5F5F5';
              e.target.style.color = '#333';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'none';
              e.target.style.color = '#888';
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Control = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showAuditDetailModal, setShowAuditDetailModal] = useState(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const userModalMounted = useRef(false);
  const roleModalMounted = useRef(false);
  const auditModalMounted = useRef(false);
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [userFormData, setUserFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    role_id: '',
    status: 'active'
  });
  const [roleFormData, setRoleFormData] = useState({
    role_name: '',
    control_management: false,
    booking_management: false,
    operation_management: false,
    operation_general_dashboard: false,
    operation_customer_support: false,
    operation_rider_management: false,
    operation_rider_management_supervisor: false,
    operation_deliveries_management: false,
    operation_challan_management: false,
    operation_affluent_management: false,
    operation_special_request_management: false,
    operation_slaughter_management: false,
    operation_line_management: false,
    farm_management: false,
    procurement_management: false,
    accounting_and_finance: false,
    performance_management: false
  });

  const emptyRoleForm = () => ({
    role_name: '',
    control_management: false,
    booking_management: false,
    operation_management: false,
    operation_general_dashboard: false,
    operation_customer_support: false,
    operation_rider_management: false,
    operation_rider_management_supervisor: false,
    operation_deliveries_management: false,
    operation_challan_management: false,
    operation_affluent_management: false,
    operation_special_request_management: false,
    operation_slaughter_management: false,
    operation_line_management: false,
    farm_management: false,
    procurement_management: false,
    accounting_and_finance: false,
    performance_management: false
  });

  const getToken = () => localStorage.getItem('token');

  const handleApiResponse = async (response) => {
    if (response.status === 401) {
      const data = await response.json();
      if (data.message === 'Session has been terminated' || data.message === 'Session has expired') {
        logout();
        navigate('/login');
        alert('Your session has been terminated. Please log in again.');
        return null;
      }
      throw new Error(data.message || 'Unauthorized');
    }
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Request failed');
    }
    return await response.json();
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/control/users`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) setUsers(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/control/roles`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) setRoles(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch roles');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/control/audit-logs?limit=50`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) setAuditLogs(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/control/sessions`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) setSessions(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'roles') fetchRoles();
    if (activeTab === 'audit') fetchAuditLogs();
    if (activeTab === 'sessions') fetchSessions();
    if (activeTab === 'dashboard') {
      fetchUsers();
      fetchRoles();
      fetchAuditLogs();
      fetchSessions();
    }
  }, [activeTab]);

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const url = editingUser
        ? `${API_BASE}/control/users/${editingUser.user_id}`
        : `${API_BASE}/control/users`;
      const method = editingUser ? 'PUT' : 'POST';
      const body = { ...userFormData };
      if (!editingUser && !body.password) { setError('Password is required for new users'); return; }
      if (editingUser && !body.password) delete body.password;
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(body)
      });
      const data = await handleApiResponse(response);
      if (data) {
        setSuccess(data.message || 'User saved successfully');
        setShowUserModal(false);
        setEditingUser(null);
        setUserFormData({ username: '', email: '', password: '', first_name: '', last_name: '', phone: '', role_id: '', status: 'active' });
        fetchUsers();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.message || 'Failed to save user');
      }
    } catch (err) {
      setError('Failed to save user');
    }
  };

  const handleRoleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const url = editingRole
        ? `${API_BASE}/control/roles/${editingRole.role_id}`
        : `${API_BASE}/control/roles`;
      const method = editingRole ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(roleFormData)
      });
      const data = await handleApiResponse(response);
      if (data) {
        setSuccess(data.message || 'Role saved successfully');
        setShowRoleModal(false);
        setEditingRole(null);
        setRoleFormData(emptyRoleForm());
        fetchRoles();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.message || 'Failed to save role');
      }
    } catch (err) {
      setError('Failed to save role');
    }
  };

  const openUserModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setShowUserPassword(false);
      setUserFormData({ username: user.username, email: user.email, password: '', first_name: user.first_name || '', last_name: user.last_name || '', phone: user.phone || '', role_id: user.role_id, status: user.status });
    } else {
      setEditingUser(null);
      setShowUserPassword(false);
      setUserFormData({ username: '', email: '', password: '', first_name: '', last_name: '', phone: '', role_id: '', status: 'active' });
    }
    if (!showUserModal) userModalMounted.current = false;
    setShowUserModal(true);
  };

  useEffect(() => {
    if (showUserModal) {
      const timer = setTimeout(() => { userModalMounted.current = true; }, 350);
      return () => clearTimeout(timer);
    } else {
      userModalMounted.current = false;
    }
  }, [showUserModal]);

  const openRoleModal = (role = null) => {
    if (role) {
      setEditingRole(role);
      setRoleFormData({
        role_name: role.role_name,
        control_management: role.control_management || false,
        booking_management: role.booking_management || false,
        operation_management: role.operation_management || false,
        operation_general_dashboard: role.operation_general_dashboard || false,
        operation_customer_support: role.operation_customer_support || false,
        operation_rider_management: role.operation_rider_management || false,
        operation_rider_management_supervisor: role.operation_rider_management_supervisor || false,
        operation_deliveries_management: role.operation_deliveries_management || false,
        operation_challan_management: role.operation_challan_management || false,
        operation_affluent_management: role.operation_affluent_management || false,
        operation_special_request_management: role.operation_special_request_management || false,
        operation_slaughter_management: role.operation_slaughter_management || false,
        operation_line_management: role.operation_line_management || false,
        farm_management: role.farm_management || false,
        procurement_management: role.procurement_management || false,
        accounting_and_finance: role.accounting_and_finance || false,
        performance_management: role.performance_management || false
      });
    } else {
      setEditingRole(null);
      setRoleFormData(emptyRoleForm());
    }
    if (!showRoleModal) roleModalMounted.current = false;
    setShowRoleModal(true);
  };

  useEffect(() => {
    if (showRoleModal) {
      const timer = setTimeout(() => { roleModalMounted.current = true; }, 350);
      return () => clearTimeout(timer);
    } else {
      roleModalMounted.current = false;
    }
  }, [showRoleModal]);

  useEffect(() => {
    if (showAuditDetailModal) {
      const timer = setTimeout(() => { auditModalMounted.current = true; }, 350);
      return () => clearTimeout(timer);
    } else {
      auditModalMounted.current = false;
    }
  }, [showAuditDetailModal]);

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      const response = await fetch(`${API_BASE}/control/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) { setSuccess(data.message); fetchUsers(); setTimeout(() => setSuccess(''), 3000); }
      else setError(data.message);
    } catch (err) {
      setError('Failed to delete user');
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Are you sure you want to delete this role?')) return;
    try {
      const response = await fetch(`${API_BASE}/control/roles/${roleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) { setSuccess(data.message); fetchRoles(); setTimeout(() => setSuccess(''), 3000); }
      else setError(data.message);
    } catch (err) {
      setError('Failed to delete role');
    }
  };

  const handleTerminateSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to terminate this session?')) return;
    try {
      const response = await fetch(`${API_BASE}/control/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await handleApiResponse(response);
      if (data) { setSuccess(data.message); fetchSessions(); setTimeout(() => setSuccess(''), 3000); }
      else setError(data.message);
    } catch (err) {
      setError('Failed to terminate session');
    }
  };

  // ── Shared input style helper ──
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #E0E0E0',
    fontSize: '10px',
    outline: 'none',
    background: '#FAFAFA',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s'
  };

  // Shared table styles
  const tableWrapStyle = {
    background: '#FFFFFF',
    borderRadius: '10px',
    padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    overflowX: 'auto',
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '11px',
    whiteSpace: 'nowrap',
  };

  const thStyle = {
    textAlign: 'left',
    padding: '10px',
    fontSize: '11px',
    fontWeight: '600',
    color: '#666',
    borderBottom: '2px solid #E0E0E0',
    whiteSpace: 'nowrap',
  };

  const tdStyle = {
    padding: '10px',
    fontSize: '11px',
    whiteSpace: 'nowrap',
  };

  // Dashboard View
  const renderDashboard = () => {
    const activeUsers = users.filter(u => u.status === 'active').length;
    const totalRoles = roles.length;
    const recentLogs = auditLogs.slice(0, 5);
    const activeSessionsCount = sessions.length;

    return (
      <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box', margin: 0 }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 className="ctrl-page-title" style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: '#333', marginBottom: '6px' }}>
            Control Management Dashboard
          </h1>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>Overview of system users, roles, and activities</p>
        </div>

        {/* Stats Cards */}
        <div className="ctrl-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          {[
            { label: 'Total Users', value: users.length, sub: `${activeUsers} active`, color: '#1976D2' },
            { label: 'Total Roles', value: totalRoles, sub: 'System roles', color: '#4CAF50' },
            { label: 'Active Sessions', value: activeSessionsCount, sub: 'Currently logged in', color: '#FF9800' },
            { label: 'Audit Logs', value: auditLogs.length, sub: 'Recent activities', color: '#9C27B0' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{ background: '#FFFFFF', borderRadius: '10px', padding: '8px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: `4px solid ${color}`, transition: 'transform 0.2s, box-shadow 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
            >
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px', fontWeight: '500' }}>{label}</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color }}>{value}</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Quick Actions + Recent Activity */}
        <div className="ctrl-dashboard-bottom" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: '600', marginTop: 0, marginBottom: '12px' }}>Quick Actions</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={() => { openUserModal(); setActiveTab('users'); }} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#1976D2', color: '#FFFFFF', cursor: 'pointer', fontSize: '10px', fontWeight: '500' }}
                onMouseEnter={(e) => e.target.style.background = '#1565C0'} onMouseLeave={(e) => e.target.style.background = '#1976D2'}>+ Add User</button>
              <button onClick={() => { openRoleModal(); setActiveTab('roles'); }} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#4CAF50', color: '#FFFFFF', cursor: 'pointer', fontSize: '10px', fontWeight: '500' }}
                onMouseEnter={(e) => e.target.style.background = '#388E3C'} onMouseLeave={(e) => e.target.style.background = '#4CAF50'}>+ Add Role</button>
              <button onClick={() => setActiveTab('users')} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #E0E0E0', background: '#FFFFFF', color: '#333', cursor: 'pointer', fontSize: '10px', fontWeight: '500' }}
                onMouseEnter={(e) => e.target.style.background = '#F5F5F5'} onMouseLeave={(e) => e.target.style.background = '#FFFFFF'}>Manage Users</button>
            </div>
          </div>

          <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: '600', marginTop: 0, marginBottom: '12px' }}>Recent Activity</h3>
            <div style={{ maxHeight: '160px', overflow: 'auto' }}>
              {recentLogs.length > 0 ? recentLogs.map(log => (
                <div key={log.log_id} style={{ padding: '8px 0', borderBottom: '1px solid #F0F0F0', fontSize: '11px' }}>
                  <div style={{ color: '#333', fontWeight: '500' }}>{log.action}</div>
                  <div style={{ color: '#888', fontSize: '10px' }}>{log.username} • {new Date(log.created_at).toLocaleString()}</div>
                </div>
              )) : <div style={{ color: '#888', fontSize: '11px' }}>No recent activity</div>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // User Management View
  const renderUsers = () => (
    <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box', margin: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 className="ctrl-page-title" style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: '#333', marginBottom: '4px' }}>User Management</h1>
          <p className="ctrl-page-sub" style={{ fontSize: '12px', color: '#666', margin: 0 }}>Manage system users and their access</p>
        </div>
        <button onClick={() => openUserModal()} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#1976D2', color: '#FFFFFF', cursor: 'pointer', fontSize: '10px', fontWeight: '500', boxShadow: '0 2px 4px rgba(25,118,210,0.3)' }}
          onMouseEnter={(e) => { e.target.style.background = '#1565C0'; e.target.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.target.style.background = '#1976D2'; e.target.style.transform = 'translateY(0)'; }}>
          + Add User
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '12px' }}>Loading...</div>
      ) : (
        /* Single scrollable table — shown on both desktop and mobile */
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                {['Username', 'Email', 'Name', 'Role', 'Status', 'Actions'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id} style={{ borderBottom: '1px solid #F0F0F0', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F9F9F9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td style={tdStyle}>{u.username}</td>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>{u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : '-'}</td>
                  <td style={tdStyle}>{u.role_name}</td>
                  <td style={tdStyle}>
                    <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', background: u.status === 'active' ? '#E8F5E9' : u.status === 'suspended' ? '#FFEBEE' : '#F5F5F5', color: u.status === 'active' ? '#2E7D32' : u.status === 'suspended' ? '#C62828' : '#666' }}>{u.status}</span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => openUserModal(u)} style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid #E0E0E0', background: '#FFFFFF', color: '#1976D2', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                        onMouseEnter={(e) => { e.target.style.background = '#E3F2FD'; e.target.style.borderColor = '#1976D2'; }}
                        onMouseLeave={(e) => { e.target.style.background = '#FFFFFF'; e.target.style.borderColor = '#E0E0E0'; }}>Edit</button>
                      <button onClick={() => handleDeleteUser(u.user_id)} style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid #E0E0E0', background: '#FFFFFF', color: '#C62828', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                        onMouseEnter={(e) => { e.target.style.background = '#FFEBEE'; e.target.style.borderColor = '#C62828'; }}
                        onMouseLeave={(e) => { e.target.style.background = '#FFFFFF'; e.target.style.borderColor = '#E0E0E0'; }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const TAB_LABELS = { dashboard: 'Dashboard', users: 'Users', roles: 'Roles', audit: 'Audit Logs', sessions: 'Sessions' };

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", width: '100%', maxWidth: '100%', minHeight: '100vh', background: '#F5F5F5', margin: 0, padding: 0, boxSizing: 'border-box' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 767px) {
          /* Tab bar — show on mobile too, allow horizontal scroll */
          .ctrl-tab-bar               { display: flex !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; scrollbar-width: none !important; }
          .ctrl-tab-bar::-webkit-scrollbar { display: none !important; }

          /* Bottom nav — keep as-is (not touched) */

          /* Page headings */
          .ctrl-page-title            {
            min-height: 55px !important; display: flex !important; align-items: center !important; box-sizing: border-box !important;
            font-size: clamp(15px, 4.3vw, 17px) !important; font-weight: 600 !important; line-height: 1.25 !important;
            padding-top: 0 !important;
          }
          .ctrl-page-sub              { display: none !important; }

          /* Stats grid — 2 col */
          .ctrl-stats-grid            { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }

          /* Dashboard bottom — stack */
          .ctrl-dashboard-bottom      { grid-template-columns: 1fr !important; }

          /* Modals — bottom sheet */
          .ctrl-modal-wrap            { align-items: flex-end !important; padding: 0 !important; }
          .ctrl-modal-box             {
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            max-height: 92dvh !important;
            padding: 20px 16px 36px !important;
          }
          .ctrl-drag-handle           { display: block !important; }
          .ctrl-modal-box h2          { font-size: 15px !important; }
          .ctrl-form-grid             { grid-template-columns: 1fr !important; gap: 12px !important; }
          .ctrl-form-actions          { gap: 10px !important; margin-top: 8px !important; }
          .ctrl-form-actions button   { flex: 1 !important; padding: 13px !important; font-size: 13px !important; border-radius: 10px !important; }

          /* Audit detail grid */
          .ctrl-audit-grid            { grid-template-columns: 1fr !important; gap: 8px !important; }

          /* Notifications */
          .ctrl-toast                 { top: 10px !important; right: 10px !important; left: 10px !important; font-size: 12px !important; }
        }
      `}</style>

      {/* Messages */}
      {error && (
        <div className="ctrl-toast" style={{ position: 'fixed', top: '20px', right: '20px', background: '#FFF5F2', color: '#FF5722', padding: '14px 20px', borderRadius: '8px', border: '1px solid #FFE0D6', fontSize: '10px', zIndex: 999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'slideUp 0.3s ease-out' }}>{error}</div>
      )}
      {success && (
        <div className="ctrl-toast" style={{ position: 'fixed', top: '20px', right: '20px', background: '#E8F5E9', color: '#2E7D32', padding: '14px 20px', borderRadius: '8px', border: '1px solid #C8E6C9', fontSize: '10px', zIndex: 999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'slideUp 0.3s ease-out' }}>{success}</div>
      )}

      {/* Tabs — desktop + mobile (horizontal scroll on mobile) */}
      <div className="ctrl-tab-bar" style={{ background: '#FFFFFF', borderBottom: '1px solid #E0E0E0', padding: '0 20px', display: 'flex', alignItems: 'center' }}>
        {['dashboard', 'users', 'roles', 'audit', 'sessions'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '12px 20px', border: 'none', background: 'none', borderBottom: activeTab === tab ? '3px solid #1976D2' : '3px solid transparent', color: activeTab === tab ? '#1976D2' : '#666', cursor: 'pointer', fontSize: '10px', fontWeight: activeTab === tab ? '600' : '400', textTransform: 'capitalize', transition: 'all 0.2s', marginBottom: '-1px', whiteSpace: 'nowrap' }}
            onMouseEnter={(e) => { if (activeTab !== tab) e.target.style.color = '#1976D2'; }}
            onMouseLeave={(e) => { if (activeTab !== tab) e.target.style.color = '#666'; }}>
            {TAB_LABELS[tab]}
          </button>
        ))}
        {/* Back to app home */}
        <Link to="/" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fafafa', color: '#555', fontSize: '10px', fontWeight: '500', textDecoration: 'none', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; e.currentTarget.style.color = '#333'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#fafafa'; e.currentTarget.style.color = '#555'; }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Management
        </Link>
      </div>

      {/* Content */}
      <div className="ctrl-content-wrap">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'users' && renderUsers()}

      {/* ── Roles ── */}
      {activeTab === 'roles' && (
        <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box', margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h1 className="ctrl-page-title" style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: '#333', marginBottom: '4px' }}>Role Management</h1>
              <p className="ctrl-page-sub" style={{ fontSize: '12px', color: '#666', margin: 0 }}>Manage system roles and permissions</p>
            </div>
            <button onClick={() => openRoleModal()} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#4CAF50', color: '#FFFFFF', cursor: 'pointer', fontSize: '10px', fontWeight: '500', boxShadow: '0 2px 4px rgba(76,175,80,0.3)' }}
              onMouseEnter={(e) => { e.target.style.background = '#388E3C'; e.target.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.target.style.background = '#4CAF50'; e.target.style.transform = 'translateY(0)'; }}>
              + Add Role
            </button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '12px' }}>Loading...</div>
          ) : (
            /* Single scrollable table for desktop + mobile */
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                    {['Role Name', 'Permissions', 'Actions'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roles.map(r => {
                    const permissions = [];
                    if (r.control_management) permissions.push('Control');
                    if (r.booking_management) permissions.push('Booking');
                    if (r.operation_management) {
                      permissions.push('Operation');
                      if (r.operation_general_dashboard) permissions.push('Op · Dashboard');
                      if (r.operation_customer_support) permissions.push('Op · Support');
                      if (r.operation_rider_management_supervisor) permissions.push('Op · Riders (Supervisor)');
                      else if (r.operation_rider_management) permissions.push('Op · Riders');
                      if (r.operation_deliveries_management) permissions.push('Op · Deliveries');
                      if (r.operation_affluent_management) permissions.push('Op · Affluent');
                      if (r.operation_special_request_management) permissions.push('Op · Special Request');
                      if (r.operation_slaughter_management) permissions.push('Op · Slaughter');
                      if (r.operation_line_management) permissions.push('Op · Line');
                      if (r.operation_challan_management) permissions.push('Op · Challan');
                    }
                    if (r.farm_management) permissions.push('Farm');
                    if (r.procurement_management) permissions.push('Procurement');
                    if (r.accounting_and_finance) permissions.push('Accounting');
                    if (r.performance_management) permissions.push('Performance');
                    return (
                      <tr key={r.role_id} style={{ borderBottom: '1px solid #F0F0F0', transition: 'background 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F9F9F9'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ ...tdStyle, fontWeight: '500' }}>{r.role_name}</td>
                        <td style={tdStyle}>
                          {permissions.length > 0 ? (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {permissions.map(p => (
                                <span key={p} style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', background: '#E8F5E9', color: '#2E7D32' }}>{p}</span>
                              ))}
                            </div>
                          ) : 'No permissions'}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => openRoleModal(r)} style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid #E0E0E0', background: '#FFFFFF', color: '#4CAF50', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                              onMouseEnter={(e) => { e.target.style.background = '#E8F5E9'; e.target.style.borderColor = '#4CAF50'; }}
                              onMouseLeave={(e) => { e.target.style.background = '#FFFFFF'; e.target.style.borderColor = '#E0E0E0'; }}>Edit</button>
                            <button onClick={() => handleDeleteRole(r.role_id)} style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid #E0E0E0', background: '#FFFFFF', color: '#C62828', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                              onMouseEnter={(e) => { e.target.style.background = '#FFEBEE'; e.target.style.borderColor = '#C62828'; }}
                              onMouseLeave={(e) => { e.target.style.background = '#FFFFFF'; e.target.style.borderColor = '#E0E0E0'; }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Audit Logs ── */}
      {activeTab === 'audit' && (
        <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box', margin: 0 }}>
          <h1 className="ctrl-page-title" style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: '#333' }}>Audit Logs</h1>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '12px' }}>Loading...</div>
          ) : (
            /* Single scrollable table for desktop + mobile */
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                    {['Timestamp', 'User', 'Action', 'Entity', 'IP Address'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.log_id} style={{ borderBottom: '1px solid #F0F0F0', transition: 'background 0.2s', cursor: 'pointer' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#F0F7FF'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      onClick={() => { setSelectedAuditLog(log); if (!showAuditDetailModal) auditModalMounted.current = false; setShowAuditDetailModal(true); }}>
                      <td style={tdStyle}>{new Date(log.created_at).toLocaleString()}</td>
                      <td style={tdStyle}>{log.username || 'System'}</td>
                      <td style={tdStyle}>{log.action}</td>
                      <td style={tdStyle}>{log.entity_type} {log.entity_id && `#${log.entity_id}`}</td>
                      <td style={tdStyle}>{log.ip_address || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Sessions ── */}
      {activeTab === 'sessions' && (
        <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box', margin: 0 }}>
          <h1 className="ctrl-page-title" style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: '#333' }}>Active Sessions</h1>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '12px' }}>Loading...</div>
          ) : (
            /* Single scrollable table for desktop + mobile */
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                    {['User', 'Role', 'Login Time', 'Last Activity', 'IP Address', 'Actions'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(session => (
                    <tr key={session.session_id} style={{ borderBottom: '1px solid #F0F0F0', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#F9F9F9'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <td style={tdStyle}>{session.username}</td>
                      <td style={tdStyle}>{session.role_name}</td>
                      <td style={tdStyle}>{new Date(session.login_at).toLocaleString()}</td>
                      <td style={tdStyle}>{new Date(session.last_activity_at).toLocaleString()}</td>
                      <td style={tdStyle}>{session.ip_address || '-'}</td>
                      <td style={tdStyle}>
                        <button onClick={() => handleTerminateSession(session.session_id)} style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid #E0E0E0', background: '#FFFFFF', color: '#C62828', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                          onMouseEnter={(e) => { e.target.style.background = '#FFEBEE'; e.target.style.borderColor = '#C62828'; }}
                          onMouseLeave={(e) => { e.target.style.background = '#FFFFFF'; e.target.style.borderColor = '#E0E0E0'; }}>Terminate</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      </div>{/* end ctrl-content-wrap */}

      {/* ── Mobile bottom navigation (unchanged) ── */}
      <nav className="ctrl-bottom-nav" style={{
        display: 'none',
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        height: '64px',
        background: '#fff',
        borderTop: '1px solid #e5e7eb',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
        zIndex: 900,
        alignItems: 'stretch',
      }}>
        {[
          {
            tab: 'dashboard',
            label: 'Dashboard',
            icon: (active) => (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#1976D2' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            ),
          },
          {
            tab: 'users',
            label: 'Users',
            icon: (active) => (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#1976D2' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            ),
          },
          {
            tab: 'roles',
            label: 'Roles',
            icon: (active) => (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#4CAF50' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            ),
          },
          {
            tab: 'audit',
            label: 'Audit',
            icon: (active) => (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#9C27B0' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            ),
          },
          {
            tab: 'sessions',
            label: 'Sessions',
            icon: (active) => (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#FF9800' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            ),
          },
        ].map(({ tab, label, icon }) => {
          const active = activeTab === tab;
          const activeColor = tab === 'roles' ? '#4CAF50' : tab === 'audit' ? '#9C27B0' : tab === 'sessions' ? '#FF9800' : '#1976D2';
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: '6px 0 8px',
                position: 'relative',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {active && (
                <span style={{ position: 'absolute', top: '6px', width: '4px', height: '4px', borderRadius: '50%', background: activeColor }} />
              )}
              {icon(active)}
              <span style={{ fontSize: '10px', fontWeight: active ? '600' : '400', color: active ? activeColor : '#9ca3af', lineHeight: 1 }}>
                {label}
              </span>
            </button>
          );
        })}

        <div style={{ width: '1px', background: '#f0f0f0', margin: '10px 0' }} />

        <Link
          to="/"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            textDecoration: 'none',
            padding: '6px 0 8px',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span style={{ fontSize: '10px', fontWeight: '400', color: '#9ca3af', lineHeight: 1 }}>Home</span>
        </Link>
      </nav>

      {/* ── User Modal ── */}
      {showUserModal && (
        <Modal show={showUserModal} onClose={() => { setShowUserModal(false); setEditingUser(null); setShowUserPassword(false); }} title={editingUser ? 'Edit User' : 'Add User'} hasAnimated={userModalMounted.current}>
          <p style={{ fontSize: '11px', color: '#888', marginBottom: '16px' }}>Required to save user.</p>
          <form onSubmit={(e) => { e.preventDefault(); handleUserSubmit(e); }}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#333', marginBottom: '5px', fontWeight: '500' }}>Username <span style={{ color: '#FF5722' }}>*</span></label>
              <input type="text" value={userFormData.username} onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })} required style={inputStyle} onFocus={(e) => e.target.style.borderColor = '#1976D2'} onBlur={(e) => e.target.style.borderColor = '#E0E0E0'} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>Email <span style={{ color: '#FF5722' }}>*</span></label>
              <input type="email" value={userFormData.email} onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })} required style={inputStyle} onFocus={(e) => e.target.style.borderColor = '#1976D2'} onBlur={(e) => e.target.style.borderColor = '#E0E0E0'} />
            </div>
            <div style={{ marginBottom: '14px', position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>Password {!editingUser && <span style={{ color: '#FF5722' }}>*</span>}</label>
              <input type={showUserPassword ? 'text' : 'password'} value={userFormData.password} onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })} required={!editingUser} placeholder={editingUser ? 'Leave blank to keep current password' : ''} style={{ ...inputStyle, padding: '10px 40px 10px 12px' }} onFocus={(e) => e.target.style.borderColor = '#1976D2'} onBlur={(e) => e.target.style.borderColor = '#E0E0E0'} />
              <button type="button" onClick={() => setShowUserPassword(!showUserPassword)} style={{ position: 'absolute', right: '10px', top: '32px', background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex', alignItems: 'center', padding: 0 }}>
                {showUserPassword
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>}
              </button>
            </div>
            <div className="ctrl-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>First Name</label>
                <input type="text" value={userFormData.first_name} onChange={(e) => setUserFormData({ ...userFormData, first_name: e.target.value })} style={inputStyle} onFocus={(e) => e.target.style.borderColor = '#1976D2'} onBlur={(e) => e.target.style.borderColor = '#E0E0E0'} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>Last Name</label>
                <input type="text" value={userFormData.last_name} onChange={(e) => setUserFormData({ ...userFormData, last_name: e.target.value })} style={inputStyle} onFocus={(e) => e.target.style.borderColor = '#1976D2'} onBlur={(e) => e.target.style.borderColor = '#E0E0E0'} />
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>Phone Number</label>
              <input type="tel" value={userFormData.phone} onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })} style={inputStyle} onFocus={(e) => e.target.style.borderColor = '#1976D2'} onBlur={(e) => e.target.style.borderColor = '#E0E0E0'} />
            </div>
            <div className="ctrl-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>Role <span style={{ color: '#FF5722' }}>*</span></label>
                <select value={userFormData.role_id} onChange={(e) => setUserFormData({ ...userFormData, role_id: e.target.value })} required style={inputStyle} onFocus={(e) => e.target.style.borderColor = '#1976D2'} onBlur={(e) => e.target.style.borderColor = '#E0E0E0'}>
                  <option value="">Select Role</option>
                  {roles.map(role => <option key={role.role_id} value={role.role_id}>{role.role_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>Status <span style={{ color: '#FF5722' }}>*</span></label>
                <select value={userFormData.status} onChange={(e) => setUserFormData({ ...userFormData, status: e.target.value })} required style={inputStyle} onFocus={(e) => e.target.style.borderColor = '#1976D2'} onBlur={(e) => e.target.style.borderColor = '#E0E0E0'}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>
            <div className="ctrl-form-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setShowUserModal(false); setEditingUser(null); }} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #E0E0E0', background: '#FFFFFF', color: '#333', cursor: 'pointer', fontSize: '10px', fontWeight: '500' }}
                onMouseEnter={(e) => e.target.style.background = '#F5F5F5'} onMouseLeave={(e) => e.target.style.background = '#FFFFFF'}>Cancel</button>
              <button type="button" onClick={(e) => { e.preventDefault(); handleUserSubmit(e); }} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#1976D2', color: '#FFFFFF', cursor: 'pointer', fontSize: '10px', fontWeight: '500' }}
                onMouseEnter={(e) => e.target.style.background = '#1565C0'} onMouseLeave={(e) => e.target.style.background = '#1976D2'}>{editingUser ? 'Update User' : 'Create User'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Role Modal ── */}
      <Modal show={showRoleModal} onClose={() => { setShowRoleModal(false); setEditingRole(null); }} title={editingRole ? 'Edit Role' : 'Add Role'}>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '24px' }}>Required to save role.</p>
        <form onSubmit={handleRoleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#333', marginBottom: '6px', fontWeight: '500' }}>Role Name <span style={{ color: '#FF5722' }}>*</span></label>
            <input type="text" value={roleFormData.role_name} onChange={(e) => setRoleFormData({ ...roleFormData, role_name: e.target.value })} required style={inputStyle} onFocus={(e) => e.target.style.borderColor = '#1976D2'} onBlur={(e) => e.target.style.borderColor = '#E0E0E0'} />
          </div>
          <div style={{ marginBottom: '25px', padding: '20px', background: '#F9F9F9', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', marginTop: 0, marginBottom: '15px' }}>System Access Permissions</h3>
            {[
              { key: 'control_management', label: 'Control Management' },
              { key: 'booking_management', label: 'Booking Management' },
            ].map(perm => (
              <div key={perm.key} style={{ marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                <input type="checkbox" id={perm.key} checked={roleFormData[perm.key]} onChange={(e) => setRoleFormData({ ...roleFormData, [perm.key]: e.target.checked })} style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer' }} />
                <label htmlFor={perm.key} style={{ fontSize: '13px', color: '#333', cursor: 'pointer' }}>{perm.label}</label>
              </div>
            ))}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input type="checkbox" id="operation_management" checked={roleFormData.operation_management} onChange={(e) => {
                  const v = e.target.checked;
                  setRoleFormData({
                    ...roleFormData,
                    operation_management: v,
                    ...(v ? {} : {
                      operation_general_dashboard: false,
                      operation_customer_support: false,
                      operation_rider_management: false,
                      operation_rider_management_supervisor: false,
                      operation_deliveries_management: false,
                      operation_challan_management: false,
                      operation_affluent_management: false,
                      operation_special_request_management: false,
                      operation_slaughter_management: false,
                      operation_line_management: false,
                    }),
                  });
                }} style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer' }} />
                <label htmlFor="operation_management" style={{ fontSize: '13px', color: '#333', cursor: 'pointer', fontWeight: '600' }}>Operation Management</label>
              </div>
              {roleFormData.operation_management && (
                <div style={{ marginLeft: '28px', marginTop: '10px', padding: '12px', background: '#fff', borderRadius: '8px', border: '1px solid #eee' }}>
                  <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>Screens within Operations (choose separately)</div>
                  {[
                    { key: 'operation_general_dashboard', label: 'General Dashboard' },
                    { key: 'operation_customer_support', label: 'Customer Support' },
                    { key: 'operation_deliveries_management', label: 'Deliveries Management' },
                    { key: 'operation_challan_management', label: 'Challan Management' },
                    { key: 'operation_affluent_management', label: 'Affluent Management' },
                    { key: 'operation_special_request_management', label: 'Special Request Management' },
                    { key: 'operation_slaughter_management', label: 'Slaughter Management' },
                    { key: 'operation_line_management', label: 'Line Management' },
                  ].map(perm => (
                    <div key={perm.key} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                      <input type="checkbox" id={perm.key} checked={roleFormData[perm.key]} onChange={(e) => setRoleFormData({ ...roleFormData, [perm.key]: e.target.checked })} style={{ marginRight: '10px', width: '16px', height: '16px', cursor: 'pointer' }} />
                      <label htmlFor={perm.key} style={{ fontSize: '12px', color: '#333', cursor: 'pointer' }}>{perm.label}</label>
                    </div>
                  ))}
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>Rider access (choose one)</div>
                    {[
                      { id: 'rider_mode_none', label: 'No rider screen', checked: !roleFormData.operation_rider_management && !roleFormData.operation_rider_management_supervisor, onChange: () => setRoleFormData({ ...roleFormData, operation_rider_management: false, operation_rider_management_supervisor: false }) },
                      { id: 'rider_mode_admin', label: 'Rider Management (Admin)', checked: roleFormData.operation_rider_management, onChange: () => setRoleFormData({ ...roleFormData, operation_rider_management: true, operation_rider_management_supervisor: false }) },
                      { id: 'rider_mode_sup', label: 'Rider Management (Supervisor)', checked: roleFormData.operation_rider_management_supervisor, onChange: () => setRoleFormData({ ...roleFormData, operation_rider_management: false, operation_rider_management_supervisor: true }) },
                    ].map((opt) => (
                      <div key={opt.id} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                        <input type="radio" id={opt.id} name="rider_ops_mode" checked={opt.checked} onChange={opt.onChange} style={{ marginRight: '10px', width: '16px', height: '16px', cursor: 'pointer' }} />
                        <label htmlFor={opt.id} style={{ fontSize: '12px', color: '#333', cursor: 'pointer' }}>{opt.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {[
              { key: 'farm_management', label: 'Farm Management' },
              { key: 'procurement_management', label: 'Procurement Management' },
              { key: 'accounting_and_finance', label: 'Accounting & Finance' },
              { key: 'performance_management', label: 'Performance Management' }
            ].map(perm => (
              <div key={perm.key} style={{ marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                <input type="checkbox" id={perm.key} checked={roleFormData[perm.key]} onChange={(e) => setRoleFormData({ ...roleFormData, [perm.key]: e.target.checked })} style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer' }} />
                <label htmlFor={perm.key} style={{ fontSize: '13px', color: '#333', cursor: 'pointer' }}>{perm.label}</label>
              </div>
            ))}
          </div>
          <div className="ctrl-form-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '30px' }}>
            <button type="button" onClick={() => { setShowRoleModal(false); setEditingRole(null); }} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #E0E0E0', background: '#FFFFFF', color: '#333', cursor: 'pointer', fontSize: '10px', fontWeight: '500' }}
              onMouseEnter={(e) => e.target.style.background = '#F5F5F5'} onMouseLeave={(e) => e.target.style.background = '#FFFFFF'}>Cancel</button>
            <button type="submit" style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#4CAF50', color: '#FFFFFF', cursor: 'pointer', fontSize: '10px', fontWeight: '500' }}
              onMouseEnter={(e) => e.target.style.background = '#388E3C'} onMouseLeave={(e) => e.target.style.background = '#4CAF50'}>{editingRole ? 'Update Role' : 'Create Role'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Audit Detail Modal ── */}
      {selectedAuditLog && (
        <Modal show={showAuditDetailModal} onClose={() => { setShowAuditDetailModal(false); setSelectedAuditLog(null); }} title={`Audit Log - ${selectedAuditLog.action}`} hasAnimated={auditModalMounted.current} maxWidth="800px">
          <div style={{ marginBottom: '20px' }}>
            <div className="ctrl-audit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              {[
                { label: 'User', val: selectedAuditLog.username || 'System' },
                { label: 'Timestamp', val: new Date(selectedAuditLog.created_at).toLocaleString() },
                { label: 'Entity Type', val: selectedAuditLog.entity_type },
                { label: 'Entity ID', val: selectedAuditLog.entity_id || 'N/A' },
                { label: 'IP Address', val: selectedAuditLog.ip_address || 'N/A' },
                { label: 'User Agent', val: selectedAuditLog.user_agent || 'N/A' },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: '#333', wordBreak: 'break-word' }}>{val}</div>
                </div>
              ))}
            </div>

            {(() => {
              let oldValues = null;
              let newValues = null;
              try {
                if (selectedAuditLog.old_values) oldValues = typeof selectedAuditLog.old_values === 'string' ? JSON.parse(selectedAuditLog.old_values) : selectedAuditLog.old_values;
                if (selectedAuditLog.new_values) newValues = typeof selectedAuditLog.new_values === 'string' ? JSON.parse(selectedAuditLog.new_values) : selectedAuditLog.new_values;
              } catch (e) { console.error('Error parsing audit log values:', e); }

              const actionUpper = selectedAuditLog.action.toUpperCase();
              const isUpdate = actionUpper.includes('UPDATE') || actionUpper.includes('EDIT');
              const isCreate = actionUpper.includes('CREATE') || actionUpper.includes('ADD');
              const isDelete = actionUpper.includes('DELETE') || actionUpper.includes('REMOVE');
              const isCancelOrder = actionUpper === 'CANCEL_ORDER';
              const isDeleteLead = actionUpper === 'DELETE_LEAD';
              const isOrderExport = actionUpper === 'ORDER_EXPORT';
              const isLeadExport = actionUpper === 'LEAD_EXPORT';

              const tableWrap = (title, bg, children) => (
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>{title}</h3>
                  <div style={{ background: bg, borderRadius: '8px', padding: '16px', overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table>
                  </div>
                </div>
              );

              const auditThStyle = { textAlign: 'left', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#666' };
              const auditTdStyle = { padding: '8px', fontSize: '12px', color: '#333' };

              return (
                <div>
                  {isUpdate && (oldValues || newValues) && tableWrap('Changes Made (before → after)', '#F9F9F9', <>
                    <thead><tr style={{ borderBottom: '2px solid #E0E0E0' }}><th style={auditThStyle}>Field</th><th style={auditThStyle}>Old value</th><th style={auditThStyle}>New value</th></tr></thead>
                    <tbody>
                      {Object.keys({ ...(oldValues || {}), ...(newValues || {}) }).filter(k => k !== 'order_id' && k !== 'lead_id').map(key => {
                        const oldVal = oldValues && oldValues[key];
                        const newVal = newValues && newValues[key];
                        const toDatePart = (v) => { if (v == null || v === '') return v; const s = String(v); const m = s.match(/^(\d{4}-\d{2}-\d{2})/); if (m) return m[1]; const p = new Date(v); if (!Number.isNaN(p.getTime())) return `${p.getFullYear()}-${String(p.getMonth()+1).padStart(2,'0')}-${String(p.getDate()).padStart(2,'0')}`; return s; };
                        const oldNorm = key === 'booking_date' ? toDatePart(oldVal) : oldVal;
                        const newNorm = key === 'booking_date' ? toDatePart(newVal) : newVal;
                        const changed = key === 'booking_date' ? (oldNorm != null && newNorm != null && String(oldNorm) !== String(newNorm)) : (oldNorm !== newNorm);
                        const displayOld = oldVal !== null && oldVal !== undefined ? String(key === 'booking_date' ? (toDatePart(oldVal) ?? '—') : oldVal) : '—';
                        const displayNew = newVal !== null && newVal !== undefined ? String(key === 'booking_date' ? (toDatePart(newVal) ?? '—') : newVal) : '—';
                        return (
                          <tr key={key} style={{ borderBottom: '1px solid #F0F0F0' }}>
                            <td style={{ ...auditTdStyle, fontWeight: '500' }}>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                            <td style={{ ...auditTdStyle, color: changed ? '#C62828' : '#666', textDecoration: changed ? 'line-through' : 'none' }}>{displayOld}</td>
                            <td style={{ ...auditTdStyle, color: changed ? '#2E7D32' : '#666', fontWeight: changed ? '500' : '400' }}>{displayNew}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </>)}

                  {(isCancelOrder || isDeleteLead) && newValues && tableWrap(isCancelOrder ? 'Cancelled order details' : 'Deleted lead details', '#FFF5F5', <>
                    <thead><tr style={{ borderBottom: '2px solid #E0E0E0' }}><th style={auditThStyle}>Field</th><th style={auditThStyle}>Value</th></tr></thead>
                    <tbody>{Object.entries(newValues).map(([key, value]) => (
                      <tr key={key} style={{ borderBottom: '1px solid #F0F0F0' }}>
                        <td style={{ ...auditTdStyle, fontWeight: '500' }}>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                        <td style={auditTdStyle}>{value !== null && value !== undefined ? String(value) : '—'}</td>
                      </tr>
                    ))}</tbody>
                  </>)}

                  {(isOrderExport || isLeadExport) && newValues && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>Export summary</h3>
                      <div style={{ background: '#F0F7FF', borderRadius: '8px', padding: '16px' }}>
                        <div style={{ fontSize: '13px', color: '#333', lineHeight: '1.7' }}>
                          <div><strong>Rows exported:</strong> {newValues.count ?? 0}</div>
                          {(newValues.order_ids || newValues.lead_ids)?.length > 0
                            ? <div style={{ marginTop: '8px' }}><strong>Selected IDs:</strong><div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>{(newValues.order_ids || newValues.lead_ids).join(', ')}</div></div>
                            : newValues.filters && Object.keys(newValues.filters).length > 0
                              ? <div style={{ marginTop: '8px' }}><strong>Filters applied:</strong><ul style={{ margin: '4px 0 0 16px', padding: 0 }}>{Object.entries(newValues.filters).map(([k, v]) => <li key={k}>{k.replace(/_/g, ' ')}: {String(v)}</li>)}</ul></div>
                              : <div style={{ marginTop: '8px', color: '#2E7D32' }}>All data exported (no filters, no selection)</div>}
                        </div>
                      </div>
                    </div>
                  )}

                  {isCreate && newValues && Object.keys(newValues).length > 0 && tableWrap('Created Data', '#F9F9F9', <>
                    <thead><tr style={{ borderBottom: '2px solid #E0E0E0' }}><th style={auditThStyle}>Field</th><th style={auditThStyle}>Value</th></tr></thead>
                    <tbody>{Object.entries(newValues).map(([key, value]) => (
                      <tr key={key} style={{ borderBottom: '1px solid #F0F0F0' }}>
                        <td style={{ ...auditTdStyle, fontWeight: '500' }}>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                        <td style={auditTdStyle}>{value === null || value === undefined ? 'N/A' : String(value)}</td>
                      </tr>
                    ))}</tbody>
                  </>)}

                  {isDelete && oldValues && tableWrap('Deleted Data', '#F9F9F9', <>
                    <thead><tr style={{ borderBottom: '2px solid #E0E0E0' }}><th style={auditThStyle}>Field</th><th style={auditThStyle}>Value</th></tr></thead>
                    <tbody>{Object.entries(oldValues).map(([key, value]) => (
                      <tr key={key} style={{ borderBottom: '1px solid #F0F0F0' }}>
                        <td style={{ ...auditTdStyle, fontWeight: '500' }}>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                        <td style={{ ...auditTdStyle, color: '#C62828' }}>{value !== null && value !== undefined ? String(value) : 'N/A'}</td>
                      </tr>
                    ))}</tbody>
                  </>)}

                  {!isUpdate && !isCreate && !isDelete && !isCancelOrder && !isOrderExport && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>Action Details</h3>
                      <div style={{ background: '#F9F9F9', borderRadius: '8px', padding: '16px' }}>
                        <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.6' }}>
                          <div style={{ marginBottom: '8px' }}><strong>Action:</strong> {selectedAuditLog.action}</div>
                          {newValues && Object.keys(newValues).length > 0 && (
                            <div style={{ marginTop: '12px' }}>
                              <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Additional Information:</div>
                              {Object.entries(newValues).map(([key, value]) => (
                                <div key={key} style={{ marginBottom: '4px', fontSize: '12px' }}><strong>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> {String(value)}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="ctrl-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button type="button" onClick={() => { setShowAuditDetailModal(false); setSelectedAuditLog(null); }} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#1976D2', color: '#FFFFFF', cursor: 'pointer', fontSize: '10px', fontWeight: '500' }}
                onMouseEnter={(e) => e.target.style.background = '#1565C0'} onMouseLeave={(e) => e.target.style.background = '#1976D2'}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Control;