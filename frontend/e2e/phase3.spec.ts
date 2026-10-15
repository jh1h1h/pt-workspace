import { expect, test } from '@playwright/test';

test.describe.serial('Phase 3 real-backend customization workflow', () => {
  let eid = '';
  let findingId = '';

  test('P3-E2E-01 required custom properties and saved views use real records', async ({ request }) => {
    const engagement = await request.post('/api/v1/engagements', { data: { name: 'Phase 3 acceptance' } });
    expect(engagement.status()).toBe(201);
    eid = (await engagement.json()).id;
    const property = await request.post(`/api/v1/engagements/${eid}/custom-properties`, {
      data: { record_type: 'finding', name: 'Tracking URL', data_type: 'url', required: true, allowed_values: [], default_value: null, display_order: 0, visible: true }
    });
    expect(property.status()).toBe(201);
    const definition = await property.json();
    const missing = await request.post(`/api/v1/engagements/${eid}/findings`, { data: { title: 'Missing required property' } });
    expect(missing.status()).toBe(422);
    const created = await request.post(`/api/v1/engagements/${eid}/findings`, {
      data: { title: 'Searchable authorization finding', custom_values: { [definition.id]: 'https://tracker.example/FND-1' } }
    });
    expect(created.status()).toBe(201);
    findingId = (await created.json()).id;
    const view = await request.post(`/api/v1/engagements/${eid}/saved-views`, {
      data: { record_type: 'finding', name: 'Authorization findings', is_default: true, config: { columns: ['display_id', 'title', `custom:${definition.id}`], column_order: ['display_id', 'title', `custom:${definition.id}`], column_widths: { title: 260 }, filters: [{ field: 'title', value: 'authorization' }], sorts: [{ field: 'title', direction: 'asc' }], group_by: 'validation_status' } }
    });
    expect(view.status()).toBe(201);
    const records = await request.get(`/api/v1/engagements/${eid}/saved-views/${(await view.json()).id}/records`);
    expect((await records.json()).items.map((item: { id: string }) => item.id)).toEqual([findingId]);
  });

  test('P3-E2E-02 evidence bytes stay exact and restricted evidence is not searchable', async ({ request }) => {
    const bytes = Buffer.from('<script>never execute</script>\nGET / HTTP/1.1\r\nHost: example.test\r\n\r\n');
    const metadata = encodeURIComponent(JSON.stringify({ title: 'Restricted traffic secret', evidence_type: 'HTTP exchange', review_state: 'Restricted', related_id: findingId }));
    const upload = await request.post(`/api/v1/engagements/${eid}/evidence-files?metadata=${metadata}`, {
      data: bytes,
      headers: { 'Content-Type': 'text/html', 'X-Filename': '../../traffic.html' }
    });
    expect(upload.status()).toBe(201);
    const body = await upload.json();
    expect(body.file.original_filename).toBe('traffic.html');
    const preview = await request.get(`/api/v1/engagements/${eid}/evidence-files/${body.page.id}/preview`);
    expect(preview.status()).toBe(403);
    const download = await request.get(`/api/v1/engagements/${eid}/evidence-files/${body.page.id}/download`);
    expect(await download.body()).toEqual(bytes);
    const search = await request.get(`/api/v1/engagements/${eid}/search?q=secret`);
    expect(await search.json()).toEqual([]);
  });

  test('P3-E2E-03 import preview is non-mutating and quick capture/search work from the UI', async ({ request, page }) => {
    const before = await request.get(`/api/v1/engagements/${eid}/attack-surfaces`);
    expect((await before.json()).total).toBe(0);
    const preview = await request.post(`/api/v1/engagements/${eid}/imports/preview?format=csv&filename=routes.csv`, {
      data: Buffer.from('url,method,source\nhttps://example.test/login,GET,offline-fixture\n'),
      headers: { 'Content-Type': 'application/octet-stream' }
    });
    expect(preview.status()).toBe(201);
    expect((await (await request.get(`/api/v1/engagements/${eid}/attack-surfaces`)).json()).total).toBe(0);
    const confirmed = await request.post(`/api/v1/engagements/${eid}/imports/confirm`, { data: { import_id: (await preview.json()).id } });
    expect((await confirmed.json()).created).toBe(1);

    await page.goto(`/e/${eid}/home`);
    await page.keyboard.press('Control+Shift+K');
    await expect(page.getByRole('dialog', { name: 'Quick Capture' })).toBeVisible();
    await page.getByLabel('Quick capture type').selectOption('task');
    await page.getByLabel('Quick capture title').fill('Keyboard captured task');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Quick Capture' })).toHaveCount(0);
    await page.keyboard.press('Control+K');
    await page.getByLabel('Search workspace').fill('Keyboard captured');
    await expect(page.getByRole('dialog', { name: 'Global search' }).getByRole('link', { name: /Keyboard captured task/ })).toBeVisible();
  });
});
