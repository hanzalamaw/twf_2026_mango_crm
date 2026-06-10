import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { getDescriptionText, getOrderTag } from './orderTags';
import {
  computeModalTotals,
  partitionOrdersForChallanPrint,
} from './operationsOrderTypes';
import {
  formatMangoOrderLabel,
  parseMangoVarietyKey,
  parseMangoWeightKey,
  MANGO_VARIETY_OPTIONS,
  MANGO_WEIGHT_OPTIONS,
  formatMangoWeight,
} from './mangoOrderFormat';

function formatOrderTypeForChallanPrint(orderOrType) {
  if (orderOrType && typeof orderOrType === 'object') {
    return formatMangoOrderLabel(orderOrType);
  }
  return formatMangoOrderLabel({ order_type: orderOrType });
}

/** Order-type count lines for challan PDF info box (first-seen order, print labels). */
function buildChallanPrintOrderTypeSummary(orders) {
  const seen = [];
  const counts = new Map();
  for (const o of orders || []) {
    const label = formatMangoOrderLabel(o);
    if (!label) continue;
    if (!counts.has(label)) {
      seen.push(label);
      counts.set(label, 0);
    }
    const qty = Number(o.quantity);
    counts.set(label, counts.get(label) + (Number.isFinite(qty) && qty > 0 ? qty : 1));
  }
  return seen.map((label) => ({
    label,
    count: counts.get(label),
    text: `${label} - ${counts.get(label)}`,
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
    uniqueJoin(orders.map((o) => o.booking_name || o.name)) ||
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

export function sortChallanRowsForPrint(rows) {
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
    uniqueJoin(orders.map((o) => o.booking_name || o.name)) ||
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

function drawCheckboxCheckMark(doc, x, y, boxSize) {
  const top = y - boxSize + 3;
  doc.setDrawColor(25, 25, 25);
  doc.setLineWidth(1.3);
  doc.line(x + 2, top + boxSize * 0.55, x + 4.5, top + boxSize - 2.5);
  doc.line(x + 4.5, top + boxSize - 2.5, x + boxSize - 2, top + 2.5);
}

function drawStickerCheckbox(doc, x, y, label, { checked = false, lineEndX = null } = {}) {
  const boxSize = 11;
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.9);
  doc.rect(x, y - boxSize + 3, boxSize, boxSize);
  if (checked) {
    drawCheckboxCheckMark(doc, x, y, boxSize);
  }
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

function drawMangoIncludesBox(doc, order, boxX, boxY, boxW) {
  const varietyKey = parseMangoVarietyKey(order?.order_type);
  const weightKey = parseMangoWeightKey(order?.weight);
  const otherWeight = weightKey === 'other' ? formatMangoWeight(order?.weight) : '';

  const padX = 20;
  const rowGap = 28;
  const boxH = 32 + rowGap * 2 + 12;

  doc.setFillColor(252, 252, 252);
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.8);
  doc.roundedRect(boxX, boxY, boxW, boxH, 6, 6, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(25, 25, 25);
  doc.text('This Box Includes:', boxX + padX, boxY + 24);

  const innerW = boxW - padX * 2;
  const colW = innerW / 3;
  let rowY = boxY + 48;

  MANGO_VARIETY_OPTIONS.forEach((opt, i) => {
    const x = boxX + padX + i * colW;
    drawStickerCheckbox(doc, x, rowY, opt.label, {
      checked: varietyKey === opt.key,
    });
  });

  rowY += rowGap;
  MANGO_WEIGHT_OPTIONS.forEach((opt, i) => {
    const x = boxX + padX + i * colW;
    const isOther = opt.key === 'other';
    const colEndX = boxX + padX + (i + 1) * colW - 8;
    const lineEndX = isOther ? colEndX : null;
    drawStickerCheckbox(doc, x, rowY, opt.label, {
      checked: weightKey === opt.key,
      lineEndX,
    });
    if (isOther && otherWeight && lineEndX) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const lineStart = x + 11 + 8 + doc.getTextWidth(opt.label) + 6;
      doc.text(otherWeight, lineStart, rowY - 1);
    }
  });

  return boxY + boxH;
}

/** One sticker page per box — quantity 3 → 3 sticker pages for that order. */
function stickerPagesForOrder(order) {
  const q = Number(order?.quantity);
  if (Number.isFinite(q) && q > 0) return Math.floor(q);
  return 1;
}

function drawOrderStickerPage(doc, layout, item, order, helpers) {
  const { PW, PH, ML, MR, CONTENT_W } = layout;
  const { safe, split, getChallanCustomerFields: getFields } = helpers;
  const c = item.challan || {};
  const orders = Array.isArray(item.orders) ? item.orders : [];
  const { customerId, customerName, contact } = getFields(c, orders, safe);

  const orderTypeNorm = formatOrderTypeForChallanPrint(order);
  const shareholder = safe(order.name || order.shareholder_name || order.booking_name, '—');
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
    ['Contact', contact, 'Customer Name', shareholder],
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

  const includesBoxY = boxY + boxH + 28;
  drawMangoIncludesBox(doc, order, ML, includesBoxY, CONTENT_W);

  const verifiedY = PH - 52;
  const sigMidX = ML + CONTENT_W / 2;
  const sigLabel = 'Checked & Verified By:';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(sigLabel, sigMidX + 12, verifiedY);
  const sigLabelW = doc.getTextWidth(sigLabel);
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.8);
  doc.line(sigMidX + 12 + sigLabelW + 6, verifiedY + 3, MR - 8, verifiedY + 3);

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
  const totalBoxesText = String(modalPdfTotals.total ?? 0);
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
            { label: 'Total Boxes', value: totalBoxesText, inline: true },
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
  
        doc.text('CUSTOMER NAME', col1X, tableY + 18);
        doc.text('ORDER TYPE', col2X, tableY + 18);
        doc.text('BOXES', col3X, tableY + 18, { align: 'center' });
  
        y = tableY + headerH + 14;
  
        const footerSpace = 88;
        const maxY = PH - footerSpace;
        const minRowH = 48;
        const col1MaxW = 180;
        const col2MaxW = 250;
  
        const measureOrderRow = (o) => {
          const nameLines = split(o.name || o.shareholder_name || o.booking_name || '—', col1MaxW).slice(0, 2);
          const shareDesc = safe(o.description);
          const shareDescLines = shareDesc ? split(shareDesc, col1MaxW).slice(0, 4) : [];
          const mainDesc = formatOrderTypeForChallanPrint(o);
          const mainLines = split(mainDesc, col2MaxW).slice(0, 2);
          const leftH = 14 + nameLines.length * 12 + (shareDescLines.length ? 4 + shareDescLines.length * 11 : 0);
          const rightH = 14 + mainLines.length * 12;
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
  
            const nameLines = split(o.name || o.shareholder_name || o.booking_name || '—', col1MaxW).slice(0, 2);
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

            const mainLines = split(formatOrderTypeForChallanPrint(o), col2MaxW).slice(0, 3);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(25, 25, 25);
            doc.text(mainLines, col2X, y + 16);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(25, 25, 25);
            doc.text(String(o.quantity ?? 1), col3X, y + rowH / 2 + 2, { align: 'center' });
  
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
export async function generateChallanPdf(items, options = {}) {
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
        const stickerCount = stickerPagesForOrder(o);
        for (let copy = 0; copy < stickerCount; copy += 1) {
          nextPage();
          drawOrderStickerPage(doc, layout, item, o, pdfHelpers);
        }
      }
    }
  }

  doc.save(`challan-${new Date().toISOString().slice(0, 10)}.pdf`);
}