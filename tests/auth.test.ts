import { it, expect } from 'vitest';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { verifyGoogleCredential } from '../worker/auth';
it('verifies signature, issuer, audience, expiry, nonce and verified email', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test';
  const keys = createLocalJWKSet({ keys: [jwk] });
  const make = (patch: Record<string, unknown> = {}) =>
    new SignJWT({
      sub: 'stable-sub',
      email: 'person@example.test',
      email_verified: true,
      nonce: 'nonce',
      iss: 'https://accounts.google.com',
      aud: 'park-client',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      ...patch,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .sign(privateKey);
  expect((await verifyGoogleCredential(await make(), 'park-client', 'nonce', keys)).sub).toBe(
    'stable-sub',
  );
  for (const patch of [
    { iss: 'https://evil.example' },
    { aud: 'other-client' },
    { exp: 1 },
    { nonce: 'wrong' },
    { email_verified: false },
    { sub: '' },
  ])
    await expect(
      verifyGoogleCredential(await make(patch), 'park-client', 'nonce', keys),
    ).rejects.toThrow();
  const other = await generateKeyPair('RS256');
  const forged = await new SignJWT({ sub: 'x' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .sign(other.privateKey);
  await expect(verifyGoogleCredential(forged, 'park-client', 'nonce', keys)).rejects.toThrow();
});
