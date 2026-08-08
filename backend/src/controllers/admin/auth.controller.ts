import { Request, Response, CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { verifyGoogleIdToken } from '../../lib/googleAuth';
import { AdminRequest } from '../../types/admin.types';

const COOKIE_NAME = 'admin_session';

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
};

export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  const credential = req.body?.credential;

  if (!credential) {
    throw new ApiError(400, 'Missing credential');
  }

  let payload;
  try {
    payload = await verifyGoogleIdToken(credential);
  } catch {
    throw new ApiError(403, 'Not authorized');
  }

  if (
    !payload ||
    payload.email_verified !== true ||
    payload.email?.toLowerCase() !== config.adminEmail.toLowerCase()
  ) {
    throw new ApiError(403, 'Not authorized');
  }

  const token = jwt.sign({ email: payload.email }, config.adminJwtSecret, { expiresIn: '1h' });

  res.cookie(COOKIE_NAME, token, {
    ...baseCookieOptions,
    maxAge: 60 * 60 * 1000,
  });

  res.status(200).json({ email: payload.email });
};

export const logout = async (req: AdminRequest, res: Response): Promise<void> => {
  res.clearCookie(COOKIE_NAME, baseCookieOptions);
  res.status(200).json({ message: 'Logged out' });
};

export const me = async (req: AdminRequest, res: Response): Promise<void> => {
  if (!req.admin) {
    throw new ApiError(401, 'Not authenticated');
  }
  res.status(200).json({ email: req.admin.email });
};
