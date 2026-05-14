import { describe, it, expect } from 'vitest';
import { sanitizeSegment, escapeCsv, escapeXml } from './exporter';

describe('exporter utils', () => {
  describe('sanitizeSegment', () => {
    it('should replace invalid filename chars with underscore', () => {
      expect(sanitizeSegment('a/b:c?d"e<f>g|h')).toBe('a_b_c_d_e_f_g_h');
    });

    it('should trim whitespace', () => {
      expect(sanitizeSegment('  hello  ')).toBe('hello');
    });

    it('should fallback to export when empty', () => {
      expect(sanitizeSegment('   ')).toBe('export');
    });
  });

  describe('escapeCsv', () => {
    it('should wrap value in quotes', () => {
      expect(escapeCsv('hello')).toBe('"hello"');
    });

    it('should escape internal quotes by doubling', () => {
      expect(escapeCsv('say "hello"')).toBe('"say ""hello"""');
    });
  });

  describe('escapeXml', () => {
    it('should escape XML special chars', () => {
      expect(escapeXml('a < b > c & d " e \' f')).toBe(
        'a &lt; b &gt; c &amp; d &quot; e &apos; f'
      );
    });
  });
});
