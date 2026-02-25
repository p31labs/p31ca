/**
 * P31 Protocol Constants
 *
 * Shared protocol definitions between firmware (C++) and frontend (JavaScript).
 * CANONICAL SOURCE: firmware/include/protocol.h
 *
 * These values MUST match the firmware definitions exactly.
 * CRC8-MAXIM verification test vector:
 *   Input:  [0x31, 0x01, 0x00]
 *   Init:   0xFF
 *   Poly:   0x31
 *   Result: 0x24
 */

// ═══════════════════════════════════════════════════════════════════
// Protocol Version
// ═══════════════════════════════════════════════════════════════════

export const PROTOCOL_VERSION = { major: 0, minor: 2, patch: 0 };

// ═══════════════════════════════════════════════════════════════════
// Framing Constants
// ═══════════════════════════════════════════════════════════════════

export const P31_MAGIC_BYTE = 0x31;      // Phosphorus-31
export const P31_CRC8_POLY = 0x31;       // CRC8-MAXIM polynomial
export const P31_CRC8_INIT = 0xff;       // CRC8 initial value
export const P31_FRAME_DELIMITER = 0x00; // COBS frame delimiter
export const P31_BAUD_RATE = 115200;     // Serial baud rate
export const P31_MAX_FRAME_SIZE = 256;   // Maximum frame size (bytes)
export const P31_MAX_PAYLOAD = 240;      // Maximum payload (frame - overhead)

// ═══════════════════════════════════════════════════════════════════
// Command Bytes
// ═══════════════════════════════════════════════════════════════════

export const CMD = {
  HEARTBEAT: 0x01,
  HAPTIC: 0x02,
  LED: 0x03,
  SPOON_REPORT: 0x10,
  CLICK_EVENT: 0x20,
  BREATHING_SYNC: 0x30,
  VERSION_QUERY: 0x40,
  VERSION_REPORT: 0x41,
  STATS_QUERY: 0x42,
  STATS_REPORT: 0x43,
  ACK: 0xa0,
  NACK: 0xa1,
};

// ═══════════════════════════════════════════════════════════════════
// Error Codes (NACK responses)
// ═══════════════════════════════════════════════════════════════════

export const ERR = {
  NONE: 0x00,           // No error
  UNKNOWN_CMD: 0x01,    // Unknown command byte
  INVALID_PARAM: 0x02,  // Invalid parameter value
  CRC_FAIL: 0x03,       // CRC verification failed
  BUFFER_OVERFLOW: 0x04,// RX buffer overflow
  HAPTIC_FAIL: 0x05,    // Haptic driver not ready
  INVALID_LENGTH: 0x06, // Invalid payload length
};

// ═══════════════════════════════════════════════════════════════════
// Haptic Patterns (DRV2605L effect IDs)
// ═══════════════════════════════════════════════════════════════════

export const HAPTIC = {
  CLICK: 1,         // Strong click - 100%
  DOUBLE_CLICK: 6,  // Double click - 100%
  SOFT_BUMP: 7,     // Soft bump - 100%
  ALERT: 15,        // Alert 750ms
  MIN_WAVEFORM: 1,
  MAX_WAVEFORM: 123,
};

// ═══════════════════════════════════════════════════════════════════
// Spoon Constants (MUST match backend buffer_agent.py)
// ═══════════════════════════════════════════════════════════════════

export const SPOON = {
  BASELINE: 12.0,       // Maximum spoons
  CLICK_RESTORE: 0.5,   // Restored per thick click
  // Firmware uses fixed-point (value * 10), e.g., 120 = 12.0
  FIXED_POINT_SCALE: 10,
};

// ═══════════════════════════════════════════════════════════════════
// Breathing Sync Phases
// ═══════════════════════════════════════════════════════════════════

export const BREATH_PHASE = {
  IDLE: 0,
  INHALE: 1,
  HOLD: 2,
  EXHALE: 3,
};

// ═══════════════════════════════════════════════════════════════════
// CRC8-MAXIM Implementation
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute CRC8-MAXIM checksum.
 * Polynomial: 0x31, Init: 0xFF, No reflect, No XOR out.
 *
 * @param {Uint8Array} data - Input bytes
 * @returns {number} CRC8 checksum
 */
