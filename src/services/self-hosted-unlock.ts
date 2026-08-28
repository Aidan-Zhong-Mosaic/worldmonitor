/**
 * Self-hosted premium unlock (SELF_HOSTING.md).
 *
 * Mirrors server/_shared/self-hosted-unlock.ts. The Clerk/Convex/Dodo billing
 * stack exists for the hosted worldmonitor.app product; a self-hoster has
 * nothing to sign in or subscribe to. Setting VITE_SELF_HOSTED_UNLOCK_PREMIUM=true
 * at build time makes hasPremiumAccess()/isProUser() report unlocked without
 * any auth state, matching the server-side bypass that already allows the
 * underlying RPCs through.
 *
 * Defaults to false so a hosted-product build never accidentally ships with
 * every panel unlocked.
 */
export function isSelfHostedPremiumUnlocked(): boolean {
  return import.meta.env.VITE_SELF_HOSTED_UNLOCK_PREMIUM === 'true';
}
