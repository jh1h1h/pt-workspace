import { test, expect, type Page } from '@playwright/test';
async function engagement(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('New engagement name').fill(name);
  await page.getByRole('button', {
    name: 'Create engagement',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: 'Home',
    exact: true
  })).toBeVisible();
}
async function note(page: Page, title: string) {
  await page.getByRole('complementary',{name:'Workspace navigation'}).getByRole('link', {
    name: 'All Pages',
    exact: true
  }).click();
  await page.getByLabel('New page title').fill(title);
  await page.getByRole('button', {
    name: 'Create page',
    exact: true
  }).click();
  await expect(page.getByLabel('Page title',{exact:true})).toHaveValue(title);
}
async function saved(page: Page) {
  await expect(page.getByRole('status').filter({
    hasText: /^Saved$/
  })).toBeVisible();
}
test('P1-E01 empty database creates engagement and note', async ({
  page,
  request
}) => {
  const empty = await request.get('/api/v1/engagements');
  expect((await empty.json()).items).toEqual([]);
  await engagement(page, 'E01 engagement');
  await page.screenshot({path:'../docs/home-preview.png',fullPage:true});
  await note(page, 'Initial note');
  await expect(page.getByText('PAGE-0001 · note')).toBeVisible();
});
test('P1-E02 note content survives reload', async ({
  page
}) => {
  await engagement(page, 'E02 engagement');
  await note(page, 'Persistent note');
  await page.getByRole('textbox', {
    name: 'Document',
    exact: true
  }).fill('A persistent observation');
  await saved(page);
  await page.reload();
  await expect(page.getByRole('textbox', {
    name: 'Document',
    exact: true
  })).toContainText('A persistent observation');
});
test('P1-E03 completed personal task remains in My Tasks', async ({
  page
}) => {
  await engagement(page, 'E03 engagement');
  await page.getByLabel('New personal task').fill('Review written scope');
  await page.getByRole('button', {
    name: 'Add task',
    exact: true
  }).click();
  await page.getByRole('checkbox', {
    name: 'Complete Review written scope'
  }).click();
  await expect(page.getByRole('checkbox', {
    name: 'Complete Review written scope'
  })).toHaveCount(0);
  await page.getByRole('link', {
    name: 'My Tasks',
    exact: true
  }).click();
  await expect(page.getByRole('checkbox', {
    name: 'Complete Review written scope'
  })).toBeChecked();
});
test('P1-E04 nested pages and breadcrumbs', async ({
  page
}) => {
  await engagement(page, 'E04 engagement');
  await note(page, 'Parent');
  await page.getByLabel('New child page title').fill('Child');
  await page.getByRole('button', {
    name: 'Add child page',
    exact: true
  }).click();
  await expect(page.getByLabel('Page title',{exact:true})).toHaveValue('Child');
  await page.getByRole('navigation', {
    name: 'Breadcrumbs'
  }).getByRole('link', {
    name: 'Parent',
    exact: true
  }).click();
  await expect(page.getByLabel('Page title',{exact:true})).toHaveValue('Parent');
});
test('P1-E05 actual page openings update Recently Opened', async ({
  page
}) => {
  await engagement(page, 'E05 engagement');
  await note(page, 'First recent');
  await note(page, 'Second recent');
  await page.getByRole('link', {
    name: 'Home',
    exact: true
  }).click();
  const recent = page.getByRole('region', {
    name: 'Recently Opened'
  });
  await expect(recent.getByRole('link').first()).toContainText('Second recent');
  await recent.getByRole('link').filter({
    hasText: 'First recent'
  }).click();
  await page.getByRole('link', {
    name: 'Home',
    exact: true
  }).click();
  await expect(page.getByRole('region', {
    name: 'Recently Opened'
  }).getByRole('link').first()).toContainText('First recent');
});
test('P1-E06 engagement switching isolates tasks and scratchpads', async ({
  page
}) => {
  await engagement(page, 'E06 One');
  const first = await page.getByLabel('Engagement switcher').inputValue();
  await page.getByRole('textbox', {
    name: 'Scratchpad content'
  }).fill('Private to One');
  await page.getByLabel('New personal task').fill('One only');
  await page.getByRole('button', {
    name: 'Add task',
    exact: true
  }).click();
  await saved(page);
  await engagement(page, 'E06 Two');
  await expect(page.getByRole('textbox', {
    name: 'Scratchpad content'
  })).not.toContainText('Private to One');
  await expect(page.getByRole('checkbox', {
    name: 'Complete One only'
  })).toHaveCount(0);
  await page.getByLabel('Engagement switcher').selectOption(first);
  await expect(page.getByRole('textbox', {
    name: 'Scratchpad content'
  })).toContainText('Private to One');
  await expect(page.getByRole('checkbox', {
    name: 'Complete One only'
  })).toBeVisible();
});
test('P1-E07 failed autosave retains editor state and can retry', async ({
  page
}) => {
  await engagement(page, 'E07 engagement');
  await note(page, 'Failed save recovery');
  await page.route('**/api/v1/engagements/*/pages/*', async route => {
    if (route.request().method() === 'PATCH') await route.abort('failed');else await route.continue();
  });
  const editor = page.getByRole('textbox', {
    name: 'Document',
    exact: true
  });
  await editor.fill('Keep my unsaved work');
  await expect(page.getByRole('status').filter({
    hasText: 'Save Failed'
  })).toBeVisible();
  await expect(editor).toContainText('Keep my unsaved work');
  await page.getByRole('link', {
    name: 'Home',
    exact: true
  }).click();
  await expect(page.getByRole('dialog', {
    name: 'Unsaved changes'
  })).toBeVisible();
  await page.getByRole('button', {
    name: 'Stay on page'
  }).click();
  await expect(editor).toContainText('Keep my unsaved work');
  await page.unroute('**/api/v1/engagements/*/pages/*');
  await page.getByRole('button', {
    name: 'Retry save'
  }).click();
  await saved(page);
  await page.reload();
  await expect(page.getByRole('textbox', {
    name: 'Document',
    exact: true
  })).toContainText('Keep my unsaved work');
});
test('P1-E08 undo redo formatting and slash blocks persist', async ({
  page
}) => {
  await engagement(page, 'E08 engagement');
  await note(page, 'Rich formatting');
  const editor = page.getByRole('textbox', {
    name: 'Document',
    exact: true
  });
  await editor.click();
  await page.getByRole('button', {
    name: 'Bold',
    exact: true
  }).click();
  await page.keyboard.type('Bold observation');
  await page.getByRole('button', {
    name: 'Bold',
    exact: true
  }).click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('/heading');
  await page.getByRole('listbox',{name:'Slash commands'}).getByRole('option', {
    name: 'Heading 2',
    exact: true
  }).click();
  await page.keyboard.type('Section heading');
  await page.getByRole('button', {
    name: 'Undo',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: 'Redo',
    exact: true
  }).click();
  await expect(editor.locator('h2')).toContainText('Section heading');
  await saved(page);
  await page.reload();
  const persisted = page.getByRole('textbox', {
    name: 'Document',
    exact: true
  });
  await expect(persisted.locator('strong')).toContainText('Bold observation');
  await expect(persisted.locator('h2')).toContainText('Section heading');
  await page.screenshot({path:'../docs/editor-preview.png',fullPage:true});
});
