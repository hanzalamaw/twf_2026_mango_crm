import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import loginImage from '../assets/loginPageImage.png';
import { API_BASE } from '../config/api';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ username: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const err = searchParams.get('error');
    if (err === 'user_not_found') setError('User not found. Contact admin to get access.');
    else if (err === 'oauth_failed') setError('Sign-in failed. Try again or use username/password.');
    else if (err === 'apple_oauth_not_fully_implemented') setError('Apple sign-in is not fully set up yet. Use Google, Microsoft, or username/password.');
  }, [searchParams]);

  const validateField = (name, value) => {
    if (!value.trim()) {
      setFieldErrors(prev => ({ ...prev, [name]: 'Please fill out this field.' }));
      return false;
    }
    if (name === 'username' && value.length < 3) {
      setFieldErrors(prev => ({ ...prev, [name]: 'Username must be at least 3 characters.' }));
      return false;
    }
    setFieldErrors(prev => ({ ...prev, [name]: '' }));
    return true;
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    navigate('/forgot-password');
  };

  const handleSocialLogin = (provider) => {
    window.location.href = `${API_BASE}/auth/${provider.toLowerCase()}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const isUsernameValid = validateField('username', username);
    const isPasswordValid = validateField('password', password);

    if (!isUsernameValid || !isPasswordValid) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        login(data.user, data.token, data.refreshToken ?? null);
        const redirect = searchParams.get('redirect') || '/';
        if (data.user.has_prev_logged_in) {
          navigate(redirect);
        } else {
          navigate(`/accept-terms?redirect=${encodeURIComponent(redirect)}`);
        }
      } else {
        const reason = data.reason;
        if (reason === 'user_not_found') setError('User not found. Contact admin to get access.');
        else if (reason === 'wrong_password') setError('Incorrect password.');
        else if (reason === 'invalid_request') setError('Please enter username and password.');
        else if (reason === 'server_error') setError('Something went wrong. Please try again.');
        else setError(data.message || 'Invalid credentials');
      }
    } catch (err) {
      setError('Could not connect to server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      width: '100%',
      background: '#FFFFFF',
      fontFamily: "'Poppins', 'Inter', sans-serif",
      padding: '20px 12px',
      boxSizing: 'border-box',
    }}>

      <div className="login-grid" style={{
        display: 'grid',
        width: '100%',
        maxWidth: '720px',
      }}>

        {/* Back Card 2 */}
        <div style={{
          gridArea: '1 / 1',
          background: '#FFE4DB',
          borderRadius: '24px',
          transform: 'rotate(2deg) translate(6px, 8px)',
          animation: 'cardDrift1 6s ease-in-out infinite',
          zIndex: 0
        }}></div>

        {/* Back Card 1 */}
        <div style={{
          gridArea: '1 / 1',
          background: '#FFEDE6',
          borderRadius: '22px',
          transform: 'rotate(-1.5deg) translate(-5px, -6px)',
          animation: 'cardDrift2 5s ease-in-out infinite',
          zIndex: 1
        }}></div>

        {/* Main White Card */}
        <div style={{
          gridArea: '1 / 1',
          background: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          overflow: 'hidden',
          position: 'relative',
          padding: '24px',
          boxSizing: 'border-box',
          alignItems: 'center',
          zIndex: 2,
          boxShadow: '0 5px 25px rgba(0,0,0,0.04)'
        }}>

          {/* Inner Login Card */}
          <div className="login-inner-card" style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
            padding: '28px',
            width: '100%',
            maxWidth: '300px',
            zIndex: 3,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            margin: '0 auto'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <p style={{ color: '#FF5722', fontSize: '12px', fontWeight: '500', margin: '0 0 4px 0' }}>TWF Mango CRM</p>
              <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#333', margin: 0 }}>Login</h1>
            </div>

            {error && (
              <div style={{
                background: '#FFF5F2',
                color: '#FF5722',
                padding: '8px',
                borderRadius: '6px',
                fontSize: '10px',
                marginBottom: '14px',
                border: '1px solid #FFE0D6'
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div style={{ marginBottom: '14px', position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '5px' }}>Username</label>
                <input
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (fieldErrors.username) validateField('username', e.target.value);
                  }}
                  onBlur={(e) => validateField('username', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: fieldErrors.username ? '1px solid #FF5722' : '1px solid #F0F0F0',
                    fontSize: '10px',
                    outline: 'none',
                    background: '#FAFAFA',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                />
                {fieldErrors.username && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: '8px',
                    background: '#FFFFFF',
                    borderRadius: '6px',
                    padding: '12px 16px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    minWidth: '200px',
                    animation: 'fadeIn 0.2s ease-in'
                  }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      background: '#FF5722',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <span style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 'bold' }}>!</span>
                    </div>
                    <span style={{ color: '#333', fontSize: '12px' }}>{fieldErrors.username}</span>
                    <div style={{
                      position: 'absolute',
                      top: '-6px',
                      left: '20px',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderBottom: '6px solid #FFFFFF'
                    }}></div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '6px', position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '5px' }}>Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) validateField('password', e.target.value);
                  }}
                  onBlur={(e) => validateField('password', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: fieldErrors.password ? '1px solid #FF5722' : '1px solid #F0F0F0',
                    fontSize: '10px',
                    outline: 'none',
                    background: '#FAFAFA',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                />
                {fieldErrors.password && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: '8px',
                    background: '#FFFFFF',
                    borderRadius: '6px',
                    padding: '12px 16px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    minWidth: '200px',
                    animation: 'fadeIn 0.2s ease-in'
                  }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      background: '#FF5722',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <span style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 'bold' }}>!</span>
                    </div>
                    <span style={{ color: '#333', fontSize: '12px' }}>{fieldErrors.password}</span>
                    <div style={{
                      position: 'absolute',
                      top: '-6px',
                      left: '20px',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderBottom: '6px solid #FFFFFF'
                    }}></div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '30px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#CCC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0
                  }}
                >
                  {showPassword ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  )}
                </button>
              </div>

              <div style={{ textAlign: 'right', marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#FF5722',
                    fontSize: '11px',
                    textDecoration: 'none',
                    fontWeight: '500',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Forgot Password?
                </button>
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
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  marginBottom: '16px'
                }}
              >
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <p style={{ fontSize: '11px', color: '#999', margin: '0 0 10px 0' }}>Or Continue With</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => handleSocialLogin('Google')}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #F0F0F0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleSocialLogin('Apple')}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #F0F0F0', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleSocialLogin('Microsoft')}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #F0F0F0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#00A4EF" d="M13 1h10v10H13z"/><path fill="#7FBA00" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>
                </button>
              </div>
            </div>
          </div>

          {/* Right Side - Image Area — hidden on small screens */}
          <div className="login-image-panel" style={{
            flex: '1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            paddingLeft: '30px',
            minWidth: '220px'
          }}>
            <img
              src={loginImage}
              alt="Cow and Goat"
              style={{
                width: '100%',
                height: 'auto',
                maxWidth: '450px',
                objectFit: 'contain',
                zIndex: 1
              }}
            />
            <div style={{ position: 'absolute', top: '15%', right: '15%', width: '10px', height: '10px', background: '#D4E157', borderRadius: '50%', opacity: 0.5 }}></div>
            <div style={{ position: 'absolute', top: '10%', left: '35%', width: '7px', height: '7px', background: '#D4E157', borderRadius: '50%', opacity: 0.3 }}></div>
            <div style={{ position: 'absolute', bottom: '20%', left: '30%', width: '9px', height: '9px', background: '#D4E157', borderRadius: '50%', opacity: 0.4 }}></div>
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
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-5px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        /* Hide image panel below 700px */
        @media (max-width: 700px) {
          .login-image-panel {
            display: none !important;
          }
        }

        /* Mobile: fluid width on every phone, taller via padding */
        @media (max-width: 480px) {
          .login-grid {
            width: calc(100vw - 48px) !important;
            max-width: 340px !important;
          }
          .login-inner-card {
            max-width: 100% !important;
            padding: 32px 20px 44px !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default Login;