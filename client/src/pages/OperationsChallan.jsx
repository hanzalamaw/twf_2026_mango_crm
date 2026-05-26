import { useCallback, useEffect, useMemo, useState } from 'react';
import { OpsSearchIcon } from '../components/OpsFilters';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';
import SharedChallanModal from '../components/SharedChallanModal';
import { API_BASE } from '../config/api';
import { useOperationsSocketRefresh } from '../utils/useOperationsSocketRefresh';
import { formatRiderCompact } from '../utils/riderFormat';
import QRCode from 'qrcode';
import {
  getDescriptionText,
  getOrderTag,
  getChallanRowHighlight,
  isAffluentOrder,
  isSpecialRequestOrder,
  normalizeForCompare,
  DAY_OPTIONS,
} from '../utils/orderTags';
import {
  buildSlotFilterOptions,
  itemMatchesDay,
  itemMatchesSlots,
  pruneSlotFilter,
  slotFilterValuesKey,
} from '../utils/operationsFilters';
import { useOperationsBatchDay } from '../utils/useOperationsBatchDay';
import OrderDescriptionCell from '../components/OrderDescriptionCell';
import {
  ALLOWED_ORDER_TYPES,
  ORDER_TYPE_FILTERS,
  challanMatchesOrderTypeFilter,
  computeModalTotals,
  formatTotalHissa,
  normalizeOrderType,
  isGoatHissaOrderType,
  partitionOrdersForChallanPrint,
  GOAT_HISSA_PREMIUM,
  GOAT_HISSA_SUPER,
  HISSA_COUNT_TABLE_HEADERS,
  getTableHissaCounts,
  hissaCountCellValues,
} from '../utils/operationsOrderTypes';

/** Display-only labels on printed challans/stickers (does not affect generation or stored types). */
const CHALLAN_PRINT_ORDER_TYPE_LABELS = {
  'Hissa - Standard': 'Hissa Ijtimai',
  [GOAT_HISSA_PREMIUM]: 'Goat 15 KG',
  [GOAT_HISSA_SUPER]: 'Goat 12 KG',
};

function stripDashesFromPrintLabel(text) {
  return String(text || '').replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatOrderTypeForChallanPrint(orderType) {
  const normalized = normalizeOrderType(orderType) || String(orderType || '').trim() || 'Hissa';
  const raw = CHALLAN_PRINT_ORDER_TYPE_LABELS[normalized] || normalized;
  return stripDashesFromPrintLabel(raw);
}

/** Order-type count lines for challan PDF info box (first-seen order, print labels). */
function buildChallanPrintOrderTypeSummary(orders) {
  const seen = [];
  const counts = new Map();
  for (const o of orders || []) {
    const t = normalizeOrderType(o?.order_type);
    if (!t) continue;
    if (!counts.has(t)) {
      seen.push(t);
      counts.set(t, 0);
    }
    counts.set(t, counts.get(t) + 1);
  }
  return seen.map((t) => ({
    label: formatOrderTypeForChallanPrint(t),
    count: counts.get(t),
    text: `${formatOrderTypeForChallanPrint(t)} - ${counts.get(t)}`,
  }));
}

function getChallanPrintInfoFields(c, orders, safe) {
  const uniqueJoin = (arr) =>
    [...new Set(arr.map((v) => String(v || '').trim()).filter(Boolean))].join(', ');
  const customerId =
    c.customer_ids_csv ||
    c.customer_id ||
    uniqueJoin(orders.map((o) => o.customer_id)) ||
    '—';
  const bookingName =
    c.booking_name ||
    uniqueJoin(orders.map((o) => o.booking_name)) ||
    '—';
  const contact =
    c.contacts_csv ||
    uniqueJoin(orders.map((o) => o.contact)) ||
    '';
  const altContact =
    c.alt_contacts_csv ||
    uniqueJoin(orders.map((o) => o.alt_contact)) ||
    '';
  return {
    customerId: safe(customerId, '—'),
    bookingName: safe(bookingName, '—'),
    contact: safe(contact, '—'),
    altContact: safe(altContact, '—'),
  };
}

const REGENERATE_EMAIL = 'hanzalamawahab@gmail.com';
const STATUS_STYLES = {
  Pending:            { bg: '#F5F5F5',  fg: '#666' },
  'Rider Assigned':   { bg: '#FFF8E1',  fg: '#F57C00' },
  Dispatched:         { bg: '#E3F2FD',  fg: '#1565C0' },
  Delivered:          { bg: '#E8F5E9',  fg: '#2E7D32' },
  'Returned to Farm': { bg: '#FFEBEE',  fg: '#C62828' },
};

function StatusBadge({ status }) {
  const st = status || 'Pending';
  const { bg, fg } = STATUS_STYLES[st] || STATUS_STYLES.Pending;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: '600', background: bg, color: fg, whiteSpace: 'nowrap' }}>
      {st}
    </span>
  );
}


function getRiderDetails(rider, fallbackName = 'Unassigned') {
  return {
    name: formatRiderCompact(rider, fallbackName),
  };
}

function getUniqueValues(values) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

function getUniqueDescriptionValues(values) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

function NoBadge({ number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', background: '#F5F5F5', color: '#666', whiteSpace: 'nowrap' }}>
      {number || '—'}
    </span>
  );
}

const PAGE_SIZE = 50;

function formatAddress(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function short(v, n = 64) {
  const s = String(v ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Header tag pill between challan title and QR — top-aligned, height fits text. */
function drawPdfHeaderTagBanner(doc, tag, gapStartX, gapEndX, topY) {
  const labels = {
    affluent: 'AFFLUENT',
    special_request: 'SPECIAL REQUEST',
  };
  const text = labels[tag];
  if (!text || gapEndX <= gapStartX + 48) return;

  const sideMargin = 16;
  const paddingX = 14;
  const paddingY = 6;
  const boxX = gapStartX + sideMargin;
  const boxW = gapEndX - gapStartX - sideMargin * 2;
  if (boxW < 48) return;

  doc.setFont('helvetica', 'bold');
  let fontSize = tag === 'special_request' ? 14 : 16;
  doc.setFontSize(fontSize);
  const maxTextW = boxW - paddingX * 2;
  let textW = doc.getTextWidth(text);
  while (textW > maxTextW && fontSize > 8) {
    fontSize -= 0.5;
    doc.setFontSize(fontSize);
    textW = doc.getTextWidth(text);
  }

  const textH = fontSize * 1.2;
  const boxH = textH + paddingY * 2;
  const boxY = topY;

  const isAffluent = tag === 'affluent';
  if (isAffluent) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1.2);
    doc.roundedRect(boxX, boxY, boxW, boxH, 4, 4, 'FD');
    doc.setTextColor(0, 0, 0);
  } else {
    doc.setFillColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);
    doc.roundedRect(boxX, boxY, boxW, boxH, 4, 4, 'FD');
    doc.setTextColor(255, 255, 255);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.text(text, boxX + boxW / 2, boxY + boxH / 2, { align: 'center', baseline: 'middle' });
}

/** Centered tag box for order sticker pages (above order type). */
function drawCenteredTagBox(doc, tag, centerX, topY, maxWidth) {
  const labels = {
    affluent: 'AFFLUENT',
    special_request: 'SPECIAL REQUEST',
  };
  const text = labels[tag];
  if (!text) return topY;

  const paddingX = 14;
  const paddingY = 6;
  doc.setFont('helvetica', 'bold');
  let fontSize = tag === 'special_request' ? 14 : 16;
  doc.setFontSize(fontSize);
  const maxTextW = maxWidth - paddingX * 2;
  let textW = doc.getTextWidth(text);
  while (textW > maxTextW && fontSize > 8) {
    fontSize -= 0.5;
    doc.setFontSize(fontSize);
    textW = doc.getTextWidth(text);
  }

  const boxW = textW + paddingX * 2;
  const boxH = fontSize * 1.2 + paddingY * 2;
  const boxX = centerX - boxW / 2;
  const isAffluent = tag === 'affluent';

  if (isAffluent) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1.2);
  } else {
    doc.setFillColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);
  }
  doc.roundedRect(boxX, topY, boxW, boxH, 4, 4, 'FD');
  doc.setTextColor(isAffluent ? 0 : 255, isAffluent ? 0 : 255, isAffluent ? 0 : 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.text(text, centerX, topY + boxH / 2, { align: 'center', baseline: 'middle' });

  const marginBottom = 28;
  return topY + boxH + marginBottom;
}

