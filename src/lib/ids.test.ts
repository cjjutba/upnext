import { describe, it, expect } from 'vitest';
import { newId, getDeviceId } from './ids';

describe('ids', () => {
  it('generates time sortable unique ids', () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
    expect(a < b).toBe(true);
    expect(a).toHaveLength(26);
  });

  it('returns a stable device id', () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });
});
