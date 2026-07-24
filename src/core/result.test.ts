import { describe, expect, it } from 'vitest';
import { ok, err, isOk, isErr, unwrap, unwrapOr, mapResult, mapError, type Result } from './result.js';

describe('Result helpers', () => {
  describe('ok()', () => {
    it('returns a success result with the provided data', () => {
      const result = ok(42);
      expect(result.success).toBe(true);
      expect(result).toEqual({ success: true, data: 42 });
    });

    it('preserves object and array data', () => {
      const obj = { id: 1, name: 'agent' };
      expect(ok(obj)).toEqual({ success: true, data: obj });
      expect(ok([1, 2, 3])).toEqual({ success: true, data: [1, 2, 3] });
    });

    it('preserves null and undefined data', () => {
      expect(ok(null)).toEqual({ success: true, data: null });
      expect(ok(undefined)).toEqual({ success: true, data: undefined });
    });
  });

  describe('err()', () => {
    it('returns a failure result with the provided error', () => {
      const error = new Error('boom');
      const result = err(error);
      expect(result.success).toBe(false);
      expect(result).toEqual({ success: false, error });
    });

    it('preserves string error values', () => {
      expect(err('something went wrong')).toEqual({
        success: false,
        error: 'something went wrong',
      });
    });

    it('preserves object error payloads', () => {
      const payload = { code: 'E_FAIL', details: { step: 'register' } };
      expect(err(payload)).toEqual({ success: false, error: payload });
    });
  });

  describe('isOk()', () => {
    it('returns true for success results', () => {
      expect(isOk(ok('yes'))).toBe(true);
    });

    it('returns false for failure results', () => {
      expect(isOk(err('no'))).toBe(false);
    });

    it('narrows the type so data is accessible', () => {
      const result: Result<string, Error> = ok('value');
      if (isOk(result)) {
        expect(result.data).toBe('value');
      }
    });
  });

  describe('isErr()', () => {
    it('returns true for failure results', () => {
      expect(isErr(err('nope'))).toBe(true);
    });

    it('returns false for success results', () => {
      expect(isErr(ok('yep'))).toBe(false);
    });

    it('narrows the type so error is accessible', () => {
      const result: Result<string, string> = err('failure');
      if (isErr(result)) {
        expect(result.error).toBe('failure');
      }
    });
  });

  describe('unwrap()', () => {
    it('returns the data from a success result', () => {
      expect(unwrap(ok(99))).toBe(99);
    });

    it('throws the error from a failure result', () => {
      const error = new Error('explode');
      expect(() => unwrap(err(error))).toThrow(error);
    });

    it('throws non-Error error values', () => {
      expect(() => unwrap(err('string error'))).toThrow('string error');
    });
  });

  describe('unwrapOr()', () => {
    it('returns the data from a success result', () => {
      expect(unwrapOr(ok('real'), 'fallback')).toBe('real');
    });

    it('returns the default value from a failure result', () => {
      expect(unwrapOr(err('oops'), 'fallback')).toBe('fallback');
    });
  });

  describe('mapResult()', () => {
    it('transforms the data of a success result', () => {
      const mapped = mapResult(ok(5), n => n * 2);
      expect(mapped).toEqual({ success: true, data: 10 });
    });

    it('passes through failure results unchanged', () => {
      const error = new Error('fail');
      const mapped = mapResult(err(error), (n: number) => n * 2);
      expect(mapped.success).toBe(false);
      expect((mapped as { error: Error }).error).toBe(error);
    });
  });

  describe('mapError()', () => {
    it('transforms the error of a failure result', () => {
      const mapped = mapError(err('code-1'), e => ({ code: e, retryable: true }));
      expect(mapped).toEqual({ success: false, error: { code: 'code-1', retryable: true } });
    });

    it('passes through success results unchanged', () => {
      const mapped = mapError(ok('value'), (e: string) => e.toUpperCase());
      expect(mapped).toEqual({ success: true, data: 'value' });
    });
  });
});