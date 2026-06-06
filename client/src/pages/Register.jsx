import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import loginImage from '../assets/loginPageImage.png';
import { API_BASE } from '../config/api';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  const validateField = (name, value) => {
    const errors = { ...fieldErrors };
    
    if (name === 'username') {
      if (!value.trim()) {
        errors.username = 'Please fill out this field.';
      } else if (value.length < 3) {
        errors.username = 'Username must be at least 3 characters.';
      } else {
        errors.username = '';
      }
    }
    
    if (name === 'email') {
      if (!value.trim()) {
        errors.email = 'Please fill out this field.';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.email = 'Please enter a valid email address.';
      } else {
        errors.email = '';
      }
    }
    
    if (name === 'password') {
      if (!value.trim()) {
        errors.password = 'Please fill out this field.';
      } else if (value.length < 6) {
        errors.password = 'Password must be at least 6 characters.';
      } else {
        errors.password = '';
      }
    }
    
    if (name === 'confirmPassword') {
      if (!value.trim()) {
        errors.confirmPassword = 'Please fill out this field.';
      } else if (value !== formData.password) {
        errors.confirmPassword = 'Passwords do not match.';
      } else {
        errors.confirmPassword = '';
      }
    }
    
    setFieldErrors(errors);
    return !errors[name];
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      validateField(name, value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validate all fields
    const isUsernameValid = validateField('username', formData.username);
    const isEmailValid = validateField('email', formData.email);
    const isPasswordValid = validateField('password', formData.password);
    const isConfirmPasswordValid = validateField('confirmPassword', formData.confirmPassword);
    
    if (!isUsernameValid || !isEmailValid || !isPasswordValid || !isConfirmPasswordValid) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('Registration successful! Please login.');
        navigate('/login');
      } else {
        setError(data.message || 'Registration failed');
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
      padding: '32px 16px',
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
              <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#333', margin: 0 }}>Register</h1>
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
                  name="username"
                  placeholder="Enter username"
                  value={formData.username}
                  onChange={handleChange}
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

              <div style={{ marginBottom: '14px', position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '5px' }}>Email</label>
                <input
                  type="email"
                  name="email"
                  placeholder="username@gmail.com"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={(e) => validateField('email', e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '9px 12px', 
                    borderRadius: '6px',
                    border: fieldErrors.email ? '1px solid #FF5722' : '1px solid #F0F0F0',
                    fontSize: '10px',
                    outline: 'none',
                    background: '#FAFAFA',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                />
                {fieldErrors.email && (
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
                    <span style={{ color: '#333', fontSize: '12px' }}>{fieldErrors.email}</span>
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

              <div style={{ marginBottom: '14px', position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '5px' }}>Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleChange}
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
              </div>

              <div style={{ marginBottom: '16px', position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '5px' }}>Confirm Password</label>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  placeholder="Confirm Password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  onBlur={(e) => validateField('confirmPassword', e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '9px 12px', 
                    borderRadius: '6px',
                    border: fieldErrors.confirmPassword ? '1px solid #FF5722' : '1px solid #F0F0F0',
                    fontSize: '10px',
                    outline: 'none',
                    background: '#FAFAFA',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                />
                <button 
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                  {showConfirmPassword ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  )}
                </button>
                {fieldErrors.confirmPassword && (
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
                    <span style={{ color: '#333', fontSize: '12px' }}>{fieldErrors.confirmPassword}</span>
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
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  marginBottom: '16px'
                }}
              >
                {isSubmitting ? 'Registering...' : 'Register'}
              </button>
            </form>

            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: '#999' }}>
                Already have an account? <Link to="/login" style={{ color: '#FF5722', textDecoration: 'none', fontWeight: '600' }}>Login here</Link>
              </p>
            </div>
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

export default Register;

