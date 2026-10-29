import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

test('production frontend has the light splash assets and no server secret or webhook URL', () => {
  const oldUrl = 'https://old-public-webhook.example/webhook-test/exposed-marker';
  const privateUrl = 'https://private-n8n.example/webhook/production-marker';
  const secret = 'private-auth-secret-marker-never-in-browser';
  const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
    encoding: 'utf8',
    env: { ...process.env, VITE_N8N_WEBHOOK_URL: oldUrl, N8N_WEBHOOK_URL: privateUrl, N8N_WEBHOOK_SECRET: secret },
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const built = files('dist');
  const builtText = built.filter((path) => /\.(?:html|js|css|json)$/.test(path)).map((path) => readFileSync(path, 'utf8')).join('\n');
  for (const marker of [oldUrl, privateUrl, secret, 'VITE_N8N_WEBHOOK_URL', 'webhook-test']) {
    assert.equal(builtText.includes(marker), false, `${marker} must not appear in dist`);
  }
  assert.equal(builtText.includes('/api/submit'), true);
  for (const name of ['compact', 'desktop', 'portrait', 'wide']) {
    assert.equal(built.some((path) => path.replaceAll('\\', '/').endsWith(`/assets/opg-afterfx-${name}.mp4`)), true);
  }
  assert.equal(built.some((path) => path.replaceAll('\\', '/').endsWith('/assets/opg-splash-ink.png')), true);
  assert.equal(built.some((path) => path.replaceAll('\\', '/').endsWith('/assets/opg-afterfx-poster.png')), true);
  assert.match(builtText, /<link rel="icon" type="image\/png" href="\/assets\/Logo-[^"]+\.png"\s*\/?>/);
  assert.equal(built.some((path) => /\/assets\/Logo-[^/]+\.png$/.test(path.replaceAll('\\', '/'))), true);
});

test('Vercel configuration retains restrictive headers and a static Vite build', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.equal(config.framework, 'vite');
  assert.equal(config.outputDirectory, 'dist');
  const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.match(headers['content-security-policy'], /connect-src 'self'/);
  assert.match(headers['content-security-policy'], /media-src 'self'/);
  assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'no-referrer');
  assert.equal(config.headers[1].headers[0].value, 'no-store');
});
