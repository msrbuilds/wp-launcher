import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import {
  registerUser, verifyUserEmail, setInitialPassword, loginUser, updatePassword,
  getUserById, updateProfile, setAvatarUrl, requestEmailChange, confirmEmailChange,
  UserRecord,
} from '../services/user.service';
import { sendVerificationEmail, sendWelcomeEmail, sendEmailChangeVerification } from '../services/email.service';
import { userAuth, generateToken, AuthRequest } from '../middleware/userAuth';
import { asyncHandler } from '../utils/asyncHandler';
import { policy } from '../policy';
import { ValidationError } from '../utils/errors';
import { config } from '../config';

const router = Router();

/** Shape returned to the dashboard for the signed-in user. */
function publicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    role: user.role || 'user',
    name: user.name || '',
    avatarUrl: user.avatar_url || '',
    pendingEmail: user.pending_email || '',
  };
}

function setAuthCookie(res: Response, token: string): void {
  const isProduction = config.nodeEnv === 'production';
  res.cookie('wpl_token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

// Step 1: User enters email → sends verification email
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  if (!policy.allowsPublicRegistration()) {
    res.status(403).json({ error: 'Public registration is disabled on this panel' });
    return;
  }

  const { email } = req.body;

  if (!email || !email.includes('@')) {
    throw new ValidationError('Valid email is required');
  }

  const { verificationToken, throttled } = await registerUser(email.toLowerCase().trim());
  // When throttled, a link went out moments ago — stay silent rather than send
  // again, but return the same response so nothing is leaked about the address.
  if (!throttled) {
    await sendVerificationEmail(email, verificationToken);
  }

  res.json({ message: 'Verification email sent. Please check your inbox.' });
}));

// Step 2: User clicks verification link → account verified
router.post('/verify', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    throw new ValidationError('Verification token is required');
  }

  const { user, needsPassword, passwordSetToken } = await verifyUserEmail(token);

  if (needsPassword) {
    // New user — needs to set password before getting a JWT
    await sendWelcomeEmail(user.email).catch((err) => {
      console.error('[auth] Failed to send welcome email:', err);
    });

    res.json({
      needsPassword: true,
      passwordSetToken,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } else {
    // Returning user (magic-link login) — issue JWT directly
    const jwtToken = generateToken(user.id, user.email, user.role, user.token_version);
    setAuthCookie(res, jwtToken);
    res.json({
      needsPassword: false,
      user: {
        id: user.id,
        email: user.email,
        role: user.role || 'user',
      },
    });
  }
}));

// Step 3: New user sets their password
router.post('/set-password', asyncHandler(async (req: Request, res: Response) => {
  const { passwordSetToken, password } = req.body;

  if (!passwordSetToken || !password) {
    throw new ValidationError('Password set token and password are required');
  }

  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  const user = await setInitialPassword(passwordSetToken, password);
  const jwtToken = generateToken(user.id, user.email, user.role, user.token_version);
  setAuthCookie(res, jwtToken);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role || 'user',
    },
  });
}));

// Login with email + password
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  const user = await loginUser(email.toLowerCase().trim(), password);
  const token = generateToken(user.id, user.email, user.role, user.token_version);
  setAuthCookie(res, token);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role || 'user',
    },
  });
}));

// Get current user info
router.get('/me', userAuth, (req: AuthRequest, res: Response) => {
  const user = getUserById(req.userId!);
  if (!user) {
    // API-key auth resolves to the synthetic 'admin' row, which always exists;
    // a real JWT with no row means the account was removed.
    res.status(401).json({ error: 'User not found' });
    return;
  }
  res.json(publicUser(user));
});

// Update profile (display name)
router.patch('/profile', userAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  if (typeof name !== 'string') {
    throw new ValidationError('Name is required');
  }
  if (name.length > 80) {
    throw new ValidationError('Name must be 80 characters or fewer');
  }
  const user = updateProfile(req.userId!, name);
  res.json(publicUser(user));
}));

// Update password
router.post('/update-password', userAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required');
  }

  if (newPassword.length < 8) {
    throw new ValidationError('New password must be at least 8 characters');
  }

  const { tokenVersion } = await updatePassword(req.userId!, currentPassword, newPassword);
  // The change invalidated every prior JWT (including this request's). Re-issue
  // one at the new version so the device that made the change stays signed in
  // while other sessions are logged out.
  setAuthCookie(res, generateToken(req.userId!, req.userEmail!, req.userRole || 'user', tokenVersion));
  res.json({ message: 'Password updated successfully' });
}));

// Request an email change — sends a verification link to the new address
router.post('/change-email', userAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { newEmail, currentPassword } = req.body;
  if (!newEmail || !currentPassword) {
    throw new ValidationError('New email and current password are required');
  }

  const { token, pendingEmail } = await requestEmailChange(req.userId!, newEmail, currentPassword);
  await sendEmailChangeVerification(pendingEmail, token);

  res.json({
    message: `Verification link sent to ${pendingEmail}. Check that inbox to confirm the change.`,
    pendingEmail,
  });
}));

// Confirm an email change from the link — token-authenticated, no session needed
router.post('/verify-email-change', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) {
    throw new ValidationError('Verification token is required');
  }
  const user = confirmEmailChange(token);
  res.json({ message: 'Email address updated', email: user.email });
}));

const AVATAR_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function removeExistingAvatars(dir: string, userId: string): void {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(`avatar-${userId}.`)) fs.unlinkSync(path.join(dir, f));
  }
}

// Upload a profile avatar (raw image body — SVG rejected as an XSS vector).
// express.json() ignores non-JSON content types, so the raw stream is intact here.
router.post('/avatar', userAuth, (req: AuthRequest, res: Response) => {
  const contentType = (req.headers['content-type'] || '').split(';')[0].trim();
  const ext = AVATAR_TYPES[contentType];
  if (!ext) {
    res.status(400).json({ error: 'Invalid file type. Allowed: PNG, JPEG, WebP, GIF' });
    return;
  }

  const chunks: Buffer[] = [];
  let tooLarge = false;
  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 2 * 1024 * 1024) tooLarge = true;
  });
  req.on('end', () => {
    if (tooLarge) {
      res.status(400).json({ error: 'File too large (max 2MB)' });
      return;
    }
    const body = Buffer.concat(chunks);
    if (body.length === 0) {
      res.status(400).json({ error: 'Empty upload' });
      return;
    }

    const uploadDir = path.resolve(config.dataDir, 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    removeExistingAvatars(uploadDir, req.userId!);
    fs.writeFileSync(path.join(uploadDir, `avatar-${req.userId}${ext}`), body);

    const avatarUrl = `/api/uploads/avatar-${req.userId}${ext}`;
    setAvatarUrl(req.userId!, avatarUrl);
    res.json({ avatarUrl });
  });
});

// Remove the profile avatar
router.delete('/avatar', userAuth, (req: AuthRequest, res: Response) => {
  const uploadDir = path.resolve(config.dataDir, 'uploads');
  removeExistingAvatars(uploadDir, req.userId!);
  setAvatarUrl(req.userId!, null);
  res.json({ status: 'removed' });
});

// Logout — clear auth cookie
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('wpl_token', { path: '/api' });
  res.clearCookie('wpl_admin', { path: '/api' });
  res.json({ message: 'Logged out' });
});

export default router;
