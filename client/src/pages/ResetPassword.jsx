import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import loginImage from '../assets/loginPageImage.png';
import { API_BASE } from '../config/api';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenValid, setTokenValid] = useState(null); // null = loading, true/false = result
  const [fieldErrors, setFieldErrors] = useState({ password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/reset-password/validate?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!cancelled) setTokenValid(data.valid === true);
      } catch {
        if (!cancelled) setTokenValid(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [token]);

  const validate = () => {
    let ok = true;
    const errs = { password: '', confirm: '' };
    if (!password.trim()) {
      errs.password = 'Please enter a new password.';
      ok = false;
    } else if (password.length < 6) {
      errs.password = 'Password must be at least 6 characters.';
      ok = false;
    }
    if (password !== confirmPassword) {
      errs.confirm = 'Passwords do not match.';
      ok = false;
    }
    setFieldErrors(errs);
    return ok;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.message || 'Failed to reset password');
      }
    } catch (err) {
      setError('Could not connect to server');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (tokenValid === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#FFFFFF', fontFamily: "'Poppins', sans-serif" }}>
        <p style={{ color: '#666' }}>Checking reset link...</p>
      </div>
    );
  }

  if (tokenValid === false) {
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
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ background: '#FFF5F2', color: '#FF5722', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #FFE0D6' }}>
            <strong>Invalid or expired link</strong>
            <p style={{ margin: '8px 0 0 0', fontSize: '14px', color: '#666' }}>
              This password reset link is invalid or has expired. Request a new one from the forgot password page.
            </p>
          </div>
          <Link to="/forgot-password" style={{ color: '#FF5722', fontWeight: '600', textDecoration: 'none' }}>
            Request new reset link
          </Link>
          <span style={{ margin: '0 8px', color: '#999' }}>|</span>
          <Link to="/login" style={{ color: '#FF5722', fontWeight: '600', textDecoration: 'none' }}>
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

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
      <div style={{ position: 'relative', width: '100%', maxWidth: '900px', minHeight: '520px' }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: '#FFE4DB',
          borderRadius: '24px',
          transform: 'rotate(2deg) translate(6px, 8px)',
          animation: 'cardDrift1 6s ease-in-out infinite',
          zIndex: 0,
        }} />
        <div style={{
          position: 'absolute',
          inset: 0,
          background: '#FFEDE6',
          borderRadius: '22px',
          transform: 'rotate(-1.5deg) translate(-5px, -6px)',
          animation: 'cardDrift2 5s ease-in-out infinite',
          zIndex: 1,
        }} />
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          minHeight: '520px',
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          position: 'relative',
          padding: '30px',
          boxSizing: 'border-box',
          alignItems: 'center',
          zIndex: 2,
          boxShadow: '0 5px 25px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
            padding: '35px',
            width: '100%',
            maxWidth: '350px',
            zIndex: 3,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
          }}>
            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: '#FF5722', fontSize: '12px', fontWeight: '500', margin: '0 0 4px 0' }}>TWF Mango CRM</p>
              <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#333', margin: 0 }}>Set New Password</h1>
            </div>

            {success ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  background: '#E8F5E9',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '10px' }}>Password Updated</h2>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
                  You can now log in with your new password.
                </p>
                <Link to="/login" style={{ color: '#FF5722', textDecoration: 'none', fontWeight: '600', fontSize: '13px' }}>
                  Back to Login
                </Link>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
                  Enter your new password below. Use at least 6 characters.
                </p>

                {error && (
                  <div style={{
                    background: '#FFF5F2',
                    color: '#FF5722',
                    padding: '8px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    marginBottom: '14px',
                    border: '1px solid #FFE0D6',
                  }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                  <div style={{ marginBottom: '16px', position: 'relative' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '5px' }}>New Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter new password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }));
                      }}
                      style={{
                        width: '100%',
                        padding: '9px 36px 9px 12px',
                        borderRadius: '8px',
                        border: fieldErrors.password ? '1px solid #FF5722' : '1px solid #F0F0F0',
                        fontSize: '12px',
                        outline: 'none',
                        background: '#FAFAFA',
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '28px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#CCC',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      {showPassword ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      )}
                    </button>
                    {fieldErrors.password && (
                      <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#FF5722' }}>{fieldErrors.password}</p>
                    )}
                  </div>
                  <div style={{ marginBottom: '20px', position: 'relative' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '5px' }}>Confirm Password</label>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (fieldErrors.confirm) setFieldErrors((p) => ({ ...p, confirm: '' }));
                      }}
                      style={{
                        width: '100%',
                        padding: '9px 36px 9px 12px',
                        borderRadius: '8px',
                        border: fieldErrors.confirm ? '1px solid #FF5722' : '1px solid #F0F0F0',
                        fontSize: '12px',
                        outline: 'none',
                        background: '#FAFAFA',
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '28px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#CCC',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      {showConfirmPassword ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      )}
                    </button>
                    {fieldErrors.confirm && (
                      <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#FF5722' }}>{fieldErrors.confirm}</p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#FF5722',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      marginBottom: '16px',
                    }}
                  >
                    {isSubmitting ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
                <div style={{ textAlign: 'center' }}>
                  <Link to="/login" style={{ color: '#FF5722', textDecoration: 'none', fontWeight: '600', fontSize: '11px' }}>
                    Back to Login
                  </Link>
                </div>
              </>
            )}
          </div>
          <div style={{
            flex: '1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            paddingLeft: '30px',
          }}>
            <img src={loginImage} alt="Cow and Goat" style={{ width: '100%', height: 'auto', maxWidth: '450px', objectFit: 'contain', zIndex: 1 }} />
          </div>
        </div>
      </div>
      <style>
        {`
          @keyframes cardDrift1 {
            0%, 100% { transform: rotate(2deg) translate(6px, 8px); }
            50% { transform: rotate(3deg) translate(10px, -4px); }
          }
          @keyframes cardDrift2 {
            0%, 100% { transform: rotate(-1.5deg) translate(-5px, -6px); }
            50% { transform: rotate(-2.5deg) translate(-8px, 6px); }
          }
        `}
      </style>
    </div>
  );
};

export default ResetPassword;
