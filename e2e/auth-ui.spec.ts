import { expect, test } from '@playwright/test';

test.describe('auth UI (anonymous state)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Dismiss the layer performance warning overlay
      localStorage.setItem('wm-layer-warning-dismissed', 'true');
    });
  });

  // The Sign In button tests were removed with the button itself: the header
  // exposes no auth entry point now (the dashboard authenticates into a single
  // existing account programmatically). Anonymous gating is still asserted below.
  test('header exposes no sign-in or sign-up CTA', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.panel', { timeout: 20000 });
    await expect(page.locator('.auth-signin-btn')).toHaveCount(0);
    await expect(page.locator('.auth-signup-link')).toHaveCount(0);
  });

  test('premium panels gated for anonymous users', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.panel', { timeout: 20000 });
    await expect(page.locator('.panel-is-locked').first()).toBeVisible({ timeout: 15000 });
  });
});