function getPrimarySlot(slotStr) {
  const parts = String(slotStr || '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts[0] || '';
}

function slotSortKey(slot) {
  const m = String(slot || '').match(/(\d+)/);
  return m ? Number(m[1]) : 9999;
}

function formatSlotDividerLabel(slot) {
  const s = getPrimarySlot(slot);
  const m = s.match(/slot\s*(\d+)/i);
  if (m) return `SLOT ${m[1]}`;
  const num = s.match(/^(\d+)$/);
  if (num) return `SLOT ${num[1]}`;
  return (s || 'SLOT').toUpperCase();
}

function compareChallanPrintOrder(a, b) {
  const slotA = getPrimarySlot(a?.slot);
  const slotB = getPrimarySlot(b?.slot);
  const sk = slotSortKey(slotA) - slotSortKey(slotB);
  if (sk !== 0) return sk;
  const areaCmp = String(a?.area || '').localeCompare(String(b?.area || ''), undefined, { sensitivity: 'base' });
  if (areaCmp !== 0) return areaCmp;
  return Number(a?.challan_id || 0) - Number(b?.challan_id || 0);
}

function sortPrintItems(items) {
  return [...items].sort((a, b) => compareChallanPrintOrder(a.challan, b.challan));
}

function sortChallanRowsForPrint(rows) {
  return [...rows].sort(compareChallanPrintOrder);
}

function getChallanCustomerFields(c, orders, safe) {
  const uniqueJoin = (arr) =>
    [...new Set(arr.map((v) => String(v || '').trim()).filter(Boolean))].join(', ');
  const customerId =
    c.customer_ids_csv ||
    c.customer_id ||
    uniqueJoin(orders.map((o) => o.customer_id)) ||
    '—';
  const customerName =
    c.booking_name ||
    uniqueJoin(orders.map((o) => o.booking_name)) ||
    '—';
  const primaryContact =
    c.contacts_csv ||
    uniqueJoin(orders.map((o) => o.contact)) ||
    '';
  const altContact =
    c.alt_contacts_csv ||
    uniqueJoin(orders.map((o) => o.alt_contact)) ||
    '';
  const contact = (() => {
    const p = safe(primaryContact, '');
    const a = safe(altContact, '');
    if (p && a) return `${p}  |  Alt: ${a}`;
    if (p) return p;
    if (a) return `Alt: ${a}`;
    return '—';
  })();
  return { customerId, customerName, contact };
}

function drawSlotDividerPage(doc, slot, PW, PH) {
  const label = formatSlotDividerLabel(slot);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(52);
  doc.setTextColor(0, 0, 0);
  doc.text(label, PW / 2, PH / 2, { align: 'center', baseline: 'middle' });
}

function drawStickerCheckbox(doc, x, y, label, lineEndX = null) {
  const boxSize = 11;
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.9);
  doc.rect(x, y - boxSize + 3, boxSize, boxSize);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(35, 35, 35);
  const textX = x + boxSize + 8;
  doc.text(label, textX, y);
  if (lineEndX != null && label.endsWith(':')) {
    const lineStart = textX + doc.getTextWidth(label) + 4;
    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.8);
    doc.line(lineStart, y + 3, lineEndX, y + 3);
  }
}

