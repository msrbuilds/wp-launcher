import { Router, Request, Response } from 'express';
import { registerUser, verifyUserEmail, loginUser, updatePassword } from '../services/user.service';
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

// Step 2: User clicks verification link → account verified, gets JWT token
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Verification token is required' });
      return;
    }

    const { user, tempPassword } = await verifyUserEmail(token);

    // Send welcome email with temp password for new users
    if (tempPassword) {
      await sendWelcomeEmail(user.email, tempPassword).catch((err) => {
        console.error('[auth] Failed to send welcome email:', err);
      });
    }

    const jwtToken = generateToken(user.id, user.email);

    res.json({
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
      },
      isNewUser: !!tempPassword,
      tempPassword: tempPassword || undefined,
    });
  } catch (err: any) {
    console.error('[auth] Verify error:', err);
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

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }

    await updatePassword(req.userId!, currentPassword, newPassword);
    res.json({ message: 'Password updated successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
