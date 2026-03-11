import nodemailer from 'nodemailer';
import { config } from '../config';

// ── SMTP transport (default) ──────────────────────────────────────────────────

let transporter: nodemailer.Transporter;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
    });
  }
  return transporter;
}

async function sendViaSMTP(to: string, subject: string, html: string): Promise<void> {
  await getTransporter().sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
  });
}

// ── Brevo HTTP API transport ──────────────────────────────────────────────────

function parseFromAddress(from: string): { email: string; name?: string } {
  // Parse "Name <email>" or just "email"
  const match = from.match(/^(.+?)\s*<(.+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { email: from.trim() };
}

async function sendViaBrevo(to: string, subject: string, html: string): Promise<void> {
  const sender = parseFromAddress(config.smtp.from);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': config.brevoApiKey,
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${body}`);
  }
}

// ── Unified send function ─────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (config.emailProvider === 'brevo') {
    await sendViaBrevo(to, subject, html);
  } else {
    await sendViaSMTP(to, subject, html);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendVerificationEmail(
  email: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${config.publicUrl}/verify?token=${token}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
      <h2 style="color: #1a1a2e;">Verify your email</h2>
      <p>Click the button below to verify your email and launch your demo site:</p>
      <a href="${verifyUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 1rem 0;">
        Verify Email & Launch Demo
      </a>
      <p style="color: #64748b; font-size: 0.85rem;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
      <p style="color: #94a3b8; font-size: 0.8rem;">Or copy this link: ${verifyUrl}</p>
    </div>
  `;

  await sendEmail(email, 'Verify your email - WP Launcher Demo', html);
  console.log(`[email] Verification email sent to ${email} via ${config.emailProvider}`);
}

export async function sendWelcomeEmail(
  email: string,
): Promise<void> {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
      <h2 style="color: #1a1a2e;">Welcome to WP Launcher!</h2>
      <p>Your email has been verified and your account is ready.</p>
      <p>Please set your password in the browser window where you verified your email to complete your account setup.</p>
      <p style="color: #64748b; font-size: 0.85rem;">Your demo site will be created once you're logged in!</p>
    </div>
  `;

  await sendEmail(email, 'Welcome to WP Launcher - Your account is ready', html);
  console.log(`[email] Welcome email sent to ${email} via ${config.emailProvider}`);
}
