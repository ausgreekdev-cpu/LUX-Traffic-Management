import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#loginOverlay:not(.hidden)');
  });

  test('should show login screen initially', async ({ page }) => {
    await expect(page.locator('#loginOverlay')).toBeVisible();
    await expect(page.locator('#loginTitle')).toContainText('Traffic Planning');
    await expect(page.locator('#loginForm')).toBeVisible();
  });

  test('should login successfully with admin credentials', async ({ page }) => {
    await page.fill('#loginName', 'admin');
    await page.fill('#loginPassword', 'admin');
    await page.click('#loginForm button[type="submit"]');
    await page.waitForSelector('#loginOverlay.hidden', { state: 'attached' });
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#viewTitle')).toContainText('Dashboard');
    await expect(page.locator('#userBadgeText')).toContainText('Admin');
  });

  test('should login successfully with planner credentials', async ({ page }) => {
    await page.fill('#loginName', 'planner');
    await page.fill('#loginPassword', 'planner');
    await page.click('#loginForm button[type="submit"]');
    await page.waitForSelector('#loginOverlay.hidden', { state: 'attached' });
    await expect(page.locator('#userBadgeText')).toContainText('Planner');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('#loginName', 'invalid');
    await page.fill('#loginPassword', 'wrong');
    await page.click('#loginForm button[type="submit"]');
    await expect(page.locator('#roleDesc')).toContainText('Invalid username or password');
  });

  test('should logout when clicking user badge', async ({ page }) => {
    await page.fill('#loginName', 'admin');
    await page.fill('#loginPassword', 'admin');
    await page.click('#loginForm button[type="submit"]');
    await page.waitForSelector('#loginOverlay.hidden', { state: 'attached' });
    await page.click('#userBadge');
    await page.waitForSelector('#loginOverlay:not(.hidden)', { state: 'attached' });
  });
});
