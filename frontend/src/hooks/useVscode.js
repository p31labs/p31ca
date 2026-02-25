import { useEffect, useRef } from 'react';

// Safely acquire the VS Code API singleton (only available inside a webview)
const vscodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

export function useVscode(onMessageReceived) {
  // Post a message TO the VS Code Extension
  const postMessage = (message) => {
    if (vscodeApi) {
      vscodeApi.postMessage(message);
    } else {
      console.warn('VS Code API not available. Are you running in a browser?');
    }
  };

  // Listen for messages FROM the VS Code Extension
  useEffect(() => {
    if (!onMessageReceived) return;

    const handler = (event) => {
      onMessageReceived(event.data);
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMessageReceived]);

  return { postMessage };
}
