/**
 * Self-hosted premium unlock (SELF_HOSTING.md).
 *
 * The Clerk/Convex/Dodo billing stack in this repo exists for the hosted
 * worldmonitor.app product. A self-hoster running their own instance has no
 * reason to sign in or subscribe to unlock their own server, but the premium
 * gates (server/_shared/premium-check.ts, server/_shared/entitlement-check.ts,
 * server/gateway.ts, api/widget-agent.ts) are shared with the hosted product
 * and must stay intact there. Setting SELF_HOSTED_UNLOCK_PREMIUM=true opts a
 * self-hosted deployment out of every one of those checks at once.
 *
 * Defaults to false so an accidental unset env var never opens the hosted
 * deployment's paywall.
 */
export function isSelfHostedPremiumUnlocked(): boolean {
  return process.env.SELF_HOSTED_UNLOCK_PREMIUM === 'true';
}
