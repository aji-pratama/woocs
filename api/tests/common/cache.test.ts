import { describe, test, expect, beforeEach } from 'vitest';
import { MemoryCache } from '../../src/common/cache.js';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache(10);
  });

  test('sets and gets cached values within TTL', () => {
    cache.set('key1', { foo: 'bar' }, 60);
    expect(cache.get('key1')).toEqual({ foo: 'bar' });
  });

  test('returns null for non-existent key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  test('returns null and purges expired keys', async () => {
    cache.set('quickKey', 'value', 0.05); // 50ms TTL
    expect(cache.get('quickKey')).toBe('value');

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(cache.get('quickKey')).toBeNull();
  });

  test('deletes individual keys', () => {
    cache.set('delKey', 123, 60);
    expect(cache.delete('delKey')).toBe(true);
    expect(cache.get('delKey')).toBeNull();
  });

  test('deletes keys matching a prefix', () => {
    cache.set('store:1', 'Store 1', 60);
    cache.set('store:2', 'Store 2', 60);
    cache.set('user:1', 'User 1', 60);

    cache.deletePrefix('store:');
    expect(cache.get('store:1')).toBeNull();
    expect(cache.get('store:2')).toBeNull();
    expect(cache.get('user:1')).toBe('User 1');
  });

  test('evicts oldest entries when reaching max capacity', () => {
    const smallCache = new MemoryCache(3);
    smallCache.set('k1', 1, 60);
    smallCache.set('k2', 2, 60);
    smallCache.set('k3', 3, 60);
    smallCache.set('k4', 4, 60); // Exceeds capacity 3 -> evicts k1

    expect(smallCache.get('k1')).toBeNull();
    expect(smallCache.get('k2')).toBe(2);
    expect(smallCache.get('k3')).toBe(3);
    expect(smallCache.get('k4')).toBe(4);
  });

  test('clears entire cache', () => {
    cache.set('a', 1, 60);
    cache.set('b', 2, 60);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeNull();
  });
});
