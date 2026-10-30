import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function verifyGoogleCredential(
  credential: string,
  audience: string,
  nonce: string,
  keySet: JWTVerifyGetKey = googleKeys,
) {
  const { payload } = await jwtVerify(credential, keySet, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience,
    requiredClaims: ['sub', 'exp', 'iat', 'nonce', 'email', 'email_verified'],
    maxTokenAge: '1h',
    clockTolerance: 10,
  });
  if (
    payload.nonce !== nonce ||
    !payload.sub ||
    typeof payload.email !== 'string' ||
    payload.email_verified !== true
  )
    throw new Error('invalid_identity');
  return {
    sub: payload.sub,
    email: payload.email,
    avatar: typeof payload.picture === 'string' ? payload.picture : null,
  };
}
