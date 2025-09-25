// src/utils/security.ts
export function setupCSP(): void {
  if (typeof document === 'undefined') return;
  if (process.env.NODE_ENV === 'development') {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = `
      default-src 'self';
      connect-src 'self' https://*.solana.com https://*.helius.xyz https://*.raydium.io https://*.jup.ag https://*.quiknode.pro wss://*.quiknode.pro wss://*.solana.com wss://*.helius.xyz https://*.jsdelivr.net;
      img-src 'self' https: data:;
      script-src 'self' 'unsafe-inline' 'unsafe-eval';
      style-src 'self' 'unsafe-inline';
      font-src 'self';
      object-src 'none';
      base-uri 'self';
      form-action 'self';
      block-all-mixed-content;
      upgrade-insecure-requests;
    `;
    document.head.appendChild(meta);
  }
}

export function sanitizeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export function validateRpcUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' && [
      'api.mainnet-beta.solana.com', 'solana-mainnet.quiknode.pro', 'rpc.helius.xyz', 'ssc-dao.genesysgo.net'
    ].some(domain => parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`));
  } catch (e) {
    return false;
  }
}
