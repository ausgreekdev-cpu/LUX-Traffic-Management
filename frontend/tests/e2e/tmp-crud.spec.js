import { test, expect } from '@playwright/test';

test.describe('TMP CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#loginOverlay:not(.hidden)');
    await page.fill('#loginName', 'admin');
    await page.fill('#loginPassword', 'admin');
    await page.click('#loginForm button[type="submit"]');
    await page.waitForSelector('#loginOverlay.hidden', { state: 'attached' });
    await expect(page.locator('#viewTitle')).toContainText('Dashboard');
  });

  test('should create a new TMP', async ({ page }) => {
    await page.click('#newRequestBtn');
    await page.waitForSelector('#modalOverlay.open');
    await expect(page.locator('#modalTitle')).toContainText('New TMP Request');

    await page.fill('#f_projectName', 'E2E Test Project');
    await page.waitForSelector('#f_clientName option', { state: 'attached' });
    const clientOptions = await page.locator('#f_clientName option').all();
    if (clientOptions.length > 1) {
      await page.selectOption('#f_clientName', { index: 1 });
    }
    await page.fill('#f_location', '123 Test Street, Sydney');
    await page.fill('#f_dateOfWorks', '2025-12-31');
    await page.fill('#f_details', 'Test details for E2E');
    await page.fill('#f_assignedTo', 'Test User');
    await page.selectOption('#f_priority', 'high');

    await page.click('#modalSave');
    await page.waitForSelector('#modalOverlay.open', { state: 'hidden' });

    await expect(page.locator('text=E2E Test Project')).toBeVisible({ timeout: 5000 });
  });

  test('should view TMP details', async ({ page }) => {
    await page.click('#newRequestBtn');
    await page.waitForSelector('#modalOverlay.open');
    await page.fill('#f_projectName', 'View Test Project');
    await page.waitForSelector('#f_clientName option', { state: 'attached' });
    const clientOptions = await page.locator('#f_clientName option').all();
    if (clientOptions.length > 1) {
      await page.selectOption('#f_clientName', { index: 1 });
    }
    await page.fill('#f_location', '456 View Ave');
    await page.fill('#f_dateOfWorks', '2025-12-31');
    await page.click('#modalSave');
    await page.waitForSelector('#modalOverlay.open', { state: 'hidden' });

    const row = page.locator('text=View Test Project').first().locator('..').locator('..');
    await row.locator('button[data-action="view"]').click();
    await page.waitForSelector('#modalOverlay.open');
    await expect(page.locator('#modalTitle')).toContainText('TMP Details');
    await expect(page.locator('text=View Test Project')).toBeVisible();
    await page.click('#modalCancel');
  });

  test('should edit a TMP', async ({ page }) => {
    await page.click('#newRequestBtn');
    await page.waitForSelector('#modalOverlay.open');
    await page.fill('#f_projectName', 'Edit Test Project');
    await page.waitForSelector('#f_clientName option', { state: 'attached' });
    const clientOptions = await page.locator('#f_clientName option').all();
    if (clientOptions.length > 1) {
      await page.selectOption('#f_clientName', { index: 1 });
    }
    await page.fill('#f_location', '789 Edit Blvd');
    await page.fill('#f_dateOfWorks', '2025-12-31');
    await page.click('#modalSave');
    await page.waitForSelector('#modalOverlay.open', { state: 'hidden' });

    const row = page.locator('text=Edit Test Project').first().locator('..').locator('..');
    await row.locator('button[data-action="edit"]').click();
    await page.waitForSelector('#modalOverlay.open');
    await expect(page.locator('#modalTitle')).toContainText('Edit TMP Request');

    await page.fill('#f_projectName', 'Edited Project Name');
    await page.click('#modalSave');
    await page.waitForSelector('#modalOverlay.open', { state: 'hidden' });

    await expect(page.locator('text=Edited Project Name')).toBeVisible({ timeout: 5000 });
  });

  test('should advance TMP status', async ({ page }) => {
    await page.click('#newRequestBtn');
    await page.waitForSelector('#modalOverlay.open');
    await page.fill('#f_projectName', 'Advance Test Project');
    await page.waitForSelector('#f_clientName option', { state: 'attached' });
    const clientOptions = await page.locator('#f_clientName option').all();
    if (clientOptions.length > 1) {
      await page.selectOption('#f_clientName', { index: 1 });
    }
    await page.fill('#f_location', 'Advance Location');
    await page.fill('#f_dateOfWorks', '2025-12-31');
    await page.click('#modalSave');
    await page.waitForSelector('#modalOverlay.open', { state: 'hidden' });

    const row = page.locator('text=Advance Test Project').first().locator('..').locator('..');
    await row.locator('button[data-action="advance"]').click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=In Progress').first()).toBeVisible({ timeout: 5000 });
  });

  test('should delete a TMP', async ({ page }) => {
    await page.click('#newRequestBtn');
    await page.waitForSelector('#modalOverlay.open');
    await page.fill('#f_projectName', 'Delete Test Project');
    await page.waitForSelector('#f_clientName option', { state: 'attached' });
    const clientOptions = await page.locator('#f_clientName option').all();
    if (clientOptions.length > 1) {
      await page.selectOption('#f_clientName', { index: 1 });
    }
    await page.fill('#f_location', 'Delete Location');
    await page.fill('#f_dateOfWorks', '2025-12-31');
    await page.click('#modalSave');
    await page.waitForSelector('#modalOverlay.open', { state: 'hidden' });

    const row = page.locator('text=Delete Test Project').first().locator('..').locator('..');
    page.on('dialog', (dialog) => dialog.accept());
    await row.locator('button[data-action="delete"]').click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=Delete Test Project')).not.toBeVisible({ timeout: 5000 });
  });
});
