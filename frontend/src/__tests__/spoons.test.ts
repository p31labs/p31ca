/**
 * Tests for spoon scoring logic (frontend mirror of backend).
 */

import { describe, it, expect } from 'vitest';

const SPOON_BASELINE = 12;
const SPOON_COSTS = { GREEN: 0.5, YELLOW: 1.0, RED: 2.0, CRITICAL: 3.0 };
const CONTEXT_SWITCH_COST = 1.5;

function getLevel(spoons: number): string {
  if (spoons < 3) return 'BREATHE';
  if (spoons < 6) return 'FOCUS';
  if (spoons < 9) return 'BUILD';
  return 'COMMAND';
}

function getLayer(spoons: number): number {
  const levels: Record<string, number> = { BREATHE: 0, FOCUS: 1, BUILD: 2, COMMAND: 3 };
  return levels[getLevel(spoons)];
}

describe('Spoon Constants', () => {
  it('baseline is 12', () => expect(SPOON_BASELINE).toBe(12));
  it('context switch costs 1.5', () => expect(CONTEXT_SWITCH_COST).toBe(1.5));
  it('GREEN costs 0.5', () => expect(SPOON_COSTS.GREEN).toBe(0.5));
  it('YELLOW costs 1.0', () => expect(SPOON_COSTS.YELLOW).toBe(1.0));
  it('RED costs 2.0', () => expect(SPOON_COSTS.RED).toBe(2.0));
  it('CRITICAL costs 3.0', () => expect(SPOON_COSTS.CRITICAL).toBe(3.0));
});

describe('Spoon Levels', () => {
  it('BREATHE at < 3', () => {
    expect(getLevel(0)).toBe('BREATHE');
    expect(getLevel(2.9)).toBe('BREATHE');
  });
  it('FOCUS at 3-6', () => {
    expect(getLevel(3)).toBe('FOCUS');
    expect(getLevel(5.9)).toBe('FOCUS');
  });
  it('BUILD at 6-9', () => {
    expect(getLevel(6)).toBe('BUILD');
    expect(getLevel(8.9)).toBe('BUILD');
  });
  it('COMMAND at 9-12', () => {
    expect(getLevel(9)).toBe('COMMAND');
    expect(getLevel(12)).toBe('COMMAND');
  });
});

describe('Progressive Disclosure Layers', () => {
  it('Layer 0 = BREATHE', () => expect(getLayer(1)).toBe(0));
  it('Layer 1 = FOCUS', () => expect(getLayer(4)).toBe(1));
  it('Layer 2 = BUILD', () => expect(getLayer(7)).toBe(2));
  it('Layer 3 = COMMAND', () => expect(getLayer(10)).toBe(3));
});
