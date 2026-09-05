import nodemailer from 'nodemailer'
import { prisma } from './prisma.js'

/**
 * Outgoing email.
 *
 * Every message is written to the `outbox` table first, then handed to SMTP if
 * SMTP is configured. The row is the record of what the system tried to send;
 * `sentAt` records whether it actually left the machine.
 *
 * With no SMTP settings the outbox is the whole delivery mechanism. That is
 * not a degraded mode — this app has to work with no internet, and a demo on a
 * conference-hall network should not fail to log anyone in because port 587 is
 * blocked. `deliver()` reports which path it took so the caller can decide
 * whether to show the code on screen.
 */

const SMTP_HOST = process.env.SMTP_HOST
const FROM = process.env.SMTP_FROM || 'Urban Furniture <no-reply@urbanfurniture.local>'

export const smtpConfigured = Boolean(SMTP_HOST)

// Built once. Nodemailer pools connections, so recreating it per email would
// throw away the handshake every time.
const transport = smtpConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      // Port 465 is implicit TLS; 587 starts plaintext and upgrades via
      // STARTTLS, which nodemailer does on its own when `secure` is false.
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      pool: true,
      maxConnections: 2,
      // Nodemailer drops an idle pooled connection after one second, which
      // means almost every sign-in pays the full TLS-and-auth handshake again
      // — measured at 14s against Gmail, versus 2s on a live connection.
      // Holding one open for a minute covers the gaps between logins.
      maxIdleTime: 60_000,
      // A sign-in waits on this, so an unresponsive mail server has to fail
      // fast rather than hold the request until something else gives up.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null

// Gmail's first TLS-and-auth handshake costs the better part of a minute on a
// cold connection. Paying it at boot rather than inside whoever happens to
// sign in first is the difference between a snappy login and a 25-second one.

/**
 * Record a message and try to send it.
 *
 * Never throws: the caller decides what a failed send means, and the return
 * value says what happened.
 *
 * Deliberately takes no transaction client. An earlier version wrote the
 * outbox row inside the caller's interactive transaction so the record and the
 * send would commit together — which meant an SMTP handshake ran with a
 * Postgres transaction held open. Gmail's cold handshake took 25 seconds
 * against a 5-second transaction timeout, and the whole thing rolled back
 * *after* the mail had gone out. Even when it fits in the window it pins a
 * connection and a snapshot for as long as someone else's mail server feels
 * like taking.
 *
 * So: callers commit their own state first, then call this. The worst case
 * becomes a code that is valid but undelivered, which the return value
 * reports — never a delivered code the database has forgotten.
 */
export async function deliver({ to, subject, body }) {
  const row = await prisma.outbox.create({ data: { toEmail: to, subject, body } })

  if (!transport) return { delivered: false, reason: 'smtp-not-configured', outboxId: row.id }

  try {
    await transport.sendMail({ from: FROM, to, subject, text: body })
    await prisma.outbox.update({ where: { id: row.id }, data: { sentAt: new Date() } })
    return { delivered: true, outboxId: row.id }
  } catch (err) {
    console.error(`[mailer] could not send to ${to}:`, err.message)
    return { delivered: false, reason: 'smtp-error', error: err.message, outboxId: row.id }
  }
}

/**
 * Reported by /health so a misconfigured SMTP is visible before someone
 * discovers it by not receiving a login code.
 *
 * Never blocks on the network. `transport.verify()` opens a connection and
 * authenticates, which against Gmail costs seconds — doing that per request
 * made /health take 13-27s, slow enough for a monitor to call the service
 * down over a check that was only ever informational. The result is cached and
 * refreshed in the background, so a caller always gets the last known answer
 * immediately.
 */
const PROBE_TTL_MS = 60_000
let probe = { status: 'unknown', at: 0 }
let probing = false

function refreshProbe() {
  if (probing) return
  probing = true
  transport.verify()
    .then(() => { probe = { status: 'up', host: SMTP_HOST, at: Date.now() } })
    .catch((err) => { probe = { status: 'down', host: SMTP_HOST, error: err.message, at: Date.now() } })
    .finally(() => { probing = false })
}

export function mailerStatus() {
  if (!transport) return { status: 'outbox-only' }
  if (Date.now() - probe.at > PROBE_TTL_MS) refreshProbe()
  const { at, ...rest } = probe
  return at ? { ...rest, checkedSecondsAgo: Math.round((Date.now() - at) / 1000) } : rest
}

// Warm the pool and seed the probe at boot. Gmail's first TLS-and-auth
// handshake costs the better part of a minute on a cold connection; paying it
// here rather than inside whoever happens to sign in first is the difference
// between a snappy login and a 14-second one. Placed after the declarations
// above because refreshProbe touches `let` bindings.
if (transport) refreshProbe()
