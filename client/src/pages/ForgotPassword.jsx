import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import loginImage from '../assets/loginPageImage.png';
import { API_BASE } from '../config/api';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const navigate = useNavigate();

  const validateEmail = (value) => {
    if (!value.trim()) {
      setFieldError('Please fill out this field.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setFieldError('Please enter a valid email address.');
      return false;
    }
    setFieldError('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!validateEmail(email)) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`${API_BASE}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.message || 'Failed to send reset email');
      }
    } catch (err) {
      setError('Could not connect to server');
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
      width: '100vw',
      background: '#FFFFFF', 
      fontFamily: "'Poppins', 'Inter', sans-serif",
      padding: '40px 20px',
      boxSizing: 'border-box',
      margin: 0,
      position: 'fixed',
      top: 0,
      left: 0,
      overflow: 'auto'
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '900px',
        minHeight: '520px'
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: '#FFE4DB',
          borderRadius: '24px',
          transform: 'rotate(2deg) translate(6px, 8px)',
          animation: 'cardDrift1 6s ease-in-out infinite',
          zIndex: 0
        }}></div>

        <div style={{
          position: 'absolute',
          inset: 0,
          background: '#FFEDE6',
          borderRadius: '22px',
          transform: 'rotate(-1.5deg) translate(-5px, -6px)',
          animation: 'cardDrift2 5s ease-in-out infinite',
          zIndex: 1
        }}></div>

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
          boxShadow: '0 5px 25px rgba(0,0,0,0.04)'
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
            boxSizing: 'border-box'
          }}>
            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: '#FF5722', fontSize: '12px', fontWeight: '500', margin: '0 0 4px 0' }}>TWF Mango CRM</p>
              <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#333', margin: 0 }}>Forgot Password</h1>
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
                  margin: '0 auto 20px'
                }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '10px' }}>Check Your Email</h2>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
                  If this email exists in our system, we have sent you a reset password link.
                </p>
                <Link 
                  to="/login" 
                  style={{ 
                    color: '#FF5722', 
                    textDecoration: 'none', 
                    fontWeight: '600',
                    fontSize: '13px'
                  }}
                >
                  Back to Login
                </Link>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
                  Enter your email address and we'll send you a link to reset your password.
                </p>

                {error && (
                  <div style={{ 
                    background: '#FFF5F2', 
                    color: '#FF5722', 
                    padding: '8px', 
                    borderRadius: '8px', 
                    fontSize: '12px', 
                    marginBottom: '14px',
                    border: '1px solid #FFE0D6'
                  }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                  <div style={{ marginBottom: '20px', position: 'relative' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '5px' }}>Email</label>
                    <input
                      type="email"
                      placeholder="username@gmail.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldError) validateEmail(e.target.value);
                      }}
                      onBlur={(e) => validateEmail(e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '9px 12px', 
                        borderRadius: '8px',
                        border: fieldError ? '1px solid #FF5722' : '1px solid #F0F0F0',
                        fontSize: '12px',
                        outline: 'none',
                        background: '#FAFAFA',
                        boxSizing: 'border-box',
                        transition: 'border-color 0.2s'
                      }}
                    />
                    {fieldError && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginTop: '8px',
                        background: '#FFFFFF',
                        borderRadius: '8px',
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
                        <span style={{ color: '#333', fontSize: '12px' }}>{fieldError}</span>
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
                      marginBottom: '16px'
                    }}
                  >
                    {isSubmitting ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </form>

                <div style={{ textAlign: 'center' }}>
                  <Link 
                    to="/login" 
                    style={{ 
                      color: '#FF5722', 
                      textDecoration: 'none', 
                      fontWeight: '600',
                      fontSize: '11px'
                    }}
                  >
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
            paddingLeft: '30px'
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
          @keyframes fadeIn {
            from { opacity: 0; transform: translateX(-50%) translateY(-5px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
          }
        `}
      </style>
    </div>
  );
};

export default ForgotPassword;

