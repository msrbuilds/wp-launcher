import { Router, Request, Response } from 'express';
import { registerUser, verifyUserEmail, setInitialPassword, loginUser, updatePassword } from '../services/user.service';
import { sendVerificationEmail, sendWelcomeEmail } from '../services/email.service';
import { userAuth, generateToken, AuthRequest } from '../middleware/userAuth';
import { asyncHandler } from '../utils/asyncHandler';
import { ValidationError } from '../utils/errors';
import { config } from '../config';

const router = Router();

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
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    throw new ValidationError('Valid email is required');
  }

  const { verificationToken } = await registerUser(email.toLowerCase().trim());
  await sendVerificationEmail(email, verificationToken);

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
    const jwtToken = generateToken(user.id, user.email, user.role);
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
  const jwtToken = generateToken(user.id, user.email, user.role);
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
  const token = generateToken(user.id, user.email, user.role);
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
  res.json({
    id: req.userId,
    email: req.userEmail,
    role: req.userRole || 'user',
  });
});

// Update password
router.post('/update-password', userAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required');
  }

  if (newPassword.length < 8) {
    throw new ValidationError('New password must be at least 8 characters');
  }

  await updatePassword(req.userId!, currentPassword, newPassword);
  res.json({ message: 'Password updated successfully' });
}));

// Logout — clear auth cookie
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('wpl_token', { path: '/api' });
  res.clearCookie('wpl_admin', { path: '/api' });
  res.json({ message: 'Logged out' });
});

export default router;