function drawOrderStickerPage(doc, layout, item, order, helpers) {
  const { PW, PH, ML, MR, CONTENT_W } = layout;
  const { safe, split, getChallanCustomerFields: getFields } = helpers;
  const c = item.challan || {};
  const orders = Array.isArray(item.orders) ? item.orders : [];
  const { customerId, customerName, contact } = getFields(c, orders, safe);

  const orderTypeNorm = formatOrderTypeForChallanPrint(order.order_type);
  const shareholder = safe(order.shareholder_name || order.booking_name, '—');
  const shareDesc = safe(order.description);
  const tagSource = {
    ...c,
    orders,
    description: getDescriptionText({ ...c, orders }),
  };
  const stickerTag = getOrderTag(tagSource, 'total_hissa', 'total_waqf_hissa');

  let y = 52;
  const centerX = PW / 2;
  const contentMaxW = CONTENT_W - 48;

  if (stickerTag) {
    y = drawCenteredTagBox(doc, stickerTag, centerX, y, contentMaxW);
  }

  const typeLines = split(orderTypeNorm, contentMaxW).slice(0, 3);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(0, 0, 0);
  typeLines.forEach((line, i) => {
    doc.text(line, centerX, y + i * 34, { align: 'center' });
  });
  y += typeLines.length * 34 + 10;

  if (shareDesc) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(50, 50, 50);
    const descLines = split(shareDesc, contentMaxW).slice(0, 4);
    descLines.forEach((line, i) => {
      doc.text(line, centerX, y + i * 18, { align: 'center' });
    });
    y += descLines.length * 18 + 4;
  }

  y += 8;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(1);
  doc.line(ML, y, MR, y);
  y += 24;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(`Challan # ${safe(c.challan_id, '')}`, ML, y);
  if (order.order_id) {
    doc.text(`Order # ${order.order_id}`, MR, y, { align: 'right' });
  }
  y += 22;

  const boxY = y;
  const midX = ML + CONTENT_W / 2;
  const leftX = ML + 20;
  const rightX = midX + 20;
  const colMaxW = CONTENT_W / 2 - 44;

  const drawStickerInfoCell = (label, value, x, yPos) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(25, 25, 25);
    doc.text(`${label}:`, x, yPos);
    const labelW = doc.getTextWidth(`${label}: `);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(45, 45, 45);
    const lines = doc.splitTextToSize(safe(value), colMaxW - labelW - 4).slice(0, 3);
    doc.text(lines, x + labelW + 4, yPos);
    return 14 * lines.length;
  };

  const infoRows = [
    ['Customer ID', customerId, 'Address', c.address || '—'],
    ['Customer Name', customerName, 'Area', c.area || '—'],
    ['Contact', contact, 'Shareholder', shareholder],
  ];
  let boxH = 28;
  infoRows.forEach(([ll, lv, rl, rv]) => {
    boxH += Math.max(
      doc.splitTextToSize(safe(lv), colMaxW).length,
      doc.splitTextToSize(safe(rv), colMaxW).length
    ) * 14 + 12;
  });

  doc.setFillColor(252, 252, 252);
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.8);
  doc.roundedRect(ML, boxY, CONTENT_W, boxH, 6, 6, 'FD');
  doc.setDrawColor(235, 235, 235);
  doc.line(midX, boxY + 12, midX, boxY + boxH - 12);

  let rowY = boxY + 22;
  infoRows.forEach(([ll, lv, rl, rv]) => {
    const lh = drawStickerInfoCell(ll, lv, leftX, rowY);
    const rh = drawStickerInfoCell(rl, rv, rightX, rowY);
    rowY += Math.max(lh, rh) + 12;
  });

  const bottomMid = ML + CONTENT_W / 2;
  const leftColX = ML + 8;
  const rightColX = bottomMid + 16;
  const rightColW = MR - rightColX - 8;
  const sigLineEnd = bottomMid - 24;

  const drawSigLine = (label, yPos) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(label, leftColX, yPos);
    const labelW = doc.getTextWidth(label);
    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.8);
    doc.line(leftColX + labelW + 4, yPos + 3, sigLineEnd, yPos + 3);
  };

  const includesBoxY = boxY + boxH + 32;
  const includesOptions = [
    'In Bone Meat',
    'Boneless Meat',
    'Paye',
    'Kaleji & Dil',
  ];
  const optionLineH = 22;
  const includesBoxH = 28 + includesOptions.length * optionLineH + optionLineH + 16;

  doc.setFillColor(252, 252, 252);
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.8);
  doc.roundedRect(rightColX, includesBoxY, rightColW, includesBoxH, 6, 6, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(25, 25, 25);
  doc.text('This Box Includes:', rightColX + 14, includesBoxY + 22);

  let optY = includesBoxY + 40;
  includesOptions.forEach((opt) => {
    drawStickerCheckbox(doc, rightColX + 14, optY, opt);
    optY += optionLineH;
  });
  drawStickerCheckbox(doc, rightColX + 14, optY, 'Other:', rightColX + rightColW - 14);

  const includesBottom = includesBoxY + includesBoxH;
  const verifiedByY = includesBottom - 3;
  drawSigLine('Checked & Verified By:', verifiedByY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(160, 160, 160);
  doc.text('THE WARSI FARM — paste on physical order', ML, PH - 28);
}

/* ─────────────────────────────────────────────
   renderChallanPagesForOrders — challan list page(s) for one order-type section
   ───────────────────────────────────────────── */
async function renderChallanPagesForOrders(doc, ctx, item, orders, { isPrimaryChallanPage = false } = {}) {
  const { PW, PH, ML, MR, CONTENT_W, safe, split, drawLineValue, nextPage } = ctx;
  const c = item.challan || {};
  const orderList = Array.isArray(orders) ? orders : [];

  const allOrdersForSummary = Array.isArray(item.orders) ? item.orders : orderList;
  const modalPdfTotals = computeModalTotals(c, allOrdersForSummary);
  const totalHissaText = String(modalPdfTotals.total ?? 0);
  const orderTypeSummaryLines = buildChallanPrintOrderTypeSummary(allOrdersForSummary);
  const tagSource = { ...c, orders: orderList, description: getDescriptionText({ ...c, orders: orderList }) };
  const challanTag = getOrderTag(tagSource, 'total_hissa', 'total_waqf_hissa');

  const { customerId, bookingName, contact, altContact } = getChallanPrintInfoFields(c, allOrdersForSummary, safe);

  let pageNo = 0;
  let orderIndex = 0;

  while (orderIndex < Math.max(orderList.length, 1)) {
    nextPage();
    pageNo++;
  
        const titleText = `CHALLAN # ${safe(c.challan_id, '')}`;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(19);
        doc.setTextColor(0, 0, 0);
        doc.text(titleText, ML, 42);
        const titleW = doc.getTextWidth(titleText);

        const qrSize = 76;
        const qrX = MR - qrSize - 8;
        const qrY = 18;
        const qrBottomY = qrY + qrSize;
        const bannerStartX = ML + titleW + 10;
        const bannerEndX = qrX - 8;
        const titleTopY = 42 - 19 * 0.78;

        if (challanTag === 'affluent' || challanTag === 'special_request') {
          drawPdfHeaderTagBanner(doc, challanTag, bannerStartX, bannerEndX, titleTopY);
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text('THE WARSI FARM', ML, 58);

        // QR
        const qrToken = c.qr_token || c.challan_token || '';
        const qrText = qrToken
          ? `${window.location.origin}/operations/deliveries?challan=${encodeURIComponent(qrToken)}`
          : `CHALLAN-${safe(c.challan_id, '')}`;

        try {
          const qrDataUrl = await QRCode.toDataURL(qrText, {
            margin: 0,
            width: 160,
            errorCorrectionLevel: 'M',
          });
          doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
        } catch {
          doc.rect(qrX, qrY, qrSize, qrSize);
          doc.setFontSize(7);
          doc.text('QR', qrX + qrSize / 2, qrY + qrSize / 2 + 2, { align: 'center' });
        }

        const continuationGapBelowQr = 44;
        let y = pageNo === 1 ? Math.max(112, qrBottomY + 18) : qrBottomY + continuationGapBelowQr;
  
        // Print customer/rider info ONLY ON FIRST PAGE
        if (pageNo === 1) {
          const boxX = ML;
          const boxY = y;
          const midX = ML + CONTENT_W / 2;
          const leftX = boxX + 24;
          const rightX = midX + 24;
          const colMaxW = CONTENT_W / 2 - 48;
          const INFO_LABEL_SIZE = 11;
          const INFO_VALUE_SIZE = 12;
          const INFO_LINE_H = 17;
          const INFO_ROW_GAP = 10;
          const INFO_WRAP_GAP = 6;

          const measurePlainLines = (lines, maxW) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(INFO_VALUE_SIZE);
            return (lines || []).reduce((sum, text) => {
              if (text == null) return sum + INFO_LINE_H;
              const wrapped = doc.splitTextToSize(safe(text), maxW).slice(0, 3);
              const wrapExtra = wrapped.length > 1 ? INFO_WRAP_GAP : 0;
              return sum + INFO_LINE_H * wrapped.length + wrapExtra;
            }, 0);
          };

          const measureLabeledBlock = (label, value, inline = false) => {
            if (inline) return INFO_LINE_H + INFO_ROW_GAP;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(INFO_LABEL_SIZE);
            const labelH = INFO_LINE_H;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(INFO_VALUE_SIZE);
            const valueLines = doc.splitTextToSize(safe(value), colMaxW).slice(0, 3);
            const wrapExtra = valueLines.length > 1 ? INFO_WRAP_GAP : 0;
            return labelH + INFO_LINE_H * valueLines.length + wrapExtra + INFO_ROW_GAP;
          };

          const drawPlainLines = (lines, x, startY, maxW) => {
            let yPos = startY;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(INFO_VALUE_SIZE);
            doc.setTextColor(20, 20, 20);
            for (const text of lines) {
              if (text == null) {
                yPos += INFO_LINE_H;
                continue;
              }
              const wrapped = doc.splitTextToSize(safe(text), maxW).slice(0, 3);
              doc.text(wrapped, x, yPos);
              const wrapExtra = wrapped.length > 1 ? INFO_WRAP_GAP : 0;
              yPos += INFO_LINE_H * wrapped.length + wrapExtra;
            }
            return yPos;
          };

          const drawLabeledBlock = (label, value, x, startY, inline = false) => {
            if (inline) {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(INFO_LABEL_SIZE);
              doc.setTextColor(20, 20, 20);
              const labelText = `${label}: `;
              doc.text(labelText, x, startY);
              const labelW = doc.getTextWidth(labelText);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(INFO_VALUE_SIZE);
              doc.setTextColor(30, 30, 30);
              doc.text(safe(value), x + labelW, startY);
              return startY + INFO_LINE_H + INFO_ROW_GAP;
            }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(INFO_LABEL_SIZE);
            doc.setTextColor(20, 20, 20);
            doc.text(`${label}:`, x, startY);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(INFO_VALUE_SIZE);
            doc.setTextColor(30, 30, 30);
            const valueLines = doc.splitTextToSize(safe(value), colMaxW).slice(0, 3);
            const valueY = startY + INFO_LINE_H;
            doc.text(valueLines, x, valueY);
            const wrapExtra = valueLines.length > 1 ? INFO_WRAP_GAP : 0;
            return valueY + INFO_LINE_H * valueLines.length + wrapExtra + INFO_ROW_GAP;
          };

          const leftLines = [
            customerId,
            null,
            bookingName,
            null,
            contact,
            altContact,
            null,
            c.area || '—',
          ];
          const rightBlocks = [
            { label: 'Address', value: c.address || '—' },
            { label: 'Total Hissa', value: totalHissaText, inline: true },
            ...orderTypeSummaryLines.map((line) => ({ label: null, value: line.text })),
          ];

          const leftH = measurePlainLines(leftLines, colMaxW) + 16;
          const rightH = rightBlocks.reduce(
            (sum, block) =>
              sum
              + (block.label
                ? measureLabeledBlock(block.label, block.value, block.inline)
                : measurePlainLines([block.value], colMaxW) + INFO_ROW_GAP),
            16
          );
          const boxH = Math.max(leftH, rightH, 120);

          doc.setFillColor(252, 252, 252);
          doc.setDrawColor(215, 215, 215);
          doc.setLineWidth(0.8);
          doc.roundedRect(boxX, boxY, CONTENT_W, boxH, 6, 6, 'FD');

          doc.setDrawColor(235, 235, 235);
          doc.line(midX, boxY + 14, midX, boxY + boxH - 14);

          let leftY = boxY + 26;
          leftY = drawPlainLines(leftLines, leftX, leftY, colMaxW);

          let rightY = boxY + 26;
          for (const block of rightBlocks) {
            if (block.label) {
              rightY = drawLabeledBlock(block.label, block.value, rightX, rightY, block.inline);
            } else {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(INFO_VALUE_SIZE);
              doc.setTextColor(30, 30, 30);
              const wrapped = doc.splitTextToSize(safe(block.value), colMaxW).slice(0, 2);
              doc.text(wrapped, rightX, rightY);
              const wrapExtra = wrapped.length > 1 ? INFO_WRAP_GAP : 0;
              rightY += INFO_LINE_H * wrapped.length + wrapExtra + INFO_ROW_GAP;
            }
          }

          y = boxY + boxH + 32;
  
          drawLineValue('Rider Name', '', ML + 4, y, ML + 250);
          drawLineValue('Vehicle', '', midX + 18, y, MR);
  
          y += 28;
        } else {
          // continuation pages: extra space below QR so table does not crowd the code
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(90, 90, 90);
          doc.text(`Continuation of Challan # ${safe(c.challan_id, '')}`, ML, qrBottomY + 18);
          y = qrBottomY + continuationGapBelowQr;
        }
  
        // Table header
        const tableY = y;
        const headerH = 28;
  
        doc.setFillColor(250, 250, 250);
        doc.roundedRect(ML, tableY, CONTENT_W, headerH, 4, 4, 'F');
        doc.setDrawColor(215, 215, 215);
        doc.roundedRect(ML, tableY, CONTENT_W, headerH, 4, 4);
  
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(30, 30, 30);
  
        const col1X = ML + 16;
        const col2X = ML + 235;
        const col3X = MR - 44;
  
        doc.text('SHAREHOLDER NAME', col1X, tableY + 18);
        doc.text('ORDER TYPE', col2X, tableY + 18);
        doc.text('QUANTITY', col3X, tableY + 18, { align: 'center' });
  
        y = tableY + headerH + 14;
  
        const footerSpace = 88;
        const maxY = PH - footerSpace;
        const minRowH = 48;
        const col1MaxW = 180;
        const col2MaxW = 250;
  
        const measureOrderRow = (o) => {
          const nameLines = split(o.shareholder_name || o.booking_name || '—', col1MaxW).slice(0, 2);
          const shareDesc = safe(o.description);
          const shareDescLines = shareDesc ? split(shareDesc, col1MaxW).slice(0, 4) : [];
          const orderType = formatOrderTypeForChallanPrint(o.order_type);
          const day = o.day ? ` (${o.day})` : '';
          const mainDesc = `${orderType}${day}`;
          const mainLines = split(mainDesc, col2MaxW).slice(0, 2);
          const isGoat = isGoatHissaOrderType(o.order_type);
          const subDesc = [
            o.cow_number ? `${isGoat ? 'Goat' : 'Cow'}: ${o.cow_number}` : null,
            !isGoat && o.hissa_number ? `Hissa: ${o.hissa_number}` : null,
          ].filter(Boolean).join('  |  ');
          const subLines = split(subDesc || '—', col2MaxW).slice(0, 2);
          const leftH = 14 + nameLines.length * 12 + (shareDescLines.length ? 4 + shareDescLines.length * 11 : 0);
          const rightH = 14 + mainLines.length * 12 + (subLines.length ? 4 + subLines.length * 11 : 0);
          return Math.max(minRowH, leftH + 10, rightH + 10);
        };
  
        if (!orderList.length) {
          doc.setFillColor(247, 248, 250);
          doc.roundedRect(ML, y, CONTENT_W, minRowH, 4, 4, 'F');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(120, 120, 120);
          doc.text('No orders linked to this challan.', ML + CONTENT_W / 2, y + 28, { align: 'center' });
          orderIndex = 1;
        } else {
          while (orderIndex < orderList.length) {
            const o = orderList[orderIndex];
            const rowH = measureOrderRow(o);
            if (y + rowH > maxY) break;
  
            doc.setFillColor(247, 248, 250);
            doc.roundedRect(ML, y, CONTENT_W, rowH, 4, 4, 'F');
  
            const nameLines = split(o.shareholder_name || o.booking_name || '—', col1MaxW).slice(0, 2);
            const shareDesc = safe(o.description);
            const shareDescLines = shareDesc ? split(shareDesc, col1MaxW).slice(0, 4) : [];
  
            let col1Y = y + 16;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(25, 25, 25);
            doc.text(nameLines, col1X, col1Y);
            col1Y += nameLines.length * 12;
  
            if (shareDescLines.length) {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(8.5);
              doc.setTextColor(95, 95, 95);
              doc.text(shareDescLines, col1X, col1Y + 3);
            }
  
            const orderType = formatOrderTypeForChallanPrint(o.order_type);
            const day = o.day ? ` (${o.day})` : '';
            const mainDesc = `${orderType}${day}`;
            const mainLines = split(mainDesc, col2MaxW).slice(0, 2);
            const isGoat = isGoatHissaOrderType(o.order_type);
            const subDesc = [
              o.cow_number ? `${isGoat ? 'Goat' : 'Cow'}: ${o.cow_number}` : null,
              !isGoat && o.hissa_number ? `Hissa: ${o.hissa_number}` : null,
            ].filter(Boolean).join('  |  ');
            const subLines = split(subDesc || '—', col2MaxW).slice(0, 2);
  
            let col2Y = y + 16;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(25, 25, 25);
            doc.text(mainLines, col2X, col2Y);
            col2Y += mainLines.length * 12 + 2;
  
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(95, 95, 95);
            doc.text(subLines, col2X, col2Y);
  
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(25, 25, 25);
            doc.text('1', col3X, y + rowH / 2 + 2, { align: 'center' });
  
            y += rowH + 10;
            orderIndex++;
          }
        }
  
        if (pageNo === 1 && isPrimaryChallanPage) {
          const footerY = PH - 48;
          const sigMidX = ML + CONTENT_W / 2;
          drawLineValue('Approval Stamp:', '', ML + 4, footerY, sigMidX - 20);
          drawLineValue('Customer Signature (Upon Receiving):', '', sigMidX + 18, footerY, MR - 8);
        } else if (orderIndex >= Math.max(orderList.length, 1) && !isPrimaryChallanPage) {
          const footerY = PH - 48;
          const sigMidX = ML + CONTENT_W / 2;
          drawLineValue('Approval Stamp:', '', ML + 4, footerY, sigMidX - 20);
          drawLineValue('Customer Signature (Upon Receiving):', '', sigMidX + 18, footerY, MR - 8);
        }
  
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(160, 160, 160);
        doc.text(`Page ${pageNo}`, MR, PH - 20, { align: 'right' });
  }
}

/* ─────────────────────────────────────────────
   generatePdf  –  cow section, then goat section per challan
   ───────────────────────────────────────────── */
async function generatePdf(items, options = {}) {
  const { includeSlotDividers = false } = options;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const PW = 595.28;
  const PH = 841.89;
  const ML = 36;
  const MR = PW - 36;
  const CONTENT_W = MR - ML;

  const safe = (v, fallback = '') => {
    const s = String(v ?? '').trim();
    return s || fallback;
  };

  const split = (text, maxWidth) => doc.splitTextToSize(safe(text), maxWidth);

  const drawLineValue = (label, value, x, y, lineEndX) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(`${label}:`, x, y);

    const labelW = doc.getTextWidth(`${label}: `);
    const valueX = x + labelW + 6;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(35, 35, 35);

    const valueLines = split(value || '', lineEndX - valueX - 4).slice(0, 1);
    if (valueLines.length) doc.text(valueLines, valueX, y);

    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.8);
    doc.line(valueX, y + 4, lineEndX, y + 4);
  };

  const sortedItems = sortPrintItems(items);
  let firstPage = true;
  const nextPage = () => {
    if (!firstPage) doc.addPage();
    firstPage = false;
  };
  let lastSlotKey = null;
  const layout = { PW, PH, ML, MR, CONTENT_W };
  const pdfHelpers = { safe, split, getChallanCustomerFields };
  const ctx = { PW, PH, ML, MR, CONTENT_W, safe, split, drawLineValue, nextPage };

  for (const item of sortedItems) {
    const c = item.challan || {};
    const allOrders = Array.isArray(item.orders) ? item.orders : [];

    const primarySlot = getPrimarySlot(c.slot);
    const slotKey = `${slotSortKey(primarySlot)}|${primarySlot}`;
    if (includeSlotDividers && slotKey !== lastSlotKey) {
      nextPage();
      drawSlotDividerPage(doc, primarySlot, PW, PH);
      lastSlotKey = slotKey;
    }

    const { cow, goat, other } = partitionOrdersForChallanPrint(allOrders);
    const sections = [
      { orders: cow },
      { orders: goat },
      { orders: other },
    ].filter((s) => s.orders.length > 0);

    const printSections = sections.length
      ? sections
      : [{ orders: [] }];

    let isFirstChallanSection = true;
    for (const { orders: sectionOrders } of printSections) {
      await renderChallanPagesForOrders(doc, ctx, item, sectionOrders, {
        isPrimaryChallanPage: isFirstChallanSection,
      });
      isFirstChallanSection = false;
      for (const o of sectionOrders) {
        nextPage();
        drawOrderStickerPage(doc, layout, item, o, pdfHelpers);
      }
    }
  }

  doc.save(`challan-${new Date().toISOString().slice(0, 10)}.pdf`);
}

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', background: '#fff' };

