import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  JwtPayload,
  AuthenticatedRequest,
} from '../types/auth.types';
import { validateRegisterInput, validateLoginInput } from '../utils/validation';
import { ApiError } from '../utils/ApiError';
import { issueNonce, consumeNonce } from '../lib/googleNonceStore';
import { verifyGoogleIdToken } from '../lib/googleAuth';

export const register = async (req: Request, res: Response): Promise<void> => {
  const { email, password, firstName, lastName }: RegisterRequest = req.body;

  // Validate input
  const validation = validateRegisterInput(email, password, firstName, lastName);
  if (!validation.valid) {
    throw new ApiError(400, validation.error!);
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    throw new ApiError(409, 'User with this email already exists');
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    },
  });

  // Generate JWT token
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
  };

  const token = jwt.sign(
    payload,
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
  );

  const response: AuthResponse = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    token,
  };

  res.status(201).json(response);
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password }: LoginRequest = req.body;

  // Validate input
  const validation = validateLoginInput(email, password);
  if (!validation.valid) {
    throw new ApiError(400, validation.error!);
  }

  // Find user
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !user.password) {
    throw new ApiError(401, 'Invalid email or password');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account deactivated');
  }

  // Generate JWT token
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
  };

  const token = jwt.sign(
    payload,
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
  );

  const response: AuthResponse = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    token,
  };

  res.status(200).json(response);
};

export const getCurrentUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      googleSubject: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const { googleSubject, ...rest } = user;
  res.status(200).json({ user: { ...rest, googleLinked: Boolean(googleSubject) } });
};

export const getGoogleNonce = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({ nonce: issueNonce() });
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

  if (!consumeNonce(payload?.nonce)) {
    throw new ApiError(403, 'Invalid or expired sign-in attempt');
  }
  if (!payload || payload.email_verified !== true || !payload.email || !payload.sub) {
    throw new ApiError(403, 'Not authorized');
  }

  let user = await prisma.user.findUnique({ where: { googleSubject: payload.sub } });

  if (!user) {
    const email = payload.email.toLowerCase();
    const emailCollision = await prisma.user.findUnique({ where: { email } });
    if (emailCollision) {
      throw new ApiError(409, 'An account with this email already exists. Log in and link Google from Settings.');
    }

    try {
      user = await prisma.user.create({
        data: {
          email,
          password: null,
          googleSubject: payload.sub,
          firstName: payload.given_name?.trim() || 'ChronosFin',
          lastName: payload.family_name?.trim() || 'User',
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = (err.meta?.target as string[] | undefined) ?? [];
        if (target.includes('googleSubject')) {
          // Another concurrent request for the same Google account won the race - use their row.
          const winner = await prisma.user.findUnique({ where: { googleSubject: payload.sub } });
          if (!winner) throw err;
          user = winner;
        } else {
          throw new ApiError(409, 'An account with this email already exists. Log in and link Google from Settings.');
        }
      } else {
        throw err;
      }
    }
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account deactivated');
  }

  const jwtPayload: JwtPayload = { userId: user.id, email: user.email };
  const token = jwt.sign(jwtPayload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);

  res.status(200).json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    token,
  });
};

export const linkGoogleAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const credential = req.body?.credential;
  if (!credential || !req.user) {
    throw new ApiError(400, 'Missing credential');
  }

  let payload;
  try {
    payload = await verifyGoogleIdToken(credential);
  } catch {
    throw new ApiError(403, 'Not authorized');
  }

  if (!consumeNonce(payload?.nonce)) {
    throw new ApiError(403, 'Invalid or expired sign-in attempt');
  }
  if (!payload || payload.email_verified !== true || !payload.sub) {
    throw new ApiError(403, 'Not authorized');
  }

  const existingLink = await prisma.user.findUnique({ where: { googleSubject: payload.sub } });
  if (existingLink && existingLink.id !== req.user.userId) {
    throw new ApiError(409, 'This Google account is already linked to a different ChronosFin account');
  }

  try {
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { googleSubject: payload.sub },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError(409, 'This Google account is already linked to a different ChronosFin account');
    }
    throw err;
  }

  res.status(200).json({ linked: true });
};
