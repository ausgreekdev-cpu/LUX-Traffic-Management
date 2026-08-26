import { test, expect } from '@playwright/test';

test.describe('Admin Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#loginOverlay:not(.hidden)');
    await page.fill('#loginName', 'admin');
    await page.fill('#loginPassword', 'admin');
    await page.click('#loginForm button[type="submit"]');
    await page.waitForSelector('#loginOverlay.hidden', { state: 'attached' });
  });

  test('should open admin settings', async ({ page }) => {
    await page.click('#adminBtn');
    await page.waitForSelector('.settings-section.open');
    await expect(page.locator('#viewTitle')).toContainText('Admin Settings');
  });

  test('should navigate between settings tabs', async ({ page }) => {
    await page.click('#adminBtn');
    await page.waitForSelector('.settings-section.open');

    await page.click('[data-stab="menu"]');
    await expect(page.locator('#menu .settings-section')).toBeVisible();

    await page.click('[data-stab="statuses"]');
    await expect(page.locator('#statuses .settings-section')).toBeVisible();

    await page.click('[data-stab="priorities"]');
    await expect(page.locator('#priorities .settings-section')).toBeVisible();

    await page.click('[data-stab="theme"]');
    await expect(page.locator('#theme .settings-section')).toBeVisible();
  });

  test('should update app name in General tab', async ({ page }) => {
    await page.click('#adminBtn');
    await page.waitForSelector('.settings-section.open');

    await page.fill('#s-appName', 'E2E Custom Name');
    await page.waitForTimeout(300);

    await expect(page.locator('#sidebarTitle')).toContainText('E2E Custom Name');
    await expect(page.locator('#loginTitle')).toContainText('E2E Custom Name');
  });

  test('should add a new menu item', async ({ page }) => {
    await page.click('#adminBtn');
    await page.waitForSelector('.settings-section.open');

    await page.click('[data-stab="menu"]');
    await page.click('[data-action="add-menu-item"]');
    await page.waitForTimeout(300);

    const newItem = page.locator('.setting-row[data-idx]').last();
    await newItem.locator('.s-menu-label').fill('Custom Menu Item');
    await newItem.locator('.s-menu-icon').fill('⭐');
    await page.waitForTimeout(300);

    await expect(page.locator('#sidebarNav a:has-text("Custom Menu Item")')).toBeVisible({ timeout: 5000 });
  });

  test('should add a new status', async ({ page }) => {
    await page.click('#adminBtn');
    await page.waitForSelector('.settings-section.open');

    await page.click('[data-stab="statuses"]');
    const initialCount = await page.locator('#statuses .setting-row[data-sidx]').count();

    await page.click('[data-action="add-status"]');
    await page.waitForTimeout(300);

    await expect(page.locator('#statuses .setting-row[data-sidx]')).toHaveCount(initialCount + 1);
  });

  test('should toggle theme color', async ({ page }) => {
    await page.click('#adminBtn');
    await page.waitForSelector('.settings-section.open');

    await page.click('[data-stab="theme"]');
    await page.waitForTimeout(300);

    const primaryInput = page.locator('.s-theme-color[data-key="primary"]').first();
    await primaryInput.fill('#ff0000');
    await page.waitForTimeout(300);

    await expect(page.locator(':root')).toHaveCSS('--primary', 'rgb(255, 0, 0)');
  });

  test('should export JSON', async ({ page }) => {
    await page.click('#adminBtn');
    await page.waitForSelector('.settings-section.open');

    await page.click('[data-stab="exportimport"]');
    await page.waitForTimeout(300);

    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-action="export-json"]');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/TMPs_export_.*\.json/);
  });
});
