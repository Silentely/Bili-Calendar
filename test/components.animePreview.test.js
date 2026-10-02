import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

// Ensure globals exist before i18n module and AnimePreview are evaluated
if (!global.localStorage) {
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };
}

if (!global.requestAnimationFrame) {
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}

if (!global.HTMLElement) {
  global.HTMLElement = class HTMLElement {};
}

const { AnimePreview } = await import('../src/components/AnimePreview.js');

describe('components/AnimePreview.js', () => {
  /** @type {any} */
  let originalDocument;
  /** @type {any} */
  let originalWindow;
  /** @type {any} */
  let originalLocalStorage;
  /** @type {any} */
  let originalRAF;
  /** @type {any} */
  let originalHTMLElement;

  beforeEach(() => {
    originalDocument = global.document;
    originalWindow = global.window;
    originalLocalStorage = global.localStorage;
    originalRAF = global.requestAnimationFrame;
    originalHTMLElement = global.HTMLElement;

    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    };

    global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    global.HTMLElement = class HTMLElement {};

    global.window = {
      innerWidth: 1920,
      innerHeight: 1080,
      requestAnimationFrame: global.requestAnimationFrame,
    };
  });

  afterEach(() => {
    global.document = originalDocument;
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
    global.requestAnimationFrame = originalRAF;
    global.HTMLElement = originalHTMLElement;
  });

  it('computeStats correctly aggregates counts and ratings', () => {
    const preview = new AnimePreview();
    preview.animeData = [
      {
        id: '1',
        title: 'Anime 1',
        cover: '',
        season: 'S1',
        episodes: 12,
        currentEpisode: 6,
        statusType: 'watching',
        statusColor: '#ff0000',
        updateTime: '10:00',
        rating: '9.5',
        ratingValue: 9.5,
        url: 'https://example.com/1',
        isFinished: false,
        updateDayKey: 'mon',
        nextEpisodeTime: null,
        rawPubTime: new Date(),
      },
      {
        id: '2',
        title: 'Anime 2',
        cover: '',
        season: 'S1',
        episodes: 24,
        currentEpisode: 24,
        statusType: 'finished',
        statusColor: '#00ff00',
        updateTime: '12:00',
        rating: '8.5',
        ratingValue: 8.5,
        url: 'https://example.com/2',
        isFinished: true,
        updateDayKey: 'wed',
        nextEpisodeTime: null,
        rawPubTime: null,
      },
      {
        id: '3',
        title: 'Anime 3',
        cover: '',
        season: 'S1',
        episodes: 12,
        currentEpisode: 0,
        statusType: 'not-started',
        statusColor: '#888888',
        updateTime: '18:00',
        rating: '暂无评分',
        ratingValue: null,
        url: 'https://example.com/3',
        isFinished: false,
        updateDayKey: 'fri',
        nextEpisodeTime: null,
        rawPubTime: null,
      },
    ];

    const stats = preview.computeStats();
    assert.strictEqual(stats.status.watching, 1);
    assert.strictEqual(stats.status.finished, 1);
    assert.strictEqual(stats.status.notStarted, 1);
    assert.strictEqual(stats.weekMap.mon, 1);
    assert.strictEqual(stats.weekMap.wed, 1);
    assert.strictEqual(stats.weekMap.fri, 1);
    assert.strictEqual(stats.avgRating, '9.0');
    assert.strictEqual(stats.ratingCount, 2);
  });

  it('showPreview creates modal with anime-stats in anime-preview-body and actions in footer', () => {
    let appendedChild = null;

    const mockModal = {
      id: '',
      className: '',
      innerHTML: '',
      setAttribute: () => {},
      classList: {
        add: () => {},
        remove: () => {},
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    global.document = {
      createElement: (tag) => {
        if (tag === 'div') return mockModal;
        return {};
      },
      getElementById: () => null,
      body: {
        appendChild: (child) => {
          appendedChild = child;
        },
      },
      activeElement: null,
    };

    const preview = new AnimePreview();
    preview.showPreview([
      {
        id: '1',
        title: 'Test Anime',
        cover: '',
        season: 'S1',
        episodes: 12,
        currentEpisode: 6,
        statusType: 'watching',
        statusColor: '#ff0000',
        updateTime: '10:00',
        rating: '9.0',
        ratingValue: 9.0,
        url: 'https://example.com/1',
        isFinished: false,
        updateDayKey: 'mon',
        nextEpisodeTime: null,
        rawPubTime: null,
      },
    ]);

    assert.ok(appendedChild, 'modal should be appended to document.body');
    const html = mockModal.innerHTML;

    // Body should contain anime-stats and animeList
    assert.ok(
      html.includes('<div class="anime-preview-body">'),
      'HTML must contain anime-preview-body'
    );
    const bodyStart = html.indexOf('<div class="anime-preview-body">');
    const bodyEnd = html.indexOf('<div class="anime-preview-footer">');
    assert.ok(
      bodyStart !== -1 && bodyEnd !== -1 && bodyStart < bodyEnd,
      'body should precede footer'
    );

    const bodySegment = html.slice(bodyStart, bodyEnd);
    assert.ok(
      bodySegment.includes('class="anime-stats"'),
      'anime-stats must be inside anime-preview-body'
    );
    assert.ok(
      bodySegment.includes('id="animeList"'),
      'animeList must be inside anime-preview-body'
    );

    // Footer should contain actions and reminder hint, and NOT anime-stats
    const footerSegment = html.slice(bodyEnd);
    assert.ok(
      footerSegment.includes('class="preview-actions"'),
      'preview-actions must be in footer'
    );
    assert.ok(footerSegment.includes('class="reminder-hint"'), 'reminder-hint must be in footer');
    assert.ok(
      !footerSegment.includes('class="anime-stats"'),
      'footer must NOT contain anime-stats'
    );
    assert.ok(
      footerSegment.includes('data-action="confirm-generate"'),
      'footer must contain confirm button'
    );
  });
});
