/**
 * P31 useThickClick — React hook for the Thick Click totem
 *
 * Provides WebSerial connection to the ESP32-S3 Node One hardware.
 * Canonical: 115200 baud, USB CDC, COBS/CRC8-MAXIM protocol.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  SerialBridge,
  CMD_HEARTBEAT,
  CMD_CLICK_EVENT,
  CMD_SPOON_REPORT,
} from '../lib/serial';

interface ThickClickState {
  isConnected: boolean;
  lastClick: number | null;
  clickCount: number;
}

interface UseThickClickReturn extends ThickClickState {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendHeartbeat: () => Promise<void>;
}

export function useThickClick(
  onClickEvent?: () => void,
  onSpoonReport?: (spoons: number) => void
): UseThickClickReturn {
  const bridgeRef = useRef<SerialBridge | null>(null);
  const [state, setState] = useState<ThickClickState>({
    isConnected: false,
    lastClick: null,
    clickCount: 0,
  });

  const handleFrame = useCallback(
    (cmd: number, payload: Uint8Array) => {
      if (cmd === CMD_CLICK_EVENT) {
        setState((s) => ({
          ...s,
          lastClick: Date.now(),
          clickCount: s.clickCount + 1,
        }));
        onClickEvent?.();
      }

      if (cmd === CMD_SPOON_REPORT && payload.length >= 2) {
        const spoonValue = ((payload[0] << 8) | payload[1]) / 10;
        onSpoonReport?.(spoonValue);
      }
    },
    [onClickEvent, onSpoonReport]
  );

  const connect = useCallback(async () => {
    const bridge = new SerialBridge();
    const success = await bridge.connect(handleFrame);
    if (success) {
      bridgeRef.current = bridge;
      setState((s) => ({ ...s, isConnected: true }));
      console.log('Thick Click connected to Node One');
    }
  }, [handleFrame]);

  const disconnect = useCallback(async () => {
    if (bridgeRef.current) {
      await bridgeRef.current.disconnect();
      bridgeRef.current = null;
      setState((s) => ({ ...s, isConnected: false }));
    }
  }, []);

  const sendHeartbeat = useCallback(async () => {
    if (bridgeRef.current) {
      await bridgeRef.current.sendHeartbeat();
    }
  }, []);

  useEffect(() => {
    return () => {
      bridgeRef.current?.disconnect();
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    sendHeartbeat,
  };
}
