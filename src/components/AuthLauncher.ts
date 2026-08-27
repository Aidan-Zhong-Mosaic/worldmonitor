import { openSignIn } from '@/services/clerk';

/**
 * Minimal auth launcher -- wraps Clerk.openSignIn().
 * Replaces the custom OTP modal. Clerk handles all UI.
 *
 * Sign-up / account creation is deliberately NOT exposed: the app signs in
 * to a single existing account (see clerk.ts getAppearance, which also hides
 * Clerk's own "Sign up" footer link).
 */
export class AuthLauncher {
  public open(): void {
    openSignIn();
  }

  public close(): void {
    // Clerk manages its own modal lifecycle
  }

  public destroy(): void {
    // Nothing to clean up -- Clerk manages its own resources
  }
}
