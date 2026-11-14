export const enforcedPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://placehold.co",
  "connect-src 'self' ws://127.0.0.1:4173",
  "frame-src 'self'",
  "require-trusted-types-for 'script'",
  'trusted-types sigil#template sigil#sanitized sigil-demo#parse',
].join('; ')
