import React from 'react';

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 'clamp(8px, 2vw, 16px)',
};

const nowrapCell = { whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' };
const wrapCell = {
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  lineHeight: 1.45,
  maxWidth: '240px',
};

function AffluentPatch() {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'5px 12px', borderRadius:'999px', background:'#FFEBEE', color:'#C62828', border:'1px solid #FFCDD2', fontSize:'10px', fontWeight:'700', whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:'0.2px' }}>
      Affluent
    </span>
  );
}

function SpecialRequestPatch() {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'5px 12px', borderRadius:'999px', background:'#FFF8E1', color:'#F57F17', border:'1px solid #FFE082', fontSize:'10px', fontWeight:'700', whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:'0.2px' }}>
      Special Request
    </span>
  );
}

function valueOrDash(value) {
  const str = String(value ?? '').trim();
  return str || '—';
}

export default function SharedChallanModal({
  challanId,
  customerId,
  statusBadge,
  description,
  affluent = false,
  specialRequest = false,
  infoRows = [],
  orders = [],
  renderOrderStatus,
  onClose,
  children,
  title = 'Orders on this challan',
  maxWidth = '1320px',
}) {
  const normalizedDescription = String(description || '').replace(/\s*\|\s*/g, ' | ').replace(/[\r\n]+/g, ' | ').replace(/\s{2,}/g, ' ').trim();
  const hasDescription = Boolean(normalizedDescription);
  const isAffluent = Boolean(affluent);
  const isSpecialRequest = Boolean(specialRequest) && !isAffluent;

  return (
    <div className="ops-sheet-overlay" style={modalOverlayStyle} onClick={onClose} role="presentation">
      <div
        className="ops-sheet-panel"
        style={{ background:'#FFFFFF', borderRadius:'18px', border:'1.5px solid #F0F0F0', padding:'clamp(14px, 2vw, 24px)', maxWidth, width:'100%', maxHeight:'78dvh', overflowY:'auto', overflowX:'visible', boxShadow:'0 10px 40px rgba(0,0,0,0.12)' }}
        onClick={(e)=>e.stopPropagation()}
        role="dialog"
        aria-label={`Challan ${challanId || '—'}`}
      >
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px', gap:'16px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
              <h2 style={{ margin:0, fontSize:'18px', fontWeight:'700', color:'#222' }}>Challan {challanId || '—'}</h2>
              {isAffluent && <AffluentPatch />}
              {isSpecialRequest && <SpecialRequestPatch />}
            </div>
            <div style={{ marginTop:'7px', fontSize:'12px', color:'#666', fontWeight:'500' }}>
              Customer ID: <span style={{ color:'#222', fontWeight:'700' }}>{customerId || '—'}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background:'none', border:'none', fontSize:'26px', color:'#888', cursor:'pointer', lineHeight:1, width:'32px', height:'32px', flexShrink:0 }}>×</button>
        </div>

        {statusBadge && <div style={{ marginBottom:'16px' }}>{statusBadge}</div>}

        <div style={{ marginBottom:'18px' }}>
          <div style={{ border:'1px solid #E4E4E4', borderRadius:'10px', overflow:'hidden', background:'#F5F5F5' }}>
            <div style={{ display:'grid', gridTemplateColumns:'130px 1fr', gap:'0', padding:'14px 16px', fontSize:'12px', lineHeight:1.5 }}>
              <span style={{ fontWeight:'700', color:'#555' }}>Order Type:</span>
              <span style={{ color: hasDescription ? '#222' : '#aaa', fontStyle: hasDescription ? 'normal' : 'italic', whiteSpace:'normal', wordBreak:'break-word', overflowWrap:'anywhere' }}>{hasDescription ? normalizedDescription : '—'}</span>
            </div>
          </div>
        </div>

        <div
          className="modal-info-grid"
          style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0, border:'1px solid #E8E8E8', borderRadius:'10px', overflow:'hidden', marginBottom:'20px', fontSize:'12px' }}
        >
          {infoRows.map(([label, value], i) => {
            const isLeft = i % 2 === 0;
            const rowIndex = Math.floor(i / 2);
            const isLastRow = i >= infoRows.length - (infoRows.length % 2 === 0 ? 2 : 1);
            const rowBg = rowIndex % 2 === 0 ? '#FAFAFA' : '#FFF';
            return (
              <div
                key={`${label}-${i}`}
                style={{ display:'grid', gridTemplateColumns:'130px 1fr', alignItems:'flex-start', gap:'0', padding:'12px 16px', background: rowBg, borderRight: isLeft ? '1px solid #EFEFEF' : 'none', borderBottom: isLastRow ? 'none' : '1px solid #EFEFEF' }}
              >
                <span style={{ fontWeight:'700', color:'#555', paddingRight:'8px' }}>{label}:</span>
                <span style={{ color: valueOrDash(value) === 'Unassigned' ? '#aaa' : '#222', fontStyle: valueOrDash(value) === 'Unassigned' ? 'italic' : 'normal', wordBreak:'break-word', overflowWrap:'anywhere' }}>{valueOrDash(value)}</span>
              </div>
            );
          })}
        </div>

        {children}


        <style>{`
          .modal-table-scroll {
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            overflow-y: visible;
            -webkit-overflow-scrolling: touch;
          }
          .modal-orders-table {
            width: max-content !important;
            min-width: 100% !important;
            table-layout: auto !important;
          }
          .modal-orders-table th,
          .modal-orders-table td {
            max-width: 220px;
            white-space: normal !important;
            word-break: break-word;
            overflow-wrap: anywhere;
            vertical-align: top;
          }
          .modal-orders-table th { white-space: nowrap !important; }
          @media (max-width: 767px) {
            .modal-info-grid { grid-template-columns: 1fr !important; }
            .modal-orders-table th,
            .modal-orders-table td { max-width: 150px; font-size: 11px; padding: 8px 7px !important; }
          }
        `}</style>
        <div style={{ borderTop:'1px solid #f0f0f0', margin:'18px 0 12px' }} />
        <p style={{ margin:'0 0 10px', fontSize:'12px', fontWeight:'700', color:'#333' }}>{title}</p>
        <div className="modal-table-scroll ops-modal-table-wrap" style={{ border:'1px solid #F0F0F0', borderRadius:'10px' }}>
          <table className="modal-orders-table" style={{ fontSize:'12px', borderCollapse:'collapse' }}>
            
            <thead style={{ position:'sticky', top:0, zIndex:1 }}>
              <tr style={{ background:'#FAFAFA' }}>
                {['Description', 'Order', 'Contact', 'Alt Contact', 'Shareholder', 'Type', 'Cow #', 'Hissa #', 'Slot', 'Status'].map((h)=>(
                  <th key={h} style={{ textAlign:'left', padding:'9px 10px', fontWeight:'700', color:'#555', borderBottom:'1px solid #E0E0E0', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={10} style={{ padding:'22px', textAlign:'center', color:'#aaa' }}>No orders linked.</td></tr>
              ) : orders.map((o, i)=>(
                <tr key={o.order_id || i} style={{ borderBottom:'1px solid #F0F0F0', background: i%2===0 ? '#fff' : '#FAFAFA' }}>
                  <td style={{ padding:'9px 10px', color:'#333', ...wrapCell }}>{o.description || <span style={{ color:'#ccc' }}>—</span>}</td>
                  <td style={{ padding:'9px 10px', color:'#777', ...wrapCell }}>{o.order_id || '—'}</td>
                  <td style={{ padding:'9px 10px', color:'#555', ...nowrapCell }}>{o.contact || '—'}</td>
                  <td style={{ padding:'9px 10px', color:'#555', ...nowrapCell }}>{o.alt_contact || '—'}</td>
                  <td style={{ padding:'9px 10px', color:'#333', fontWeight:'500', ...wrapCell }}>{o.shareholder_name || o.booking_name || '—'}</td>
                  <td style={{ padding:'9px 10px', color:'#555', ...wrapCell }}>{o.order_type || '—'}</td>
                  <td style={{ padding:'9px 10px', color:'#555', ...nowrapCell }}>{o.cow_number || '—'}</td>
                  <td style={{ padding:'9px 10px', color:'#555', ...nowrapCell }}>{o.hissa_number || '—'}</td>
                  <td style={{ padding:'9px 10px', color:'#555', ...wrapCell }}>{o.slot || '—'}</td>
                  <td style={{ padding:'9px 10px', ...nowrapCell }}>{renderOrderStatus ? renderOrderStatus(o) : (o.delivery_status || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop:'22px', textAlign:'right' }}>
          <button type="button" onClick={onClose} style={{ padding:'9px 22px', background:'#FF5722', color:'#fff', border:'none', borderRadius:'8px', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  );
}
