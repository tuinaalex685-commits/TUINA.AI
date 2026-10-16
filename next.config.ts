import type { NextConfig } from "next";

// En-têtes de sécurité appliqués à toutes les réponses (C-13).
// Pas encore de Content-Security-Policy stricte : les encarts publicitaires (Adsterra) et les
// styles en ligne doivent d'abord être inventoriés, sinon la CSP casserait l'affichage.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
