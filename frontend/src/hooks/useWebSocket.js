/**
 * useWebSocket — Manages backend WS connection with robust reconnection,
 * message queuing, heartbeat, and connection state tracking
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { WS_URL, SEED_NODES, SPOON_BASELINE } from '../constants.js';

// Reconnection configuration
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const MAX_RECONNECT_ATTEMPTS = 20;

// Heartbeat configuration
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 10000;

// Message queue configuration
const MAX_QUEUE_SIZE = 100;
const MESSAGE_TTL = 60000; // 1 minute

export default function useWebSocket() {
  const nodesRef = useRef([...SEED_NODES]);
  const voltageMapRef = useRef({}); // nodeId -> { composite, urgency, emotional, cognitive }
  const activityRef = useRef([]);   // [{ id, axis, content, voltage, timestamp }]

  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('disconnected'); // disconnected, connecting, connected, reconnecting
  const [spoonCount, setSpoonCount] = useState(SPOON_BASELINE);
  const [nodeCount, setNodeCount] = useState(SEED_NODES.length);
  const [activity, setActivity] = useState([]);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [queuedMessageCount, setQueuedMessageCount] = useState(0);

  // Refs for connection management
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const messageQueueRef = useRef([]);
  const heartbeatIntervalRef = useRef(null);
  const heartbeatTimeoutRef = useRef(null);

  // Exposed so App can call it after adding nodes
  const onNodeAdded = useRef(null);

  // Send message with queuing support
  const sendMessage = useCallback((message) => {
    const ws = wsRef.current;

    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        return { sent: true, queued: false };
      } catch (e) {
        console.error('WS send error:', e);
      }
    }

    // Queue message for later delivery
    if (messageQueueRef.current.length < MAX_QUEUE_SIZE) {
      messageQueueRef.current.push({
        message,
        timestamp: Date.now(),
        retries: 0,
      });
      setQueuedMessageCount(messageQueueRef.current.length);
      return { sent: false, queued: true };
    }

    return { sent: false, queued: false, error: 'Queue full' };
  }, []);

  // Flush queued messages on reconnect
  const flushMessageQueue = useCallback((ws) => {
    const now = Date.now();
    const validMessages = messageQueueRef.current.filter(
      item => now - item.timestamp < MESSAGE_TTL
    );

    let sent = 0;
    for (const item of validMessages) {
      try {
        ws.send(JSON.stringify(item.message));
        sent++;
      } catch (e) {
        console.error('Failed to flush queued message:', e);
        break;
      }
    }

    messageQueueRef.current = [];
    setQueuedMessageCount(0);

    if (sent > 0) {
      console.log(`[WS] Flushed ${sent} queued messages`);
    }
  }, []);

  // Start heartbeat mechanism
  const startHeartbeat = useCallback((ws) => {
    // Clear any existing heartbeat
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));

        // Set timeout for heartbeat response
        heartbeatTimeoutRef.current = setTimeout(() => {
          console.warn('[WS] Heartbeat timeout - closing stale connection');
          ws.close();
        }, HEARTBEAT_TIMEOUT);
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  // Stop heartbeat mechanism
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  // Calculate reconnect delay with exponential backoff and jitter
  const getReconnectDelay = useCallback((attempt) => {
    const exponentialDelay = BASE_RECONNECT_DELAY * Math.pow(2, attempt);
    const jitter = Math.random() * 1000; // Add up to 1s jitter
    return Math.min(exponentialDelay + jitter, MAX_RECONNECT_DELAY);
  }, []);

  useEffect(() => {
    let reconnectTimer;
    let intentionalClose = false;

    function connect() {
      // Check max attempts
      if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
        console.error('[WS] Max reconnection attempts reached');
        setConnectionState('disconnected');
        return;
      }

      try {
        setConnectionState(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[WS] Connected to buffer agent');
          setConnected(true);
          setConnectionState('connected');
          reconnectAttemptRef.current = 0;
          setReconnectAttempt(0);

          // Start heartbeat
          startHeartbeat(ws);

          // Flush any queued messages
          flushMessageQueue(ws);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            // Handle heartbeat acknowledgment
            if (msg.type === 'heartbeat_ack') {
              // Clear heartbeat timeout - connection is alive
              if (heartbeatTimeoutRef.current) {
                clearTimeout(heartbeatTimeoutRef.current);
                heartbeatTimeoutRef.current = null;
              }
              return;
            }

            // Handle error messages from server
            if (msg.type === 'error') {
              console.error('[WS] Server error:', msg.message);
              return;
            }

            if (msg.type === 'connected' && msg.spoons) {
              setSpoonCount(msg.spoons.current);
            }

            if (msg.type === 'node_ingested') {
              const node = {
                id: msg.node_id,
                content: msg.content || '',
                axis: msg.axis,
              };
              nodesRef.current.push(node);
              setNodeCount(nodesRef.current.length);

              // Store voltage data
              if (msg.voltage) {
                voltageMapRef.current[msg.node_id] = msg.voltage;
              }

              // Activity log (keep last 50)
              const entry = {
                id: msg.node_id,
                axis: msg.axis,
                content: msg.content || msg.node_id,
                voltage: msg.voltage?.composite || 0,
                timestamp: Date.now(),
              };
              activityRef.current = [entry, ...activityRef.current].slice(0, 50);
              setActivity([...activityRef.current]);

              // Trigger mesh update in App
              onNodeAdded.current?.();
            }

            if (msg.type === 'spoon_update' && msg.spoons) {
              setSpoonCount(msg.spoons.current);
            }
          } catch (e) {
            console.error('[WS] Message parse error:', e);
          }
        };

        ws.onclose = (event) => {
          setConnected(false);
          stopHeartbeat();
          wsRef.current = null;

          if (intentionalClose) {
            setConnectionState('disconnected');
            return;
          }

          // Schedule reconnection with exponential backoff
          reconnectAttemptRef.current++;
          setReconnectAttempt(reconnectAttemptRef.current);
          setConnectionState('reconnecting');

          const delay = getReconnectDelay(reconnectAttemptRef.current);
          console.log(`[WS] Connection closed. Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttemptRef.current})`);

          reconnectTimer = setTimeout(connect, delay);
        };

        ws.onerror = (error) => {
          console.error('[WS] Connection error');
          // onclose will handle reconnection
        };
      } catch (e) {
        console.error('[WS] Failed to create WebSocket:', e);
        reconnectAttemptRef.current++;
        setReconnectAttempt(reconnectAttemptRef.current);

        const delay = getReconnectDelay(reconnectAttemptRef.current);
        reconnectTimer = setTimeout(connect, delay);
      }
    }

    connect();

    return () => {
      intentionalClose = true;
      clearTimeout(reconnectTimer);
      stopHeartbeat();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [startHeartbeat, stopHeartbeat, flushMessageQueue, getReconnectDelay]);

  // Get the raw WebSocket for direct access (legacy support)
  const getWebSocket = useCallback(() => wsRef.current, []);

  return {
    connected,
    connectionState,
    spoonCount,
    nodeCount,
    activity,
    nodesRef,
    voltageMapRef,
    onNodeAdded,
    setNodeCount,
    // New exports
    sendMessage,
    reconnectAttempt,
    queuedMessageCount,
    getWebSocket,
  };
}
