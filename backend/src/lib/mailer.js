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
    })
  : null

/**
 * Record a message and try to send it.
 *
 * Never throws: a login must not fail because a mail server timed out. The
 * return value says what happened so the caller can react.
 *
 * @param tx a Prisma transaction client, when the outbox row must be part of
 *   the caller's transaction (the OTP hash and its email should commit or roll
 *   back together).
 */
export async function deliver({ to, subject, body }, tx = prisma) {
  const row = await tx.outbox.create({ data: { toEmail: to, subject, body } })

  if (!transport) return { delivered: false, reason: 'smtp-not-configured', outboxId: row.id }

  try {
    await transport.sendMail({ from: FROM, to, subject, text: body })
    // Deliberately outside the caller's transaction: the send already happened,
    // and marking it sent must not be undone by a later rollback.
    await prisma.outbox.update({ where: { id: row.id }, data: { sentAt: new Date() } })
    return { delivered: true, outboxId: row.id }
  } catch (err) {
    console.error(`[mailer] could not send to ${to}:`, err.message)
    return { delivered: false, reason: 'smtp-error', error: err.message, outboxId: row.id }
  }
}

/** Reported by /health so a misconfigured SMTP is visible before someone
 *  discovers it by not receiving a login code. */
export async function mailerStatus() {
  if (!transport) return { status: 'outbox-only' }
  try {
    await transport.verify()
    return { status: 'up', host: SMTP_HOST }
  } catch (err) {
    return { status: 'down', host: SMTP_HOST, error: err.message }
  }
}
