const { v4: uuid } = require('uuid');
const nodemailer = require('nodemailer');
const db = require('../db/db');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

/**
 * Sends (or, if no SMTP credentials are configured, logs) an email and
 * always writes an entry to the notifications table so the customer's
 * notification history is queryable regardless of whether real SMTP
 * credentials are present. This lets the app run/demo without any
 * paid service, while README explains how to plug in a free SMTP
 * provider (Gmail app password, Mailtrap, Brevo, etc.) via .env.
 */
async function sendEmail({ orderId, to, subject, body }) {
  const t = getTransporter();
  let status = 'SENT';
  try {
    if (t) {
      await t.sendMail({
        from: process.env.SMTP_FROM || 'no-reply@delivery-tracker.local',
        to,
        subject,
        text: body,
      });
    } else {
      console.log(`[email:mock] To: ${to} | Subject: ${subject}\n${body}`);
    }
  } catch (err) {
    console.error('[email] send failed:', err.message);
    status = 'FAILED';
  }

  db.prepare(`
    INSERT INTO notifications (id, order_id, channel, recipient, subject, body, status)
    VALUES (?,?,?,?,?,?,?)
  `).run(uuid(), orderId, 'EMAIL', to, subject, body, status);
}

/**
 * SMS is mocked (logged + persisted) by default. Swap in Twilio/free-tier
 * SMS provider here using the same credential pattern as email.
 */
async function sendSms({ orderId, to, body }) {
  let status = 'SENT';
  if (process.env.SMS_PROVIDER === 'twilio' && process.env.TWILIO_SID) {
    try {
      // Lazy require so twilio is only needed if actually configured.
      // eslint-disable-next-line global-require
      const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
      await twilio.messages.create({ body, from: process.env.TWILIO_FROM, to });
    } catch (err) {
      console.error('[sms] send failed:', err.message);
      status = 'FAILED';
    }
  } else {
    console.log(`[sms:mock] To: ${to} | ${body}`);
  }

  db.prepare(`
    INSERT INTO notifications (id, order_id, channel, recipient, subject, body, status)
    VALUES (?,?,?,?,?,?,?)
  `).run(uuid(), orderId, 'SMS', to, null, body, status);
}

const STATUS_MESSAGES = {
  CREATED: (o) => `Your order #${o.id.slice(0, 8)} has been created. Estimated charge: Rs.${o.total_charge}.`,
  ASSIGNED: (o) => `A delivery agent has been assigned to your order #${o.id.slice(0, 8)}.`,
  PICKED_UP: (o) => `Your order #${o.id.slice(0, 8)} has been picked up.`,
  IN_TRANSIT: (o) => `Your order #${o.id.slice(0, 8)} is in transit.`,
  OUT_FOR_DELIVERY: (o) => `Your order #${o.id.slice(0, 8)} is out for delivery today.`,
  DELIVERED: (o) => `Your order #${o.id.slice(0, 8)} has been delivered. Thank you!`,
  FAILED: (o) => `Delivery attempt for order #${o.id.slice(0, 8)} failed (${o.failure_reason || 'reason not specified'}). Please reschedule.`,
  RESCHEDULED: (o) => `Your order #${o.id.slice(0, 8)} has been rescheduled for ${o.reschedule_date}.`,
};

async function notifyStatusChange(order, customerEmail) {
  const msgFn = STATUS_MESSAGES[order.status];
  const body = msgFn ? msgFn(order) : `Order #${order.id.slice(0, 8)} status updated to ${order.status}.`;
  await sendEmail({
    orderId: order.id,
    to: customerEmail,
    subject: `Order ${order.id.slice(0, 8)} - ${order.status.replace('_', ' ')}`,
    body,
  });
}

module.exports = { sendEmail, sendSms, notifyStatusChange };
