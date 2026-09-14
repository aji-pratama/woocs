import { describe, it, expect } from 'vitest';
import { to1024Vector } from '../../src/services/ai';

describe('AI Service & Vector Adapter', () => {
  it('should return a 1024-dimension vector unchanged if already 1024', () => {
    const vec = new Array(1024).fill(0.5);
    const result = to1024Vector(vec);
    expect(result.length).toBe(1024);
    expect(result).toBe(vec);
  });

  it('should truncate and L2 normalize a 1536-dimension vector down to 1024', () => {
    // 1536 dimensions as returned by OpenRouter openai/text-embedding-3-small
    const vec = new Array(1536).fill(1.0);
    const result = to1024Vector(vec);

    expect(result.length).toBe(1024);

    // L2 norm must be approximately 1.0
    const sumSquares = result.reduce((sum, val) => sum + val * val, 0);
    expect(Math.sqrt(sumSquares)).toBeCloseTo(1.0, 5);

    // Each value should be 1 / sqrt(1024) = 1 / 32 = 0.03125
    expect(result[0]).toBeCloseTo(0.03125, 5);
  });

  it('should handle empty or null vectors gracefully', () => {
    expect(to1024Vector([] as any)).toEqual([]);
    expect(to1024Vector(null as any)).toBeNull();
    expect(to1024Vector(undefined as any)).toBeUndefined();
  });

  it('should handle zero vectors without dividing by zero (NaN)', () => {
    const vec = new Array(1536).fill(0);
    const result = to1024Vector(vec);
    expect(result.length).toBe(1024);
    expect(result[0]).toBe(0);
    expect(isNaN(result[0])).toBe(false);
  });
});
