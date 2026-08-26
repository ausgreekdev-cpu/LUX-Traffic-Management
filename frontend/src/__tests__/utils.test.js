import { describe, it, expect } from 'vitest';
import { uid, formatDate, formatTimestamp, todayStr, escHtml, downloadFile } from '../utils.js';

describe('uid', () => {
  it('returns a string', () => {
    expect(typeof uid()).toBe('string');
  });
  it('returns unique values', () => {
    const a = uid();
    const b = uid();
    expect(a).not.toBe(b);
  });
});

describe('formatDate', () => {
  it('returns em dash for empty input', () => {
    expect(formatDate('')).toBe('\u2014');
    expect(formatDate(null)).toBe('\u2014');
    expect(formatDate(undefined)).toBe('\u2014');
  });
  it('formats a valid date string', () => {
    const result = formatDate('2024-06-15');
    expect(result).toContain('2024');
    expect(result).toContain('Jun');
  });
});

describe('formatTimestamp', () => {
  it('returns em dash for empty input', () => {
    expect(formatTimestamp('')).toBe('\u2014');
    expect(formatTimestamp(null)).toBe('\u2014');
  });
  it('formats a valid ISO timestamp', () => {
    const result = formatTimestamp('2024-06-15T10:30:00Z');
    expect(result).toContain('2024');
  });
});

describe('todayStr', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = todayStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('escHtml', () => {
  it('escapes HTML entities', () => {
    expect(escHtml('<script>alert("xss")</script>')).not.toContain('<');
    expect(escHtml('hello & "world"')).toContain('&amp;');
  });
  it('returns non-string values as string', () => {
    expect(escHtml(42)).toBe('42');
    expect(escHtml(null)).toBe('null');
  });
});
