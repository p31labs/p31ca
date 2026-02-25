const MAGIC_BYTE = 0x31; // '1' - P31 identifier

// CRC-8-MAXIM implementation (Polynomial: 0x31, Init: 0x00, RefIn/RefOut: True, XorOut: 0x00)
function calculateCRC8(data: Uint8Array): number {
    let crc = 0x00;
    for (let i = 0; i < data.length; i++) {
        let extract = data[i];
        for (let tempI = 8; tempI; tempI--) {
            let sum = (crc ^ extract) & 0x01;
            crc >>= 1;
            if (sum) {
                crc ^= 0x8C; // Reversed polynomial for MAXIM
            }
            extract >>= 1;
        }
    }
    return crc;
}

// Consistent Overhead Byte Stuffing (COBS) Encoding
// Removes all 0x00 bytes from the payload for reliable framing
export function cobsEncode(buffer: Uint8Array): Uint8Array {
    const encoded = new Uint8Array(buffer.length + 2); // Max possible overhead
    let readIndex = 0;
    let writeIndex = 1;
    let codeIndex = 0;
    let code = 1;

    while (readIndex < buffer.length) {
        if (buffer[readIndex] === 0x00) {
            encoded[codeIndex] = code;
            code = 1;
            codeIndex = writeIndex++;
            readIndex++;
        } else {
            encoded[writeIndex++] = buffer[readIndex++];
            code++;
            if (code === 0xFF) {
                encoded[codeIndex] = code;
                code = 1;
                codeIndex = writeIndex++;
            }
        }
    }
    encoded[codeIndex] = code;
    return encoded.slice(0, writeIndex);
}

// Build a complete P31 protocol frame
// Format: [Magic Byte] [Command ID] [Payload Bytes...] [CRC8]
// The entire frame is then COBS encoded and terminated with 0x00
export function buildFrame(commandId: number, payload: Uint8Array): Uint8Array {
    const frameData = new Uint8Array(2 + payload.length);
    frameData[0] = MAGIC_BYTE;
    frameData[1] = commandId;
    frameData.set(payload, 2);

    const crc = calculateCRC8(frameData);
    
    const unencodedFrame = new Uint8Array(frameData.length + 1);
    unencodedFrame.set(frameData);
    unencodedFrame[unencodedFrame.length - 1] = crc;

    const encoded = cobsEncode(unencodedFrame);
    
    const finalFrame = new Uint8Array(encoded.length + 1);
    finalFrame.set(encoded);
    finalFrame[finalFrame.length - 1] = 0x00; // Frame Delimiter

    return finalFrame;
}

// Decode COBS‑encoded frame (without trailing delimiter) back to raw data
export function cobsDecode(encoded: Uint8Array): Uint8Array {
    const output: number[] = [];
    let i = 0;

    while (i < encoded.length) {
        const code = encoded[i++];
        if (code === 0) break; // should not happen inside a frame

        for (let j = 1; j < code; j++) {
            if (i >= encoded.length) break;
            output.push(encoded[i++]);
        }

        if (code < 0xFF && i < encoded.length) {
            output.push(0);
        }
    }

    return new Uint8Array(output);
}

// Parse a raw (COBS-decoded) frame, verify CRC, and return command/payload
export function parseFrame(raw: Uint8Array): { cmd: number; payload: Uint8Array } | null {
    // minimum size: magic + cmd + crc = 3
    if (raw.length < 3) return null;
    if (raw[0] !== MAGIC_BYTE) return null;
    const cmd = raw[1];
    const payload = raw.subarray(2, raw.length - 1);
    const crc = raw[raw.length - 1];
    const computed = calculateCRC8(raw.subarray(0, raw.length - 1));
    if (crc !== computed) return null;
    return { cmd, payload };
}