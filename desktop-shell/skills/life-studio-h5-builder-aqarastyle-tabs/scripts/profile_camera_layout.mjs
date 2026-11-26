#!/usr/bin/env node
// Local canvas media only: no camera access, bridge, signaling or production fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (key) => args[args.indexOf(key) + 1];
const packageDir = resolve(args[0] || '.');
const modulePath = args.includes('--playwright-module') ? pathToFileURL(resolve(option('--playwright-module'))).href : 'playwright';
const imported = await import(modulePath);
const { chromium } = imported.default || imported;
const browser = await chromium.launch({ headless: true, ...(args.includes('--browser') ? { executablePath: resolve(option('--browser')) } : {}) });
const measurements = [];
try {
  const page = await browser.newPage();
  const styles = readFileSync(join(packageDir, 'styles.css'), 'utf8');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.setContent(`<html data-ui-profile="aqara" data-style="aqara"><head><style>${styles}</style></head><body><main class="app-shell"><div class="device-grid"><article class="device-card category-camera aqara-size-xl"><div class="device-row">Camera</div><div class="device-meta"><strong>Camera</strong><span>Live</span></div><section class="camera-stream"><div class="camera-stream-viewport"><video class="camera-stream-video" muted playsinline></video></div><div class="camera-stream-controls"><span class="camera-stream-status">Live</span><button class="camera-stream-button">Pause</button></div></section></article><article class="device-card aqara-size-m">Next device</article></div></main></body></html>`);
    for (const [sourceWidth, sourceHeight] of [[1280, 720], [640, 480], [360, 640]]) {
      const result = await page.evaluate(async ({ sourceWidth, sourceHeight }) => {
        const video = document.querySelector('video');
        video.srcObject?.getTracks().forEach((track) => track.stop());
        const canvas = document.createElement('canvas');
        canvas.width = sourceWidth; canvas.height = sourceHeight;
        const context = canvas.getContext('2d');
        context.fillStyle = '#008080'; context.fillRect(0, 0, sourceWidth, sourceHeight);
        context.fillStyle = '#ffffff'; context.beginPath(); context.arc(sourceWidth / 2, sourceHeight / 2, Math.min(sourceWidth, sourceHeight) / 4, 0, Math.PI * 2); context.fill();
        const bounds = () => {
          const viewport = document.querySelector('.camera-stream-viewport').getBoundingClientRect();
          const card = document.querySelector('.category-camera').getBoundingClientRect();
          const controls = document.querySelector('.camera-stream-controls').getBoundingClientRect();
          const next = document.querySelector('.aqara-size-m').getBoundingClientRect();
          const media = video.getBoundingClientRect();
          return { width: viewport.width, height: viewport.height, cardHeight: card.height, contained: media.left >= card.left && media.right <= card.right && controls.bottom <= card.bottom && controls.top >= viewport.bottom, separated: next.top >= card.bottom, overflow: document.documentElement.scrollWidth - innerWidth };
        };
        const before = bounds();
        const loaded = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('local QA media timeout')), 5000); video.onloadeddata = () => { clearTimeout(timer); resolve(); }; });
        video.srcObject = canvas.captureStream(1);
        await video.play(); await loaded;
        const style = getComputedStyle(video);
        const playing = bounds(); video.pause(); const paused = bounds(); await video.play();
        const result = { before, playing, paused, sourceWidth: video.videoWidth, sourceHeight: video.videoHeight, fit: style.objectFit, position: style.objectPosition, boxWidth: video.clientWidth, boxHeight: video.clientHeight };
        video.srcObject.getTracks().forEach((track) => track.stop()); video.srcObject = null;
        return result;
      }, { sourceWidth, sourceHeight });
      assert.equal(result.sourceWidth, sourceWidth); assert.equal(result.sourceHeight, sourceHeight);
      assert.equal(result.fit, 'contain'); assert.equal(result.position, '50% 50%');
      assert.ok(Math.abs(result.playing.width / result.playing.height - 16 / 9) < 0.001);
      assert.ok(Math.abs(result.boxWidth - result.playing.width) <= 1 && Math.abs(result.boxHeight - result.playing.height) <= 1);
      assert.deepEqual(result.playing, result.before, 'media readiness must not change card geometry');
      assert.deepEqual(result.paused, result.before, 'pause must not change card geometry');
      assert.ok(result.playing.contained && result.playing.separated && result.playing.overflow === 0);
      measurements.push({ width, source: [sourceWidth, sourceHeight], viewport: [result.playing.width, result.playing.height], fit: result.fit });
    }
  }
  console.log(JSON.stringify({ passed: true, measurements }, null, 2));
} finally { await browser.close(); }
