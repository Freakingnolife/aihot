import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverDetails, pickCoverImage } from '@aihot/backend/media/cover';

const img = (url: string) => ({ kind: 'image', url });

test('the first real picture fronts the card', () => {
  const media = [img('https://bcn3d.com/wp-content/uploads/2026/06/G2-Principal.jpg'), img('https://bcn3d.com/wp-content/uploads/2026/06/XY-Calibration-1.jpg')];
  assert.equal(pickCoverImage(media), 'https://bcn3d.com/wp-content/uploads/2026/06/G2-Principal.jpg');
});

test('page furniture is skipped: emoji, tracking pixels, icons, tiny thumbnails, GIF and SVG', () => {
  const media = [
    img('https://s.w.org/images/core/emoji/17.0.2/72x72/2122.png'),
    img('https://example.com/r?bu=https%253A%252F%252Fexample.com&bvt=rss'),
    img('https://example.com/assets/site-logo.png'),
    img('https://cdn.shopify.com/s/files/1/0276/files/bianca-clark_240x240.jpg?v=1'),
    img('https://example.com/spinner.gif'),
    img('https://example.com/mark.svg'),
    img('https://example.com/wp-content/uploads/2026/09/hero-1024x576.jpg'),
  ];
  assert.equal(pickCoverImage(media), 'https://example.com/wp-content/uploads/2026/09/hero-1024x576.jpg');
});

test('a 480px square thumbnail is large enough; HTML-escaped ampersands are restored', () => {
  assert.equal(pickCoverImage([img('https://cdn.shopify.com/files/IMG_3136_480x480.jpg?v=1')]), 'https://cdn.shopify.com/files/IMG_3136_480x480.jpg?v=1');
  assert.equal(pickCoverImage([img('https://siraya.tech/cdn/shop/files/a.png?v=1&amp;width=1200')]), 'https://siraya.tech/cdn/shop/files/a.png?v=1&width=1200');
});

test('no usable picture, videos and malformed media all give no cover', () => {
  assert.equal(pickCoverImage([]), null);
  assert.equal(pickCoverImage(null), null);
  assert.equal(pickCoverImage('not media'), null);
  assert.equal(pickCoverImage([{ kind: 'video', url: 'https://example.com/a.mp4' }, img('ftp://example.com/a.jpg'), { kind: 'image' }]), null);
  assert.equal(pickCoverImage([img('https://s.w.org/images/core/emoji/14.0.0/72x72/2122.png')]), null);
});

test('lead suitability has good, unknown and bad states', () => {
  const certificate = 'https://example.com/MX3D-DNV-AMC3-certification-780x470.jpg';
  const photo = 'https://example.com/factory-floor-780x470.jpg';
  const small = 'https://example.com/thumbnail-480x320.jpg';
  const screenshot = 'https://example.com/Screenshot-1200x800.jpg';
  const polishScreenshot = 'https://example.com/Zrzut-ekranu-1200x800.jpg';
  const portrait = 'https://example.com/portrait.jpg';
  const extreme = 'https://example.com/banner.jpg';
  const unknown = 'https://example.com/h350-1.webp';
  assert.equal(coverDetails([img(certificate)], certificate).leadSuitability, 'bad');
  assert.equal(coverDetails([img(photo)], photo).leadSuitability, 'good');
  assert.equal(coverDetails([img(small)], small).leadSuitability, 'bad');
  assert.equal(coverDetails([img(screenshot)], screenshot).leadSuitability, 'bad');
  assert.equal(coverDetails([img(polishScreenshot)], polishScreenshot).leadSuitability, 'bad');
  assert.equal(coverDetails([{ ...img(portrait), width: 819, height: 1024 }], portrait).leadSuitability, 'bad');
  assert.equal(coverDetails([{ ...img(extreme), width: 2400, height: 500 }], extreme).leadSuitability, 'bad');
  assert.equal(coverDetails([img(unknown)], unknown).leadSuitability, 'unknown');
  assert.equal(coverDetails([{ ...img(unknown), width: 600 }], unknown).leadSuitability, 'bad');
  assert.equal(coverDetails([{ ...img(unknown), height: 399 }], unknown).leadSuitability, 'bad');
  assert.equal(coverDetails([img('https://example.com/five-size-seal-project-shot-780x470.jpg')], 'https://example.com/five-size-seal-project-shot-780x470.jpg').leadSuitability, 'good');
});
