import { expect, type Page } from '@playwright/test';

// Mirrors --header-auth-slot-width in src/styles/header.css. The header no
// longer renders Sign In or Create account, so the slot is sized to the
// signed-in Clerk avatar (32px) — the only thing that can appear there.
export const HEADER_AUTH_SLOT_WIDTH = 32;

type Box = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const waitForLayoutFrame = async (page: Page): Promise<void> => {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
};

const expectBoxesToMatch = (actual: Box, expected: Box, message: string): void => {
  expect(Math.abs(actual.x - expected.x), `${message} x`).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.y - expected.y), `${message} y`).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.width - expected.width), `${message} width`).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.height - expected.height), `${message} height`).toBeLessThanOrEqual(1);
};

export const assertSignedOutAuthHydrationKeepsHeaderStable = async (page: Page): Promise<void> => {
  await page.locator('.header').waitFor();
  const result = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.header');
    const authMount = document.getElementById('authWidgetMount');
    if (!header || !authMount) {
      throw new Error('missing header auth reservation elements');
    }

    const rectOf = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      };
    };

    const beforeHeaderBox = rectOf(header);
    const beforeAuthMountBox = rectOf(authMount);
    const pendingSkeletonCount = authMount.querySelectorAll('.auth-header-skeleton').length;

    const widget = document.createElement('div');
    widget.className = 'auth-header-widget';

    // Signed out renders nothing now, so the widest real content is the
    // signed-in Clerk avatar. Synthesize that to prove it fits the slot.
    const avatar = document.createElement('div');
    avatar.className = 'auth-clerk-user-button';
    avatar.style.width = '32px';
    avatar.style.height = '32px';
    widget.appendChild(avatar);

    authMount.replaceChildren(widget);

    return {
      beforeAuthMountBox,
      beforeHeaderBox,
      pendingSkeletonCount,
    };
  });

  await waitForLayoutFrame(page);

  const hydrated = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.header');
    const authMount = document.getElementById('authWidgetMount');
    const widget = authMount?.querySelector<HTMLElement>('.auth-header-widget');
    if (!header || !authMount || !widget) {
      throw new Error('missing hydrated header auth elements');
    }

    const rectOf = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      };
    };

    return {
      afterAuthMountBox: rectOf(authMount),
      afterHeaderBox: rectOf(header),
      hydratedWidgetBox: rectOf(widget),
      authMountMinWidth: getComputedStyle(authMount).minWidth,
    };
  });

  expect(hydrated.authMountMinWidth).toBe(`${HEADER_AUTH_SLOT_WIDTH}px`);
  expect(result.beforeAuthMountBox.width).toBeGreaterThanOrEqual(HEADER_AUTH_SLOT_WIDTH);
  expect(hydrated.afterAuthMountBox.width).toBeGreaterThanOrEqual(HEADER_AUTH_SLOT_WIDTH);
  // The avatar must fit inside the reserved slot so hydration cannot widen
  // the header.
  expect(hydrated.hydratedWidgetBox.width).toBeGreaterThan(0);
  expect(hydrated.hydratedWidgetBox.width).toBeLessThanOrEqual(HEADER_AUTH_SLOT_WIDTH + 1);
  // The pending state renders no skeletons at all now: they existed to reserve
  // space for the Sign In button, which no longer renders.
  expect(result.pendingSkeletonCount).toBe(0);
  expectBoxesToMatch(hydrated.afterAuthMountBox, result.beforeAuthMountBox, 'auth mount');
  expectBoxesToMatch(hydrated.afterHeaderBox, result.beforeHeaderBox, 'header');
};
