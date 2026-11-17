/**
 * Map tab: loading the tests for the area on screen (src/utils/mapArea.ts).
 */
import { MAP_TEST_LIMIT, boundsContain, mapQueryParams, needsMapFetch, parseBounds } from '../src/utils/mapArea';

const pune = { minLat: 18.4, maxLat: 18.7, minLng: 73.7, maxLng: 74.0 };
const puneWithMargin = { minLat: 18.25, maxLat: 18.85, minLng: 73.55, maxLng: 74.15 };
const mumbai = { minLat: 18.9, maxLat: 19.3, minLng: 72.7, maxLng: 73.1 };
const filters = { operator: 'Airtel', technology: 'All', metric: 'Upload' };

describe('boundsContain', () => {
  it('an area inside a larger one', () => {
    expect(boundsContain(puneWithMargin, pune)).toBe(true);
    expect(boundsContain(pune, puneWithMargin)).toBe(false);
    expect(boundsContain(puneWithMargin, mumbai)).toBe(false);
  });
});

describe('parseBounds', () => {
  it('accepts the area the map page sends', () => {
    expect(parseBounds({ ...pune, extra: 1 })).toEqual(pune);
  });
  it.each([null, undefined, {}, { ...pune, minLat: 'x' }, { ...pune, maxLng: NaN }, { ...pune, minLat: 19 }])(
    'rejects a broken area %p',
    bad => expect(parseBounds(bad)).toBeNull()
  );
});

describe('mapQueryParams', () => {
  it('sends the area with the filters', () => {
    expect(mapQueryParams(filters, pune)).toEqual({
      ...filters,
      limit: String(MAP_TEST_LIMIT),
      minLat: '18.40000',
      maxLat: '18.70000',
      minLng: '73.70000',
      maxLng: '74.00000',
    });
  });
  it('without an area yet it asks for the newest tests (as before)', () => {
    expect(mapQueryParams(filters, null)).toEqual({ ...filters, limit: '1000' });
  });
});

describe('needsMapFetch', () => {
  const key = 'Airtel|All|Upload';
  const loaded = { key, bounds: puneWithMargin, complete: true };

  it('loads the first time', () => {
    expect(needsMapFetch(null, key, pune)).toBe(true);
  });
  it('small pans and zooming in inside the loaded area need no new request', () => {
    expect(needsMapFetch(loaded, key, pune)).toBe(false);
  });
  it('moving to another city loads again', () => {
    expect(needsMapFetch(loaded, key, mumbai)).toBe(true);
  });
  it('zooming out past the loaded area loads again', () => {
    expect(needsMapFetch({ key, bounds: pune, complete: true }, key, puneWithMargin)).toBe(true);
  });
  it('changing a filter loads again', () => {
    expect(needsMapFetch(loaded, 'Jio|All|Upload', pune)).toBe(true);
  });
  it('when the last load hit the limit, zooming in loads again to fill in missing tests', () => {
    expect(needsMapFetch({ ...loaded, complete: false }, key, pune)).toBe(true);
  });
});