export function crc8(data) {
  let crc = P31_CRC8_INIT;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ P31_CRC8_POLY) & 0xff;
      } else {
        crc = (crc << 1) & 0xff;
      }
    }
  }

  return crc;
}

// ═══════════════════════════════════════════════════════════════════
// COBS Encoding / Decoding
// ═══════════════════════════════════════════════════════════════════

/**
 * COBS encode data.
 *
 * @param {Uint8Array} data - Input bytes
 * @returns {Uint8Array} COBS encoded bytes (without delimiter)
 */
export function cobsEncode(data) {
  const output = new Uint8Array(data.length + Math.ceil(data.length / 254) + 1);
  let readIdx = 0;
  let writeIdx = 1;
  let codeIdx = 0;
  let code = 1;

  while (readIdx < data.length) {
    if (data[readIdx] === 0) {
      output[codeIdx] = code;
      code = 1;
      codeIdx = writeIdx++;
    } else {
      output[writeIdx++] = data[readIdx];
      code++;
      if (code === 0xff) {
        output[codeIdx] = code;
        code = 1;
        codeIdx = writeIdx++;
      }
    }
    readIdx++;
  }

  output[codeIdx] = code;
  return output.slice(0, writeIdx);
}

/**
 * COBS decode data.
 *
 * @param {Uint8Array} data - COBS encoded bytes (without delimiter)
 * @returns {Uint8Array} Decoded bytes
 */
export function cobsDecode(data) {
  const output = new Uint8Array(data.length);
  let readIdx = 0;
  let writeIdx = 0;

  while (readIdx < data.length) {
    const code = data[readIdx];
    if (code === 0) break;

    readIdx++;
    for (let i = 1; i < code && readIdx < data.length; i++) {
      output[writeIdx++] = data[readIdx++];
    }

    if (code < 0xff && readIdx < data.length) {
      output[writeIdx++] = 0;
    }
  }

  return output.slice(0, writeIdx);
}

// ═══════════════════════════════════════════════════════════════════
// Frame Building Helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a complete frame: MAGIC | CMD | payload | CRC8, then COBS encode.
 *
 * @param {number} cmd - Command byte
 * @param {Uint8Array} payload - Payload bytes (can be empty)
 * @returns {Uint8Array} Complete COBS-encoded frame with delimiter
 */
export function buildFrame(cmd, payload = new Uint8Array(0)) {
  const rawLen = 2 + payload.length + 1; // magic + cmd + payload + crc
  const raw = new Uint8Array(rawLen);

  raw[0] = P31_MAGIC_BYTE;
  raw[1] = cmd;
  if (payload.length > 0) {
    raw.set(payload, 2);
  }

  // Compute CRC over magic, cmd, and payload
  const crc = crc8(raw.slice(0, rawLen - 1));
  raw[rawLen - 1] = crc;

  // COBS encode and append delimiter
  const encoded = cobsEncode(raw);
  const frame = new Uint8Array(encoded.length + 1);
  frame.set(encoded);
  frame[encoded.length] = P31_FRAME_DELIMITER;

  return frame;
}

/**
 * Parse a received frame (after COBS decode).
 *
 * @param {Uint8Array} decoded - COBS-decoded frame bytes
 * @returns {{ valid: boolean, cmd?: number, payload?: Uint8Array, error?: string }}
 */
export function parseFrame(decoded) {
  if (decoded.length < 3) {
    return { valid: false, error: 'Frame too short' };
  }

  if (decoded[0] !== P31_MAGIC_BYTE) {
    return { valid: false, error: 'Invalid magic byte' };
  }

  const receivedCrc = decoded[decoded.length - 1];
  const computedCrc = crc8(decoded.slice(0, decoded.length - 1));

  if (receivedCrc !== computedCrc) {
    return { valid: false, error: 'CRC mismatch' };
  }

  return {
    valid: true,
    cmd: decoded[1],
    payload: decoded.slice(2, decoded.length - 1),
  };
}