function MultiSelectDropdown({ label, options = [], values = [], onChange, placeholder = 'All', width = 170 }) {
  const [open, setOpen] = useState(false);
  const selectedValues = Array.isArray(values) ? values : [];
  const selectedCount = selectedValues.length;
  const toggleValue = (value) => {
    onChange(selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value]
    );
  };
  return (
    <div style={{ width, minWidth: width, position: 'relative' }}>
      {label && <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${open ? '#FF5722' : '#e0e0e0'}`, background: '#fff', fontSize: '11px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', color: selectedCount ? '#FF5722' : '#555', fontWeight: selectedCount ? '600' : '400' }}
      >
        <span>{selectedCount ? `${selectedCount} selected` : placeholder}</span>
        <span style={{ fontSize: '8px', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 80, left: 0, top: 'calc(100% + 4px)', minWidth: '100%', width: 'max-content', maxWidth: '280px', maxHeight: '220px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', padding: '6px 4px', boxShadow: '0 6px 18px rgba(0,0,0,0.1)' }}>
          {selectedCount > 0 && (
            <div
              onClick={() => onChange([])}
              style={{ padding: '5px 10px', fontSize: '10px', color: '#FF5722', cursor: 'pointer', fontWeight: '600', borderBottom: '1px solid #f5f5f5', marginBottom: '2px' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#fff4f0'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Clear selection
            </div>
          )}
          {options.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: '10px', color: '#aaa' }}>No options available</div>
          ) : options.map((opt) => {
            const isSelected = selectedValues.includes(opt.value);
            return (
              <label
                key={opt.value}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', fontSize: '10px', cursor: 'pointer', borderRadius: '5px', background: isSelected ? '#FFF4F0' : 'transparent', color: isSelected ? '#FF5722' : '#333', fontWeight: isSelected ? '600' : '400' }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#fafafa'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? '#FFF4F0' : 'transparent'; }}
              >
                <input type="checkbox" checked={isSelected} onChange={() => toggleValue(opt.value)} style={{ cursor: 'pointer', accentColor: '#FF5722' }} />
                {opt.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function splitUniqueCsvValues(values) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .flatMap((v) => Array.isArray(v) ? v : String(v || '').split(','))
    .map((v) => String(v || '').trim())
    .filter(Boolean))];
}

function MultiLineCell({ values, empty = '—', style = {} }) {
  const list = splitUniqueCsvValues(values);
  if (!list.length) return <span style={{ color: '#ccc' }}>{empty}</span>;
  return (
    <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.45, ...style }}>
      {list.map((v, i) => <div key={`${v}-${i}`}>{v}</div>)}
    </div>
  );
}


export default function OperationsChallan() {
  const { user, authFetch } = useAuth();
  const emailOk = (user?.email || '').trim().toLowerCase() === REGENERATE_EMAIL;

  const {
    dayBatches,
    selectedDay,
    setSelectedDay,
    selectedBatch,
    setSelectedBatch,
    loadBatches,
  } = useOperationsBatchDay(authFetch);

  const [challans,      setChallans]      = useState([]);
  const [riders,        setRiders]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [msg,           setMsg]           = useState('');
  const [err,           setErr]           = useState('');
  const [busy,          setBusy]          = useState(false);
  const [confirmRegen,  setConfirmRegen]  = useState(false);

  const [search,      setSearch]      = useState('');
  const [challanSearch, setChallanSearch] = useState('');
  const [filterDay,   setFilterDay]   = useState('Day 1');
  const [generateDay, setGenerateDay] = useState('Day 1');
  const [filterSlot,  setFilterSlot]  = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);
  const [filterOrderType, setFilterOrderType] = useState([]);
  const [page,        setPage]        = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [modal,       setModal]       = useState(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    if (selectedDay) {
      setFilterDay(selectedDay);
      setGenerateDay(selectedDay);
    }
  }, [selectedDay]);

  const loadRiders = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/operations/riders`);
      if (res.ok) setRiders(await res.json());
    } catch { /* silent */ }
  }, [authFetch]);

  const load = useCallback(async () => {
    setErr(''); setLoading(true);
    try {
      const qs = selectedBatch ? `?batch_id=${selectedBatch}` : '';
      const res = await authFetch(`${API_BASE}/operations/challans${qs}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to load challans');
      const data = await res.json();
      setChallans(data.challans || []);
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch, selectedBatch]);

  useEffect(() => { loadRiders(); }, []);
  useEffect(() => { if (selectedBatch !== null) load(); }, [load, selectedBatch]);

  useOperationsSocketRefresh(() => {
    loadBatches();
    loadRiders();
    if (selectedBatch !== null) load();
  }, [load, loadBatches, loadRiders, selectedBatch]);

  const riderMap = useMemo(() => {
    const m = {};
    riders.forEach((r) => { m[r.rider_id] = r.rider_name; });
    return m;
  }, [riders]);

  const riderDetailMap = useMemo(() => {
    const m = {};
    riders.forEach((r) => { m[r.rider_id] = r; });
    return m;
  }, [riders]);

  const modalCustomerIds = useMemo(() => {
    const fromOrders = getUniqueValues((modal?.orders || []).map((o) => o.customer_id));
    const fromChallan = getUniqueValues(String(modal?.challan?.customer_ids_csv || modal?.challan?.customer_id || '').split(','));
    return fromOrders.length ? fromOrders : fromChallan;
  }, [modal]);

  const modalRiderDetails = useMemo(() => {
    if (!modal) return getRiderDetails(null);
    const rider = modal.rider || riderDetailMap[modal.challan?.rider_id];
    return getRiderDetails(
      rider,
      modal.challan?.rider_count > 1 ? 'Multiple Riders' : 'Unassigned'
    );
  }, [modal, riderDetailMap]);

  const modalTotals = useMemo(
    () => (modal ? computeModalTotals(modal.challan, modal.orders) : null),
    [modal]
  );

  const dayOptions  = useMemo(() => [...new Set(challans.map((c) => String(c.day || '').trim()).filter(Boolean))].sort(), [challans]);
  const slotFilterOptions = useMemo(
    () => buildSlotFilterOptions(challans, filterDay),
    [challans, filterDay]
  );

  const slotOptionsKey = useMemo(
    () => slotFilterValuesKey(slotFilterOptions),
    [slotFilterOptions]
  );

  useEffect(() => {
    setFilterSlot((prev) => pruneSlotFilter(prev, slotFilterOptions.map((o) => o.value)));
  }, [filterDay, slotOptionsKey]);
  const statusFilterOptions = useMemo(() => STATUS_STYLES ? Object.keys(STATUS_STYLES).map((s) => ({ value: s, label: s })) : [], []);

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const challanQ = challanSearch.trim().toLowerCase();
    return challans.filter((c) => {
      if (filterDay && !itemMatchesDay(c, filterDay)) return false;
      if (filterSlot.length && !itemMatchesSlots(c, filterSlot, filterDay)) return false;
      if (filterOrderType.length && !challanMatchesOrderTypeFilter(c, filterOrderType)) return false;
      if (filterStatus.length && !filterStatus.includes(challanDerivedStatus(c))) return false;
      if (q) {
        const hay = [c.address, c.area, c.day, c.slot, c.booking_name, c.shareholders_csv, c.contacts_csv, c.alt_contacts_csv, c.customer_ids_csv, c.description].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (challanQ && !String(c.challan_id || '').toLowerCase().includes(challanQ)) return false;
      return true;
    });
  }, [challans, search, challanSearch, filterDay, filterSlot, filterStatus, filterOrderType]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const pagedRows  = useMemo(() => displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [displayRows, page]);
  useEffect(() => { setPage(1); }, [search, challanSearch, filterDay, filterSlot, filterStatus, filterOrderType, selectedBatch]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const toggleOne = (id) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => {
    const allSel = displayRows.length > 0 && displayRows.every((c) => selectedIds.has(c.challan_id));
    setSelectedIds(allSel ? new Set() : new Set(displayRows.map((c) => c.challan_id)));
  };
  const allFilteredSelected = displayRows.length > 0 && displayRows.every((c) => selectedIds.has(c.challan_id));

  const modalDescription = useMemo(() => getDescriptionText({ ...(modal?.challan || {}), orders: modal?.orders || [] }), [modal]);

  const openChallanModal = async (token) => {
    if (!token) return;
    setErr('');
    const res = await authFetch(`${API_BASE}/operations/challans/by-token/${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.message || 'Challan not found'); return; }
    setModal(data);
  };

  const doRegenerate = async () => {
    setConfirmRegen(false); setBusy(true); setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/regenerate-from-orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: generateDay }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Regenerate failed');
      setMsg(`Batch "${data.batch_label}" created — ${data.groups ?? 0} challan groups for ${generateDay}.`);
      await loadBatches();
      if (data.batch_id) setSelectedBatch(data.batch_id);
    } catch (e) { setErr(e.message || 'Regenerate failed'); }
    setBusy(false);
  };

  const onPrintPdf = async () => {
    if (!selectedBatch) return alert('Select a batch first.');
    const printAll = selectedIds.size === 0;
    const rowsToPrint = printAll
      ? displayRows
      : displayRows.filter((c) => selectedIds.has(c.challan_id));
    if (!rowsToPrint.length) {
      return alert(
        printAll
          ? 'No challans match the current batch, day, and filters.'
          : 'Select at least one visible challan to print, or clear selection to print all filtered challans.'
      );
    }
    setBusy(true); setErr('');
    try {
      const body = {
        batch_id: selectedBatch,
        challan_ids: sortChallanRowsForPrint(rowsToPrint).map((c) => c.challan_id),
      };
      const res = await authFetch(`${API_BASE}/operations/challans/bulk-detail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not build PDF');
      if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('No data to print');
      await generatePdf(data.items, { includeSlotDividers: printAll });
    } catch (e) { setErr(e.message || 'PDF generation failed'); }
    setBusy(false);
  };

  function challanDerivedStatus(c) {
    const total     = Number(c.orders_total     || 0);
    const delivered = Number(c.orders_delivered || 0);
    if (total === 0)            return 'Pending';
    if (delivered === total)    return 'Delivered';
    if (delivered > 0)          return 'Dispatched';
    if (c.rider_id)             return 'Rider Assigned';
    return 'Pending';
  }

  const resetFilters = () => {
    setSearch('');
    setChallanSearch('');
    setFilterSlot([]);
    setFilterStatus([]);
    setFilterOrderType([]);
  };

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .om-root { padding: 16px 12px 24px !important; overflow: auto !important; }
          .om-table-wrap     { display: block !important; }
          .om-pagination { flex-direction: column !important; align-items: stretch !important; }
          .om-pagination > div { justify-content: center !important; }
          .om-header h2 { min-height: 55px !important; display: flex !important; align-items: center !important; padding-right: 58px !important; box-sizing: border-box !important; }
        }
      `}</style>
      <div className="om-root" style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

        {/* Header */}
        <div className="om-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>Challan Management</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {busy && <span style={{ fontSize: '10px', color: '#999', fontWeight: '600' }}>Working…</span>}
            {dayBatches.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>Batch:</label>
                <select
                  value={selectedBatch ?? ''}
                  onChange={(e) => setSelectedBatch(Number(e.target.value))}
                  style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e0e0e0', background: '#fff', fontSize: '11px', fontWeight: '600', color: '#333', cursor: 'pointer' }}
                >
                  {dayBatches.map((b) => (
                    <option key={b.batch_id} value={b.batch_id}>{b.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e6e6e6', marginBottom: '12px' }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', width: '100%', gap: '8px', marginBottom: '12px' }}>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => { setSelectedDay(d); setFilterDay(d); setGenerateDay(d); }}
              style={{
                width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #e0e0e0',
                background: normalizeForCompare(selectedDay) === normalizeForCompare(d) ? '#FF5722' : '#fff',
                color: normalizeForCompare(selectedDay) === normalizeForCompare(d) ? '#fff' : '#333',
                fontWeight: 600, cursor: 'pointer', fontSize: '13px',
              }}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Desktop filters */}
        <div className="om-filter-desktop" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', alignItems: 'flex-end', flexShrink: 0 }}>
          <div style={{ flex: '1 1 200px', minWidth: 160 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} placeholder="Address, area, shareholders…" />
          </div>
          <div style={{ flex: '0 1 180px', minWidth: 150 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Challan No.</label>
            <input type="text" value={challanSearch} onChange={(e) => setChallanSearch(e.target.value)} style={inputStyle} placeholder="Search challan no…" />
          </div>
          <MultiSelectDropdown label="Slots" options={slotFilterOptions} values={filterSlot} onChange={setFilterSlot} placeholder="All slots" width={150} />
          <MultiSelectDropdown label="Status" options={statusFilterOptions} values={filterStatus} onChange={setFilterStatus} placeholder="All status" width={150} />
          <MultiSelectDropdown label="Order Type" options={ORDER_TYPE_FILTERS} values={filterOrderType} onChange={setFilterOrderType} placeholder="All types" width={160} />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={onPrintPdf}
              title={selectedIds.size ? `Print ${selectedIds.size} selected challan(s)` : `Print all ${displayRows.length} challan(s) matching current batch, day, and filters`}
              style={{ padding: '6px 13px', height: '29px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
              Print PDF{selectedIds.size ? ` (${selectedIds.size})` : ''}
            </button>
            <button type="button" onClick={load}
              style={{ padding: '6px 13px', height: '29px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
              Refresh
            </button>
            {emailOk && (
              <button type="button" onClick={() => setConfirmRegen(true)}
                style={{ padding: '6px 13px', height: '29px', background: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
                Generate data (new batch)
              </button>
            )}
          </div>
        </div>

        {/* Mobile filter toggle */}
        <div className="om-filter-toggle" style={{ display: 'none', gap: '8px', marginBottom: '8px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 120px', minWidth: 0, padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }} />
          <button type="button" className={`ops-filter-toggle-btn${mobileFiltersOpen ? ' is-open' : ''}`} onClick={() => setMobileFiltersOpen((v) => !v)}>⚙ Filters</button>
          <button type="button" disabled={busy} onClick={onPrintPdf} title={selectedIds.size ? `Print ${selectedIds.size} selected` : `Print all ${displayRows.length} filtered challan(s)`} style={{ padding: '9px 12px', borderRadius: '8px', background: '#FF5722', color: '#fff', border: 'none', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Print PDF{selectedIds.size ? ` (${selectedIds.size})` : ''}</button>
        </div>
        <div className="om-challan-mobile-actions" style={{ display: 'none' }}>
          <button type="button" onClick={load} style={{ background: '#fff', color: '#555', border: '1px solid #e0e0e0' }}>Refresh</button>
          {emailOk && (
            <button type="button" onClick={() => setConfirmRegen(true)} style={{ background: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2' }}>New batch</button>
          )}
        </div>
        <div className="om-filter-mobile" style={{ display: 'none' }}>
          {mobileFiltersOpen && (
            <div className="ops-filter-mobile-panel">
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Challan No.</label>
                <input type="text" value={challanSearch} onChange={(e) => setChallanSearch(e.target.value)} placeholder="Search challan no…" style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <MultiSelectDropdown label="Slots" options={slotFilterOptions} values={filterSlot} onChange={setFilterSlot} placeholder="All slots" width={280} />
              <MultiSelectDropdown label="Status" options={statusFilterOptions} values={filterStatus} onChange={setFilterStatus} placeholder="All status" width={280} />
              <MultiSelectDropdown label="Order Type" options={ORDER_TYPE_FILTERS} values={filterOrderType} onChange={setFilterOrderType} placeholder="All types" width={280} />
              <div className="ops-filter-mobile-actions">
                <button type="button" className="ops-filter-mobile-done" onClick={() => setMobileFiltersOpen(false)}>Done</button>
                <button type="button" onClick={() => { resetFilters(); setMobileFiltersOpen(false); }} style={{ flex: 1, padding: '10px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Reset</button>
              </div>
            </div>
          )}
        </div>

        {msg && <div style={{ padding: '10px', background: '#E8F5E9', color: '#2E7D32', borderRadius: '6px', marginBottom: '12px', fontSize: '10px', fontWeight: '600' }}>{msg}</div>}
        {err && <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', fontSize: '10px', fontWeight: '600' }}>{err}</div>}

        {!loading && (
          <div style={{ fontSize: '10px', color: '#999', marginBottom: '8px', flexShrink: 0 }}>
            Showing {displayRows.length} of {challans.length} challan{challans.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Table */}
        <div className="om-table-wrap" style={{ flex: 1, minHeight: 0, overflow: 'auto', borderRadius: '10px', border: '1px solid #ececec' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div>
          ) : (
            <table className="ops-data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'auto' }}>
              
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ padding: '10px 10px', borderBottom: '1px solid #e0e0e0' }}>
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} />
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 10px', borderBottom: '1px solid #e0e0e0', color: '#555', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '10px' }}>
                    No.
                  </th>
                  {['Description', 'Booking Name', ...HISSA_COUNT_TABLE_HEADERS, 'Total Hissa', 'Day / Slot', 'Area', 'Contact', 'Address', 'Customer ID', 'Shareholders'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 10px', borderBottom: '1px solid #e0e0e0', color: '#555', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.length === 0 ? (
                  <tr><td colSpan={18} style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>No rows found.</td></tr>
                ) : pagedRows.map((c, idx) => {
                  const st          = challanDerivedStatus(c);
                  const rowTag = getOrderTag(c);
                  const rowHighlight = getChallanRowHighlight(rowTag);
                  const names       = c.shareholders_csv  || '—';
                  const contacts    = c.contacts_csv      || '—';
                  const altContacts = c.alt_contacts_csv  || '';
                  const customerIds = c.customer_ids_csv  || '—';
                  const rowCounts = getTableHissaCounts(c);
                  return (
                    <tr key={c.challan_id}
                      style={{
                        borderBottom: '1px solid #f3f3f3',
                        background: rowHighlight.background || (idx % 2 === 0 ? '#fff' : '#FAFAFA'),
                        borderLeft: rowHighlight.borderLeft,
                        cursor: c.qr_token ? 'pointer' : 'default',
                      }}
                      onClick={() => c.qr_token && openChallanModal(c.qr_token)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f9ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = rowHighlight.background || (idx % 2 === 0 ? '#fff' : '#FAFAFA'); }}
                    >
                      <td style={{ padding: '9px 10px' }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(c.challan_id)} onChange={() => toggleOne(c.challan_id)} />
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <NoBadge number={c.challan_id} />
                      </td>
                      <td className="ops-cell-wrap" style={{ padding: '9px 10px', color: '#555', verticalAlign:'top' }}>
                        <OrderDescriptionCell source={c} />
                      </td>
                      <td className="ops-cell-wrap" style={{ padding: '9px 10px', fontWeight: '500', color: '#333', verticalAlign:'top' }}>{c.booking_name || '—'}</td>
                      {hissaCountCellValues(rowCounts).map((v, i) => (
                        <td key={HISSA_COUNT_TABLE_HEADERS[i]} style={{ padding: '9px 10px', color: '#555' }}>{v}</td>
                      ))}
                      <td style={{ padding: '9px 10px', color: '#555', fontWeight: '600' }}>{rowCounts.total}</td>
                      <td style={{ padding: '9px 10px', color: '#555', whiteSpace: 'nowrap' }}>
                        <div>{c.day || '—'}</div>
                        {c.slot && <div style={{ fontSize: '9px', color: '#aaa' }}>{c.slot}</div>}
                      </td>
                      <td className="ops-cell-wrap" style={{ padding: '9px 10px', color: '#555', verticalAlign:'top' }}>{c.area || '—'}</td>
                      <td className="ops-cell-wrap" style={{ padding: '9px 10px', color: '#555' }}><MultiLineCell values={[contacts, altContacts]} /></td>
                      <td className="ops-cell-wrap" style={{ padding: '9px 10px', color: '#555', verticalAlign:'top' }}>
                        <div>{formatAddress(c.address) || '—'}</div>
                      </td>
                      <td style={{ padding: '9px 10px', color: '#777', fontWeight: '500' }}><MultiLineCell values={customerIds} /></td>
                      <td className="ops-cell-wrap" style={{ padding: '9px 10px', color: '#666', verticalAlign:'top' }} title={names}>
                        {names}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {/* Pagination */}
{!loading && displayRows.length > 0 && (
  <div
    className="om-pagination"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '12px',
      padding: '12px 0',
      borderTop: '1px solid #e0e0e0',
      marginTop: '8px',
      flexShrink: 0,
    }}
  >
    <span style={{ fontSize: '13px', color: '#666' }}>
      Showing {pagedRows.length} of {displayRows.length} challans
    </span>

    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        style={{
          padding: '6px 12px',
          fontSize: '10px',
          background: page <= 1 ? '#f0f0f0' : '#fff',
          color: page <= 1 ? '#999' : '#333',
          border: '1px solid #e0e0e0',
          borderRadius: '6px',
          cursor: page <= 1 ? 'not-allowed' : 'pointer',
        }}
      >
        Previous
      </button>

      {(() => {
        const sp = 5;
        let start = Math.max(1, page - Math.floor(sp / 2));
        let end = Math.min(totalPages, start + sp - 1);

        if (end - start + 1 < sp) {
          start = Math.max(1, end - sp + 1);
        }

        const pages = [];
        for (let i = start; i <= end; i++) pages.push(i);

        return pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPage(p)}
            style={{
              minWidth: '32px',
              padding: '6px 10px',
              fontSize: '10px',
              background: p === page ? '#FF5722' : '#fff',
              color: p === page ? '#fff' : '#333',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: p === page ? 600 : 400,
            }}
          >
            {p}
          </button>
        ));
      })()}

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        style={{
          padding: '6px 12px',
          fontSize: '10px',
          background: page >= totalPages ? '#f0f0f0' : '#fff',
          color: page >= totalPages ? '#999' : '#333',
          border: '1px solid #e0e0e0',
          borderRadius: '6px',
          cursor: page >= totalPages ? 'not-allowed' : 'pointer',
        }}
      >
        Next
      </button>
    </div>
  </div>
)}
      </div>

      {/* Confirm regenerate */}
      {confirmRegen && (
        <div className="ops-sheet-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setConfirmRegen(false)}>
          <div className="ops-sheet-panel" style={{ background: '#fff', borderRadius: '18px', border: '1.5px solid #F0F0F0', padding: '20px', maxWidth: '440px', width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}
            onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '600', color: '#333' }}>Generate new batch of challans?</h2>
            <p style={{ margin: '0 0 18px', fontSize: '12px', color: '#666' }}>
              This creates a <strong>new batch</strong> for <strong>{generateDay}</strong> only from 2026 orders on that day. Existing batches are preserved.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirmRegen(false)}
                style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              <button type="button" onClick={doRegenerate}
                style={{ padding: '9px 18px', borderRadius: '8px', background: '#C62828', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Yes, generate</button>
            </div>
          </div>
        </div>
      )}

      {/* Challan detail modal — view only */}
      {modal && (
        <SharedChallanModal
          challanId={modal.challan?.challan_id}
          customerId={modalCustomerIds.length ? modalCustomerIds.join(', ') : '—'}
          description={modalDescription}
          affluent={isAffluentOrder({ ...(modal?.challan || {}), orders: modal?.orders || [] })}
          specialRequest={isSpecialRequestOrder({ ...(modal?.challan || {}), orders: modal?.orders || [] })}
          statusBadge={<StatusBadge status={modal.challan?.derived_status} />}
          onClose={() => setModal(null)}
          maxWidth="1240px"
          infoRows={[
            ['Address', modal.challan?.address ? formatAddress(modal.challan.address) : '—'],
            ['Booking Name', modal.challan?.booking_name || [...new Set((modal.orders || []).map((o) => o.booking_name).filter(Boolean))].join(', ') || '—'],
            ['Area', modal.challan?.area || '—'],
            ['Day', modal.challan?.day || '—'],
            ['Slot', modal.challan?.slot || '—'],
            ['Rider', modalRiderDetails.name],
            ['Total Hissa', formatTotalHissa(modalTotals?.total || 0, modalTotals || {})],
          ]}
          orders={(modal.orders || []).filter((o) => ALLOWED_ORDER_TYPES.includes(normalizeOrderType(o.order_type)))}
          renderOrderStatus={(o) => <StatusBadge status={o.delivery_status} />}
        />
      )}
    </>
  );
}