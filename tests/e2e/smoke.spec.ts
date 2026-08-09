import { test, expect } from '@playwright/test'

test('home page mounts without the course test block', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app')).toBeVisible()
  await expect(page.getByText('test scss')).toHaveCount(0)
})
