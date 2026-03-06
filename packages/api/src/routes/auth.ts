import { Router, Request, Response } from 'express';
import { registerUser, verifyUserEmail, setInitialPassword, loginUser, updatePassword } from '../services/user.service';
import { sendVerificationEmail, sendWelcomeEmail } from '../services/email.service';
import { userAuth, generateToken, AuthRequest } from '../middleware/userAuth';

const router = Router();

// Step 1: User enters email → sends verification email
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }

    const { verificationToken } = await registerUser(email.toLowerCase().trim());
    await sendVerificationEmail(email, verificationToken);

    res.json({ message: 'Verification email sent. Please check your inbox.' });
  } catch (err: any) {
    console.error('[auth] Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Step 2: User clicks verification link → account verified
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Verification token is required' });
      return;
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
      const jwtToken = generateToken(user.id, user.email);
      res.json({
        needsPassword: false,
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
        },
      });
    }
  } catch (err: any) {
    console.error('[auth] Verify error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Step 3: New user sets their password
router.post('/set-password', async (req: Request, res: Response) => {
  try {
    const { passwordSetToken, password } = req.body;

    if (!passwordSetToken || !password) {
      res.status(400).json({ error: 'Password set token and password are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const user = await setInitialPassword(passwordSetToken, password);
    const jwtToken = generateToken(user.id, user.email);

    res.json({
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (err: any) {
    console.error('[auth] Set password error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Login with email + password
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await loginUser(email.toLowerCase().trim(), password);
    const token = generateToken(user.id, user.email);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// Get current user info
router.get('/me', userAuth, (req: AuthRequest, res: Response) => {
  res.json({
    id: req.userId,
    email: req.userEmail,
  });
});

// Update password
router.post('/update-password', userAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    await updatePassword(req.userId!, currentPassword, newPassword);
    res.json({ message: 'Password updated successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
