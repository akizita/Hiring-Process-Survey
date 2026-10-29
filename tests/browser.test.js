import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { validateSurveyRequest, prepareResponse } from '../automation/workflow-logic.js';

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const viewports = [
  { width: 1366, height: 768 }, { width: 390, height: 844 },
  { width: 320, height: 568 }, { width: 320, height: 480 }, { width: 667, height: 375 },
];
const successMessage = 'Thank you for your feedback. Your response has been saved.';

async function assertReachable(page, label, action) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const layout = await page.locator('.survey-card').evaluate((card) => {
      const rect = card.getBoundingClientRect();
      card.scrollTop = card.scrollHeight;
      return {
        top: rect.top, bottom: rect.bottom, scrollHeight: card.scrollHeight,
        clientHeight: card.clientHeight, rootWidth: document.documentElement.scrollWidth,
        width: innerWidth, height: innerHeight,
      };
    });
    const size = `${viewport.width}x${viewport.height} ${label}`;
    assert.ok(layout.top >= -1 && layout.bottom <= layout.height + 1, `${size}: card fits viewport`);
    assert.ok(layout.rootWidth <= layout.width, `${size}: no horizontal overflow`);
    const rect = await page.locator(action).boundingBox();
    assert.ok(rect && rect.y >= -1 && rect.y + rect.height <= viewport.height + 1, `${size}: action reachable after scrolling`);
    await page.locator('.survey-card').evaluate((card) => { card.scrollTop = 0; });
  }
}

async function assertModalReachable(page, action) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const panel = page.locator('.modal-panel');
    await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const rect = await panel.boundingBox();
    assert.ok(rect && rect.y >= -1 && rect.y + rect.height <= viewport.height + 1, `${viewport.width}x${viewport.height}: modal fits`);
    const button = await page.locator(action).boundingBox();
    assert.ok(button && button.y >= -1 && button.y + button.height <= viewport.height + 1, `${viewport.width}x${viewport.height}: modal action reachable`);
  }
}

async function acknowledgePrivacy(page) {
  assert.equal(await page.locator('.modal-panel').getAttribute('data-state'), 'privacy');
  await page.locator('#privacy-content').evaluate((content) => { content.scrollTop = content.scrollHeight; });
  await page.waitForFunction(() => !document.querySelector('#privacy-ack').disabled);
  await page.locator('#privacy-ack').check();
  await page.getByRole('button', { name: 'Confirm and submit' }).click();
}

