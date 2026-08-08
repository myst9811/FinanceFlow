import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';

export const googleClient = new OAuth2Client(config.googleClientId);

export async function verifyGoogleIdToken(idToken: string) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.googleClientId,
  });
  return ticket.getPayload();
}
