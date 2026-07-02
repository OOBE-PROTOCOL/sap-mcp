'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/**
 * Converts a little-endian buffer into a bigint without loading native bindings.
 *
 * @param {Buffer} buf Little-endian bytes.
 * @returns {bigint} BigInt represented by the bytes.
 */
function toBigIntLE(buf) {
  const reversed = Buffer.from(buf);
  reversed.reverse();
  const hex = reversed.toString('hex');
  return hex.length === 0 ? BigInt(0) : BigInt(`0x${hex}`);
}

/**
 * Converts a big-endian buffer into a bigint without loading native bindings.
 *
 * @param {Buffer} buf Big-endian bytes.
 * @returns {bigint} BigInt represented by the bytes.
 */
function toBigIntBE(buf) {
  const hex = Buffer.from(buf).toString('hex');
  return hex.length === 0 ? BigInt(0) : BigInt(`0x${hex}`);
}

/**
 * Converts a bigint into a fixed-width little-endian buffer.
 *
 * @param {bigint} num BigInt value.
 * @param {number} width Output byte width.
 * @returns {Buffer} Fixed-width little-endian bytes.
 */
function toBufferLE(num, width) {
  const buffer = toBufferBE(num, width);
  buffer.reverse();
  return buffer;
}

/**
 * Converts a bigint into a fixed-width big-endian buffer.
 *
 * @param {bigint} num BigInt value.
 * @param {number} width Output byte width.
 * @returns {Buffer} Fixed-width big-endian bytes.
 */
function toBufferBE(num, width) {
  if (!Number.isSafeInteger(width) || width < 0) {
    throw new RangeError('width must be a non-negative safe integer');
  }

  const byteLength = width * 2;
  const hex = num.toString(16);
  return Buffer.from(hex.padStart(byteLength, '0').slice(0, byteLength), 'hex');
}

exports.toBigIntLE = toBigIntLE;
exports.toBigIntBE = toBigIntBE;
exports.toBufferLE = toBufferLE;
exports.toBufferBE = toBufferBE;
