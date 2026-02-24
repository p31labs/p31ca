/**
 * P31 Protocol Constants
 *
 * Shared between firmware (C++) and frontend (TypeScript).
 * These values are CANONICAL and must not be changed.
 *
 * CRC8-MAXIM verification:
 *   Input:  [0x31, 0x01, 0x00]
 *   Init:   0xFF
 *   Poly:   0x31
 *   Result: 0x24
 */

#ifndef P31_PROTOCOL_H
#define P31_PROTOCOL_H

#include <stdint.h>
#include <stddef.h>

// ═══════════════════════════════════════════════════════════════════
// Protocol Constants
// ═══════════════════════════════════════════════════════════════════

#define P31_MAGIC_BYTE      0x31    // Phosphorus-31
#define P31_CRC8_POLY       0x31    // CRC8-MAXIM polynomial
#define P31_CRC8_INIT       0xFF    // CRC8 initial value
#define P31_FRAME_DELIMITER 0x00    // COBS frame delimiter
#define P31_BAUD_RATE       115200  // Serial baud rate
#define P31_MAX_FRAME_SIZE  256     // Maximum frame size (bytes)
#define P31_MAX_PAYLOAD     240     // Maximum payload (frame - overhead)

// ═══════════════════════════════════════════════════════════════════
// Command Bytes
// ═══════════════════════════════════════════════════════════════════

#define CMD_HEARTBEAT       0x01
#define CMD_HAPTIC          0x02
#define CMD_LED             0x03
#define CMD_SPOON_REPORT    0x10
#define CMD_CLICK_EVENT     0x20
#define CMD_BREATHING_SYNC  0x30
#define CMD_ACK             0xA0
#define CMD_NACK            0xA1

// ═══════════════════════════════════════════════════════════════════
// Haptic Patterns (DRV2605L effect IDs)
// ═══════════════════════════════════════════════════════════════════

#define HAPTIC_CLICK        1   // Strong click - 100%
#define HAPTIC_DOUBLE_CLICK 6   // Double click - 100%
#define HAPTIC_SOFT_BUMP    7   // Soft bump - 100%
#define HAPTIC_ALERT        15  // Alert 750ms

// ═══════════════════════════════════════════════════════════════════
// Spoon Constants
// ═══════════════════════════════════════════════════════════════════

#define SPOON_BASELINE      120   // 12.0 * 10 (fixed point, 1 decimal)
#define SPOON_CLICK_RESTORE 5     // 0.5 * 10

// ═══════════════════════════════════════════════════════════════════
// CRC8-MAXIM Implementation
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute CRC8-MAXIM checksum.
 * Polynomial: 0x31, Init: 0xFF, No reflect, No XOR out.
 */
static inline uint8_t p31_crc8(const uint8_t *data, size_t len) {
    uint8_t crc = P31_CRC8_INIT;

    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (uint8_t bit = 0; bit < 8; bit++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ P31_CRC8_POLY;
            } else {
                crc = crc << 1;
            }
        }
    }

    return crc;
}

// ═══════════════════════════════════════════════════════════════════
// COBS Encoding / Decoding
// ═══════════════════════════════════════════════════════════════════

/**
 * COBS encode data into output buffer.
 * Returns number of bytes written to output.
 * Output must be at least (len + len/254 + 1) bytes.
 */
static inline size_t p31_cobs_encode(const uint8_t *data, size_t len, uint8_t *output) {
    size_t read_idx = 0;
    size_t write_idx = 1;
    size_t code_idx = 0;
    uint8_t code = 1;

    while (read_idx < len) {
        if (data[read_idx] == 0) {
            output[code_idx] = code;
            code = 1;
            code_idx = write_idx++;
        } else {
            output[write_idx++] = data[read_idx];
            code++;
            if (code == 0xFF) {
                output[code_idx] = code;
                code = 1;
                code_idx = write_idx++;
            }
        }
        read_idx++;
    }

    output[code_idx] = code;
    return write_idx;
}

/**
 * COBS decode data from input buffer.
 * Returns number of bytes written to output.
 */
static inline size_t p31_cobs_decode(const uint8_t *data, size_t len, uint8_t *output) {
    size_t read_idx = 0;
    size_t write_idx = 0;

    while (read_idx < len) {
        uint8_t code = data[read_idx];
        if (code == 0) break;

        read_idx++;
        for (uint8_t i = 1; i < code && read_idx < len; i++) {
            output[write_idx++] = data[read_idx++];
        }

        if (code < 0xFF && read_idx < len) {
            output[write_idx++] = 0;
        }
    }

    return write_idx;
}

#endif // P31_PROTOCOL_H
