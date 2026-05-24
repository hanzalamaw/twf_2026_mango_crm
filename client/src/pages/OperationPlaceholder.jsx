export default function OperationPlaceholder({ title, subtitle }) {
  const pageShell = {
    padding: '16px 24px 32px',
    maxWidth: '1100px',
    margin: '0 auto',
    boxSizing: 'border-box',
    width: '100%',
  };

  const panelStyle = {
    background: '#FFFFFF',
    borderRadius: '18px',
    border: '1.5px solid #F0F0F0',
    boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
    padding: '24px 20px',
  };

  return (
    <div style={pageShell}>
      <div style={panelStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: '#111827', letterSpacing: '-0.3px' }}>
          {title}
        </h2>
        <p style={{ fontSize: '12px', color: '#9ca3af', margin: '8px 0 16px', fontWeight: '500', lineHeight: 1.4 }}>
          {subtitle || 'This module will be available in a future update.'}
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>Content coming soon.</p>
      </div>
    </div>
  );
}
