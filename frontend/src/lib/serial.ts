/**
 * P31 Serial Bridge — WebSerial + CRC8-MAXIM + COBS
 *
 * Canonical protocol:
 *   Magic byte:      0x31 (Phosphorus-31)
 *   CRC8 polynomial: 0x31 (CRC8-MAXIM)
 *   CRC8 init:       0xFF
 *   Frame encoding:  COBS (Consistent Overhead Byte Stuffing)
 *   Delimiter:       0x00
 *   Baud:            115200
 *   USB interface:   Native USB CDC (GPIO19/20)
 *
 * Frame format: [COBS_ENCODED(magic | cmd | payload | crc8)] [0x00]
 */

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

export const MAGIC_BYTE = 0x31;
export const CRC8_POLY = 0x31;
export const CRC8_INIT = 0xff;
export const BAUD_RATE = 115200;
export const FRAME_DELIMITER = 0x00;

// Command bytes
export const CMD_HEARTBEAT = 0x01;
export const CMD_HAPTIC = 0x02;
export const CMD_LED = 0x03;
export const CMD_SPOON_REPORT = 0x10;
export const CMD_CLICK_EVENT = 0x20;

// ═══════════════════════════════════════════════════════════════════
// CRC8-MAXIM
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute CRC8-MAXIM checksum.
 * Polynomial: 0x31, Init: 0xFF, No reflect, No XOR out.
 *
 * Verification: crc8([0x31, 0x01, 0x00]) with init 0xFF = 0x24
 */
export function crc8(data: Uint8Array): number {
  let crc = CRC8_INIT;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ CRC8_POLY) & 0xff;
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
 * COBS encode: eliminates 0x00 bytes from the payload so 0x00 can
 * serve as an unambiguous frame delimiter.
 */
export function cobsEncode(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  let codeIndex = 0;
  let code = 1;

  output.push(0); // placeholder for first code byte

  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0) {
      output[codeIndex] = code;
      code = 1;
      codeIndex = output.length;
      output.push(0); // placeholder
    } else {
      output.push(data[i]);
      code++;
      if (code === 0xff) {
        output[codeIndex] = code;
        code = 1;
        codeIndex = output.length;
        output.push(0);
      }
    }
  }

  output[codeIndex] = code;
  return new Uint8Array(output);
}

/**
 * COBS decode: reverse the encoding to recover original data.
 */
export function cobsDecode(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  let i = 0;

  while (i < data.length) {
    const code = data[i];
    if (code === 0) break; // end of frame

    i++;
    for (let j = 1; j < code && i < data.length; j++) {
      output.push(data[i]);
      i++;
    }

    if (code < 0xff && i < data.length) {
      output.push(0);
    }
  }

  return new Uint8Array(output);
}

// ═══════════════════════════════════════════════════════════════════
// Frame Builder / Parser
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a P31 frame: MAGIC | CMD | PAYLOAD | CRC8, then COBS encode + delimiter.
 */
export function buildFrame(cmd: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  // Raw frame: [magic, cmd, ...payload]
  const raw = new Uint8Array(2 + payload.length);
  raw[0] = MAGIC_BYTE;
  raw[1] = cmd;
  raw.set(payload, 2);

  // Compute CRC8 over raw frame
  const checksum = crc8(raw);

  // Frame with CRC appended
  const withCrc = new Uint8Array(raw.length + 1);
  withCrc.set(raw);
  withCrc[raw.length] = checksum;

  // COBS encode
  const encoded = cobsEncode(withCrc);

  // Append delimiter
  const frame = new Uint8Array(encoded.length + 1);
  frame.set(encoded);
  frame[encoded.length] = FRAME_DELIMITER;

  return frame;
}

/**
 * Parse a received COBS frame. Returns { cmd, payload } or null on error.
 */
export function parseFrame(cobsFrame: Uint8Array): { cmd: number; payload: Uint8Array } | null {
  // Strip trailing delimiter if present
  let data = cobsFrame;
  if (data.length > 0 && data[data.length - 1] === FRAME_DELIMITER) {
    data = data.slice(0, -1);
  }

  const decoded = cobsDecode(data);
  if (decoded.length < 3) return null; // minimum: magic + cmd + crc

  // Verify magic byte
  if (decoded[0] !== MAGIC_BYTE) return null;

  // Verify CRC8
  const rawWithoutCrc = decoded.slice(0, -1);
  const receivedCrc = decoded[decoded.length - 1];
  const computedCrc = crc8(rawWithoutCrc);
  if (receivedCrc !== computedCrc) return null;

  return {
    cmd: decoded[1],
    payload: decoded.slice(2, -1),
  };
}

// ═══════════════════════════════════════════════════════════════════
// WebSerial Connection Manager
// ═══════════════════════════════════════════════════════════════════

export type FrameHandler = (cmd: number, payload: Uint8Array) => void;

export class SerialBridge {
  port: SerialPort | null = null;
  reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buffer: number[] = [];
  private onFrame: FrameHandler | null = null;
  private running = false;

  async connect(onFrame?: FrameHandler): Promise<boolean> {
    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: BAUD_RATE });

      if (onFrame) this.onFrame = onFrame;

      this.writer = this.port.writable!.getWriter();
      this.running = true;
      this.readLoop();

      return true;
    } catch (e) {
      console.error('Serial connect failed:', e);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.running = false;
    if (this.reader) {
      await this.reader.cancel();
      this.reader.releaseLock();
    }
    if (this.writer) {
      this.writer.releaseLock();
    }
    if (this.port) {
      await this.port.close();
    }
  }

  async send(cmd: number, payload: Uint8Array = new Uint8Array(0)): Promise<void> {
    if (!this.writer) throw new Error('Not connected');
    const frame = buildFrame(cmd, payload);
    await this.writer.write(frame);
  }

  async sendHeartbeat(): Promise<void> {
    await this.send(CMD_HEARTBEAT);
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable) return;

    this.reader = this.port.readable.getReader();

    try {
      while (this.running) {
        const { value, done } = await this.reader.read();
        if (done) break;

        for (const byte of value) {
          if (byte === FRAME_DELIMITER) {
            if (this.buffer.length > 0) {
              const frame = parseFrame(new Uint8Array(this.buffer));
              if (frame && this.onFrame) {
                this.onFrame(frame.cmd, frame.payload);
              }
              this.buffer = [];
            }
          } else {
            this.buffer.push(byte);
          }
        }
      }
    } catch (e) {
      if (this.running) console.error('Serial read error:', e);
    } finally {
      this.reader.releaseLock();
    }
  }
}
