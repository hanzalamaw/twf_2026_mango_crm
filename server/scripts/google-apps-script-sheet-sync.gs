/**
 * Paste into the same Google Apps Script project as your contact lookup web app.
 * Deploy as Web App (Execute as: Me, Who has access: Anyone) after saving.
 *
 * Existing doGet(contact) behaviour is unchanged.
 * New: ?action=update_delivery_status&order_id=TWF-1006&delivery_status=Delivered
 */

const SHEET_NAME = 'Sheet1';

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action).trim() : '';

    if (action === 'update_delivery_status') {
      return handleUpdateDeliveryStatus_(e);
    }

    return handleContactSearch_(e);
  } catch (err) {
    var errorResponse = {
      success: false,
      message: err.toString(),
      orders: []
    };

    var callback = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : '';
    if (callback) {
      var errorJson = JSON.stringify(errorResponse);
      return ContentService
        .createTextOutput(callback + '(' + errorJson + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return jsonOutput_(errorResponse);
  }
}

/** Original contact search — unchanged logic. */
function handleContactSearch_(e) {
  var contact = e.parameter.contact || '';
  var callback = e.parameter.callback || '';

  var searchNumber = normalizePhone(contact);

  var sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(SHEET_NAME);

  var values = sheet.getDataRange().getValues();

  var headers = values[0];
  var rows = values.slice(1);

  var orders = [];

  rows.forEach(function(row) {
    var order = {};

    headers.forEach(function(header, index) {
      order[String(header).trim()] = row[index];
    });

    var mainContact = normalizePhone(order.contact);
    var altContact = normalizePhone(order.alt_contact);

    if (
      mainContact === searchNumber ||
      altContact === searchNumber
    ) {
      orders.push(order);
    }
  });

  var response = {
    success: true,
    orders: orders
  };

  var json = JSON.stringify(response);

  return ContentService
    .createTextOutput(callback + '(' + json + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/** Update delivery_status column for a row matching order_id. */
function handleUpdateDeliveryStatus_(e) {
  var orderId = String(e.parameter.order_id || '').trim();
  var deliveryStatus = String(e.parameter.delivery_status || '').trim();

  if (!orderId || !deliveryStatus) {
    return jsonOutput_({
      success: false,
      message: 'order_id and delivery_status are required'
    });
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var values = sheet.getDataRange().getValues();
  var headers = values[0];

  var orderIdCol = findColumnIndex_(headers, 'order_id');
  var statusCol = findColumnIndex_(headers, 'delivery_status');

  if (orderIdCol < 0) {
    return jsonOutput_({ success: false, message: 'order_id column not found' });
  }
  if (statusCol < 0) {
    return jsonOutput_({ success: false, message: 'delivery_status column not found' });
  }

  var updated = false;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][orderIdCol] || '').trim() === orderId) {
      sheet.getRange(r + 1, statusCol + 1).setValue(deliveryStatus);
      updated = true;
    }
  }

  return jsonOutput_({
    success: updated,
    message: updated ? 'Updated' : 'Order not found in sheet',
    order_id: orderId,
    delivery_status: deliveryStatus
  });
}

function findColumnIndex_(headers, name) {
  var target = String(name).trim().toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === target) {
      return i;
    }
  }
  return -1;
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizePhone(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(-11);
}
