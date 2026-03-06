import nodemailer from 'nodemailer';
import { config } from '../config';

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

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: email,
    subject: 'Verify your email - WP Launcher Demo',
    html,
  });

  console.log(`[email] Verification email sent to ${email}`);
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

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: email,
    subject: 'Welcome to WP Launcher - Your account is ready',
    html,
  });

  console.log(`[email] Welcome email sent to ${email}`);
}
