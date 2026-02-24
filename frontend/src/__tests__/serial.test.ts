/**
 * Tests for P31 serial protocol: CRC8-MAXIM, COBS, frame building/parsing.
 */

import { describe, it, expect } from 'vitest';
import {
  crc8,
  cobsEncode,
  cobsDecode,
  buildFrame,
  parseFrame,
  MAGIC_BYTE,
  CRC8_POLY,
  CRC8_INIT,
  CMD_HEARTBEAT,
} from '../lib/serial';

describe('CRC8-MAXIM', () => {
  it('uses correct polynomial and init', () => {
    expect(CRC8_POLY).toBe(0x31);
    expect(CRC8_INIT).toBe(0xff);
  });

  it('computes CRC8 of known sequence [0x31, 0x01, 0x00]', () => {
    const data = new Uint8Array([0x31, 0x01, 0x00]);
    const result = crc8(data);
    expect(result).toBe(0x24);
  });

  it('computes CRC8 of empty array returns init value', () => {
    const result = crc8(new Uint8Array(0));
    expect(result).toBe(CRC8_INIT);
  });

  it('produces values in valid byte range', () => {
    const result = crc8(new Uint8Array([MAGIC_BYTE]));
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xff);
  });
});

describe('COBS', () => {
  it('round-trips data with embedded zeros', () => {
    const original = new Uint8Array([0x31, 0x01, 0x00, 0x42]);
    const encoded = cobsEncode(original);
    for (let i = 0; i < encoded.length; i++) {
      expect(encoded[i]).not.toBe(0);
    }
    const decoded = cobsDecode(encoded);
    expect(decoded).toEqual(original);
  });

  it('round-trips data without zeros', () => {
    const original = new Uint8Array([0x01, 0x02, 0x03]);
    const decoded = cobsDecode(cobsEncode(original));
    expect(decoded).toEqual(original);
  });

  it('round-trips consecutive zeros', () => {
    const original = new Uint8Array([0x00, 0x00, 0x00]);
    const decoded = cobsDecode(cobsEncode(original));
    expect(decoded).toEqual(original);
  });
});

describe('Frame', () => {
  it('builds a heartbeat frame ending with delimiter', () => {
    const frame = buildFrame(CMD_HEARTBEAT);
    expect(frame[frame.length - 1]).toBe(0x00);
    expect(frame.length).toBeGreaterThan(2);
  });

  it('round-trips a heartbeat frame', () => {
    const frame = buildFrame(CMD_HEARTBEAT);
    const parsed = parseFrame(frame);
    expect(parsed).not.toBeNull();
    expect(parsed!.cmd).toBe(CMD_HEARTBEAT);
    expect(parsed!.payload.length).toBe(0);
  });

  it('round-trips a frame with payload', () => {
    const payload = new Uint8Array([0x42, 0x00, 0xff]);
    const frame = buildFrame(0x10, payload);
    const parsed = parseFrame(frame);
    expect(parsed).not.toBeNull();
    expect(parsed!.cmd).toBe(0x10);
    expect(parsed!.payload).toEqual(payload);
  });

  it('rejects corrupted frames', () => {
    const frame = buildFrame(CMD_HEARTBEAT);
    const corrupted = new Uint8Array(frame);
    corrupted[1] ^= 0xff;
    const parsed = parseFrame(corrupted);
    expect(parsed).toBeNull();
  });
});
