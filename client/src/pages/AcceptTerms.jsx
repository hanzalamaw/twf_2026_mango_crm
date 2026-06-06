import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

const TERMS_CONTENT = `First-Time Login Terms & Conditions

By accessing and using the TWF CATTLE CRM system, you agree to the following terms and conditions. This system is the official digital management platform of The Warsi Farm and is strictly for authorized use only.

1. Authorized Access Only
• Access to this CRM is restricted to officially approved users.
• User accounts are role-based and permissions are granted according to designation.
• Sharing login credentials with any unauthorized individual is strictly prohibited.
Violation may result in immediate termination of access and disciplinary/legal action.

2. Data Confidentiality & Protection
This CRM contains sensitive business data including but not limited to:
• Customer information
• Order & transaction details
• Cow & Hissa allocation records
• Financial statements
• Procurement data
• Performance reports
• Internal operational processes
Users agree:
• Not to download, copy, export, or share any confidential data.
• Not to use CRM data for personal gain.
• Not to disclose business-sensitive information to competitors or external parties.

3. Financial & Transaction Integrity
All booking, procurement, sales, and expense entries must:
• Be accurate and entered in real time.
• Not be manipulated, altered, or deleted without authorization.
• Follow official operational SOPs.

4. Audit & Monitoring
• All actions performed in the CRM are logged.
• Super Admin has access to audit trails.
• User activity may be monitored for security and compliance purposes.
There is no expectation of privacy within the system.

5. System Usage Rules
Users must not:
• Attempt to bypass role restrictions.
• Modify source code or system configurations.
• Use automated scripts or bots.
• Upload malicious files.
• Attempt unauthorized access to other modules.

6. Operational Responsibility
Each department (Booking, Procurement, Finance, Operations, Farm, Performance) is responsible for maintaining data accuracy within their assigned modules.
Incorrect or delayed data entry may result in operational loss, for which the responsible user may be held accountable.

7. Password & Security Policy
• Passwords must remain confidential.
• Users must log out after completing work.
• Suspicious activity must be reported immediately.

8. Suspension & Termination
The organization reserves the right to:
• Suspend access without prior notice
• Revoke permissions
• Initiate disciplinary or legal action
• Permanently deactivate user accounts

9. Legal Compliance
This CRM and all related data are proprietary assets of The Warsi Farm.
Any misuse, theft, data leakage, manipulation, or system abuse may result in:
• Civil liability
• Criminal prosecution
• Financial penalties

10. Acceptance Declaration
By clicking "I Agree" and proceeding to the dashboard, you confirm that:
• You have read and understood these terms.
• You agree to comply with all system policies.
• You accept responsibility for all actions performed under your account.`;

const AcceptTerms = () => {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const containerRef = useRef(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawRedirect = searchParams.get('redirect') || '/';
  const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';

  const checkScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 20;
    setScrolledToBottom(atBottom);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll);
    return () => el.removeEventListener('scroll', checkScroll);
  }, []);

  const handleAccept = async () => {
    if (!scrolledToBottom || accepting) return;
    setAccepting(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/accept-terms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        login(data.user, token);
        navigate(redirectTo, { replace: true });
      } else {
        setAccepting(false);
      }
    } catch (err) {
      setAccepting(false);
    }
  };

  return (
    <div
      style={{
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
      }}
    >
      <div
        className="at-wrapper"
        style={{
          position: 'relative',
          width: 'calc(100vw - 48px)',
          height: 'calc(100vh - 96px)',
          maxWidth: '1000px',
        }}
      >
        {/* Back Card 2 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#FFE4DB',
            borderRadius: '24px',
            transform: 'rotate(2deg) translate(6px, 8px)',
            animation: 'cardDrift1 6s ease-in-out infinite',
            zIndex: 0,
          }}
        />

        {/* Back Card 1 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#FFEDE6',
            borderRadius: '22px',
            transform: 'rotate(-1.5deg) translate(-5px, -6px)',
            animation: 'cardDrift2 5s ease-in-out infinite',
            zIndex: 1,
          }}
        />

        {/* Main White Card */}
        <div
          className="at-card"
          style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            padding: '24px',
            boxSizing: 'border-box',
            zIndex: 2,
            boxShadow: '0 5px 25px rgba(0,0,0,0.04)',
          }}
        >
          {/* Header */}
          <div style={{ flexShrink: 0, marginBottom: '12px' }}>
            <p style={{ color: '#FF5722', fontSize: '12px', fontWeight: '500', margin: '0 0 4px 0' }}>TWF Mango CRM</p>
            <h1 className="at-title" style={{ fontSize: '24px', fontWeight: '700', color: '#333', margin: 0 }}>Terms & Conditions</h1>
            <p className="at-hint" style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>Please scroll to the bottom to accept.</p>
          </div>

          {/* Scrollable text */}
          <div
            ref={containerRef}
            onScroll={checkScroll}
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              border: '1px solid #F0F0F0',
              borderRadius: '12px',
              padding: '20px',
              background: '#FAFAFA',
              fontSize: '13px',
              lineHeight: 1.6,
              color: '#333',
            }}
          >
            {TERMS_CONTENT.split('\n').map((line, i) => {
              const isEmpty = line.trim() === '';
              const isHeading =
                !isEmpty &&
                (line === 'First-Time Login Terms & Conditions' ||
                  /^\d+\.\s+.+$/.test(line.trim()));
              return (
                <span
                  key={i}
                  style={{
                    display: 'block',
                    ...(isEmpty && { minHeight: '1em' }),
                  }}
                >
                  {isHeading ? <strong>{line}</strong> : line}
                </span>
              );
            })}
          </div>

          {/* Button */}
          <button
            type="button"
            disabled={!scrolledToBottom || accepting}
            onClick={handleAccept}
            style={{
              flexShrink: 0,
              width: '100%',
              padding: '12px',
              marginTop: '16px',
              background: scrolledToBottom && !accepting ? '#FF5722' : '#CCC',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: scrolledToBottom && !accepting ? 'pointer' : 'not-allowed',
            }}
          >
            {accepting ? 'Accepting...' : scrolledToBottom ? 'I Agree' : 'Scroll to the bottom to enable I Agree'}
          </button>
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

          /* ── Mobile ── */
          @media (max-width: 767px) {
            /* outer wrapper: switch from fixed-center to a full-screen column */
            .at-wrapper {
              width: calc(100vw - 32px) !important;
              height: calc(100dvh - 48px) !important;
              max-width: 100% !important;
            }

            .at-card {
              padding: 20px 16px !important;
            }

            .at-title {
              font-size: 20px !important;
            }

            .at-hint {
              font-size: 11px !important;
            }
          }

          /* very small phones (SE, Galaxy A series) */
          @media (max-width: 375px) {
            .at-wrapper {
              width: calc(100vw - 24px) !important;
              height: calc(100dvh - 32px) !important;
            }
            .at-card {
              padding: 16px 14px !important;
            }
          }
        `}
      </style>
    </div>
  );
};

export default AcceptTerms;