test('light survey stays reachable and saves only after the workflow confirms a row', { skip: !existsSync(chromePath) }, async () => {
  const secret = 'browser-test-secret-32-characters-long';
  const upstreamPayloads = [];
  const rows = new Map();
  const n8n = createHttpServer(async (request, response) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/webhook-test/mock-hiring-feedback');
    assert.equal(request.headers['x-opg-survey-key'], secret);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    upstreamPayloads.push(payload);
    const validated = validateSurveyRequest(payload);
    response.setHeader('Content-Type', 'application/json');
    if (!validated.valid || upstreamPayloads.length === 1) {
      response.statusCode = 500;
      response.end(JSON.stringify({ ok: false }));
      return;
    }
    const row = prepareResponse(validated);
    rows.set(row.response_id, row);
    await new Promise((resolve) => setTimeout(resolve, 120));
    response.statusCode = 200;
    response.end(JSON.stringify({ ok: true, status: 'saved' }));
  });
  await new Promise((resolve) => n8n.listen(0, '127.0.0.1', resolve));
  const previousUrl = process.env.N8N_WEBHOOK_URL;
  const previousSecret = process.env.N8N_WEBHOOK_SECRET;
  process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${n8n.address().port}/webhook-test/mock-hiring-feedback`;
  process.env.N8N_WEBHOOK_SECRET = secret;
  const server = await createServer({ mode: 'test', server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  mkdirSync('test-artifacts', { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 480 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const browserSubmissions = [];
    const browserUrls = [];
    page.on('request', (request) => {
      browserUrls.push(request.url());
      if (new URL(request.url()).pathname === '/api/submit') browserSubmissions.push(JSON.parse(request.postData()));
    });
    await page.route('**/assets/opg-afterfx-*.mp4', (route) => route.abort());
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => document.querySelector('#splash-screen').classList.contains('is-fallback'));
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.splash-lockup')).opacity) > .95
      && Number(getComputedStyle(document.querySelector('.splash-mark-gold')).opacity) > .95);
    assert.equal(await page.locator('.splash-mark-light').evaluate((img) => img.naturalWidth > 0), true);
    assert.equal(await page.locator('.splash-mark-gold').evaluate((img) => img.naturalWidth > 0), true);
    assert.equal(await page.locator('.splash-screen').evaluate((screen) => getComputedStyle(screen).backgroundColor), 'rgb(247, 245, 239)');
    await page.screenshot({ path: join('test-artifacts', 'hiring-splash-fallback-320.png') });
    await page.locator('#splash-screen').waitFor({ state: 'hidden', timeout: 5000 });
    assert.equal(await page.locator('.survey-card').evaluate((card) => card.inert), false);
    assert.equal(await page.locator('#page-title').textContent(), 'Recruitment Process Feedback Form');
    assert.equal(await page.locator('#name').count(), 0);
    assert.equal(await page.locator('#email').count(), 0);
    assert.equal(await page.locator('#recruiterName option').count(), 10);
    await assertReachable(page, 'recruiter', '[data-form-step="0"] [data-next]');
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: join('test-artifacts', 'hiring-recruiter-desktop.png') });

    await page.setViewportSize({ width: 320, height: 480 });
    await page.getByRole('button', { name: 'Continue' }).click();
    assert.match(await page.locator('#modal-title').textContent(), /Choose a recruiter/);
    assert.equal(await page.locator('.survey-card').evaluate((card) => card.inert), true);
    await assertModalReachable(page, '#modal-close');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'recruiterName-trigger');
    await page.locator('#recruiterName-trigger').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#recruiterName').inputValue(), 'Glam');
    await page.getByRole('button', { name: 'Continue' }).click();
    assert.match(await page.locator('#step-caption').textContent(), /Step 2 of 3/);
    await assertReachable(page, 'ratings', '[data-form-step="1"] [data-next]');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Continue' }).click();
    assert.match(await page.locator('#modal-title').textContent(), /Choose a rating/);
    await page.getByRole('button', { name: 'OK' }).click();
    await page.locator('input[name="professionalismRating"][value="5"]').check();
    await page.locator('input[name="roleClarityRating"][value="3"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('input[name="roleClarityRating"]:checked').inputValue(), '4');
    await page.locator('input[name="overallRating"][value="5"]').check();
    assert.deepEqual(await page.locator('.rating-endpoints').allTextContents(), ['Very PoorExcellent', 'Very PoorExcellent', 'Very PoorExcelllent']);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: join('test-artifacts', 'hiring-ratings-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join('test-artifacts', 'hiring-ratings-mobile.png') });
    await page.getByRole('button', { name: 'Back' }).click();
    assert.equal(await page.locator('#recruiterName').inputValue(), 'Glam');
    await page.getByRole('button', { name: 'Continue' }).click();
    assert.equal(await page.locator('input[name="roleClarityRating"]:checked').inputValue(), '4');
    await page.getByRole('button', { name: 'Continue' }).click();
    assert.match(await page.locator('#step-caption').textContent(), /Step 3 of 3/);
    await assertReachable(page, 'feedback', '#submit-button');
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: join('test-artifacts', 'hiring-feedback-desktop.png') });
    await page.setViewportSize({ width: 320, height: 480 });
    await page.screenshot({ path: join('test-artifacts', 'hiring-feedback-short-mobile.png') });

    await page.getByRole('button', { name: 'Submit response' }).click();
    assert.match(await page.locator('#modal-title').textContent(), /Add your feedback/);
    await page.getByRole('button', { name: 'OK' }).click();
    await page.locator('#recruiterFeedback').fill('The recruiter explained the timeline clearly.\nI liked the clear updates.');
    await page.locator('#processImprovements').fill('A clearer next-step email would help.');
    await page.getByRole('button', { name: 'Submit response' }).click();
    assert.equal(await page.locator('.modal-panel').getAttribute('data-state'), 'privacy');
    assert.equal(browserSubmissions.length, 0);
    assert.match(await page.locator('#privacy-content').textContent(), /recruitment feedback/);
    assert.equal(await page.locator('#privacy-content').textContent().then((text) => /unsubscribe|suppression|marketing|contact record/i.test(text)), false);
    await assertModalReachable(page, '#privacy-confirm');
    await page.setViewportSize({ width: 320, height: 480 });
    await page.locator('.modal-panel').evaluate((panel) => { panel.scrollTop = 0; });
    await page.locator('#privacy-content').evaluate((content) => { content.scrollTop = 0; });
    await page.waitForTimeout(450);
    await page.screenshot({ path: join('test-artifacts', 'hiring-privacy-short-mobile.png') });
    assert.equal(await page.locator('#privacy-ack').isChecked(), false);
    await page.locator('#privacy-content').evaluate((content) => { content.scrollTop = content.scrollHeight; });
    await page.waitForFunction(() => !document.querySelector('#privacy-ack').disabled);
    await page.locator('#privacy-ack').check();
    await page.getByRole('button', { name: 'Back to form' }).click();
    await page.getByRole('button', { name: 'Submit response' }).click();
    assert.equal(await page.locator('#privacy-ack').isChecked(), false, 'acknowledgment resets on reopen');
    assert.equal(await page.locator('#privacy-confirm').isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'submit-button');
    await page.getByRole('button', { name: 'Submit response' }).click();
    await acknowledgePrivacy(page);
    await page.locator('#feedback-modal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.modal-panel').getAttribute('data-state'), 'notice');
    assert.equal(rows.size, 0, 'failed upstream response did not save a row');
    assert.equal(browserSubmissions.length, 1);
    await page.getByRole('button', { name: 'Try again' }).click();
    assert.equal(await page.locator('#recruiterFeedback').inputValue(), 'The recruiter explained the timeline clearly.\nI liked the clear updates.');
    await page.getByRole('button', { name: 'Submit response' }).click();
    await acknowledgePrivacy(page);
    await page.waitForFunction(() => document.querySelector('.modal-panel').dataset.state === 'success');
    assert.equal(await page.locator('#modal-message').textContent(), successMessage);
    assert.equal(rows.size, 1);
    assert.equal(upstreamPayloads.length, 2);
    assert.equal(upstreamPayloads[0].responseId, upstreamPayloads[1].responseId);
    assert.equal(browserSubmissions[0].requestId, browserSubmissions[1].requestId);
    assert.equal(browserSubmissions[0].website, '');
    assert.equal(Object.hasOwn(browserSubmissions[0], 'responseId'), false);
    assert.equal(browserUrls.some((url) => url.includes('/webhook-test/') || url.includes(secret)), false);
    await assertModalReachable(page, '#modal-close');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(450);
    await page.screenshot({ path: join('test-artifacts', 'hiring-success-mobile.png') });

    await page.getByRole('button', { name: 'Done' }).click();
    assert.match(await page.locator('#step-caption').textContent(), /Step 1 of 3/);
    assert.equal(await page.locator('#recruiterName').inputValue(), '');
    assert.equal(await page.locator('#recruiterFeedback').inputValue(), '');
    await page.locator('#recruiterName-trigger').click();
    await page.getByRole('option', { name: 'Ella' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    for (const name of ['professionalismRating', 'roleClarityRating', 'overallRating']) {
      await page.locator(`input[name="${name}"][value="1"]`).check();
    }
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('#recruiterFeedback').fill('Helpful interview.');
    await page.locator('#processImprovements').fill('More scheduling options.');
    await page.getByRole('button', { name: 'Submit response' }).click();
    await acknowledgePrivacy(page);
    await page.waitForFunction(() => document.querySelector('.modal-panel').dataset.state === 'success');
    assert.equal(await page.locator('#modal-message').textContent(), successMessage, 'all rating combinations get one generic success message');
    assert.equal(rows.size, 2);
    assert.notEqual(upstreamPayloads[1].responseId, upstreamPayloads[2].responseId);
    assert.deepEqual(pageErrors, [], 'the interactive flow has no uncaught browser errors');
    await page.close();

    for (const [viewport, name, dimensions] of [
      [{ width: 390, height: 844 }, 'portrait', [540, 960]],
      [{ width: 667, height: 375 }, 'compact', [960, 540]],
      [{ width: 1920, height: 1080 }, 'desktop', [1280, 720]],
      [{ width: 2560, height: 1080 }, 'wide', [1720, 720]],
    ]) {
      const videoPage = await browser.newPage({ viewport });
      await videoPage.goto(server.resolvedUrls.local[0]);
      await videoPage.waitForFunction(() => document.querySelector('#splash-screen').classList.contains('is-video-playing'), undefined, { timeout: 5000 });
      const video = await videoPage.locator('#splash-video').evaluate((element) => ({
        src: new URL(element.currentSrc).pathname, size: [element.videoWidth, element.videoHeight],
        duration: element.duration, background: getComputedStyle(element.closest('.splash-screen')).backgroundColor,
      }));
      assert.ok(video.src.endsWith(`/opg-afterfx-${name}.mp4`));
      assert.deepEqual(video.size, dimensions);
      assert.ok(Math.abs(video.duration - 4) < .1);
      assert.equal(video.background, 'rgb(247, 245, 239)');
      if (name === 'compact') {
        await videoPage.waitForTimeout(900);
        await videoPage.screenshot({ path: join('test-artifacts', 'hiring-splash-video-landscape.png') });
      }
      await videoPage.close();
    }
    const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await reduced.goto(server.resolvedUrls.local[0]);
    await reduced.locator('#splash-screen').waitFor({ state: 'hidden' });
    assert.equal(await reduced.locator('#splash-video').evaluate((video) => video.currentSrc), '');
    assert.equal(await reduced.locator('.survey-card').evaluate((card) => card.inert), false);
    await reduced.close();
  } finally {
    await browser.close();
    await server.close();
    await new Promise((resolve) => n8n.close(resolve));
    if (previousUrl === undefined) delete process.env.N8N_WEBHOOK_URL;
    else process.env.N8N_WEBHOOK_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.N8N_WEBHOOK_SECRET;
    else process.env.N8N_WEBHOOK_SECRET = previousSecret;
  }
});
