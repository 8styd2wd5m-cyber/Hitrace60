export function isDemoFallbackAllowed(): boolean {
  return process.env.ALLOW_DEMO_FALLBACK === 'true';
}
