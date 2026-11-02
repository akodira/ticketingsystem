import { expect, test } from '@playwright/test';

/**
 * Public routes need no accounts, so these run on every environment including
 * a preview deployment.
 */

test.describe('public pages', () => {
  test('English landing page renders LTR with the product name', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Support that keeps you informed');
    await expect(page.getByRole('link', { name: /create an account/i })).toBeVisible();
  });

  test('Arabic landing page renders RTL in Arabic', async ({ page }) => {
    await page.goto('/ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('دعم يبقيك');
  });

  test('language switch keeps the user on the same page', async ({ page }) => {
    await page.goto('/en/sign-in');
    await page.getByRole('button', { name: /switch language/i }).click();
    await expect(page).toHaveURL(/\/ar\/sign-in$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('sign-in form is accessible and labelled', async ({ page }) => {
    await page.goto('/en/sign-in');
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/^password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  });

  test('sign-up validates a mismatched password before submitting', async ({ page }) => {
    await page.goto('/en/sign-up');
    await page.getByLabel(/full name/i).fill('Test Customer');
    await page.getByLabel(/email address/i).fill('e2e-mismatch@example.com');
    await page.getByLabel(/^password/i).fill('correct-horse-battery');
    await page.getByLabel(/confirm password/i).fill('something-else-entirely');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test('sign-up rejects a short password', async ({ page }) => {
    await page.goto('/en/sign-up');
    await page.getByLabel(/full name/i).fill('Test Customer');
    await page.getByLabel(/email address/i).fill('e2e-short@example.com');
    await page.getByLabel(/^password/i).fill('short');
    await page.getByLabel(/confirm password/i).fill('short');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText(/at least 10 characters/i)).toBeVisible();
  });
});

test.describe('authorization gates', () => {
  test('customer portal redirects an anonymous visitor to sign-in', async ({ page }) => {
    await page.goto('/en/portal');
    await expect(page).toHaveURL(/\/en\/sign-in\?next=%2Fportal/);
  });

  test('support console redirects an anonymous visitor to sign-in', async ({ page }) => {
    await page.goto('/ar/console');
    await expect(page).toHaveURL(/\/ar\/sign-in\?next=%2Fconsole/);
  });

  test('health endpoint reports its real state', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = await response.json();
    // 200 when a database is reachable, 503 when it is not — never a fake OK.
    expect([200, 503]).toContain(response.status());
    expect(['ok', 'unconfigured', 'degraded']).toContain(body.status);
  });
});

test.describe('Arabic RTL layout', () => {
  test('sign-in page is mirrored on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');
    await page.goto('/ar/sign-in');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const form = page.locator('form').first();
    const box = await form.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
      // The form must fit the viewport without horizontal scrolling.
      expect(box.width).toBeLessThanOrEqual(viewport.width);
    }
  });
});
