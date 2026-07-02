/// <reference types="node" />

/**
 * Converts a little-endian buffer into a bigint.
 *
 * @param buf Little-endian bytes.
 * @returns BigInt represented by the bytes.
 */
export declare function toBigIntLE(buf: Buffer): bigint;

/**
 * Converts a big-endian buffer into a bigint.
 *
 * @param buf Big-endian bytes.
 * @returns BigInt represented by the bytes.
 */
export declare function toBigIntBE(buf: Buffer): bigint;

/**
 * Converts a bigint into a fixed-width little-endian buffer.
 *
 * @param num BigInt value.
 * @param width Output byte width.
 * @returns Fixed-width little-endian bytes.
 */
export declare function toBufferLE(num: bigint, width: number): Buffer;

/**
 * Converts a bigint into a fixed-width big-endian buffer.
 *
 * @param num BigInt value.
 * @param width Output byte width.
 * @returns Fixed-width big-endian bytes.
 */
export declare function toBufferBE(num: bigint, width: number): Buffer;
