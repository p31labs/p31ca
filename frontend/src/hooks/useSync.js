/**
 * useSync — CRDT synchronization hook with error handling and status tracking
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { CRDT_WS_URL, SPOON_BASELINE } from '../constants.js';

export function useSync() {
    const [spoons, setSpoons] = useState(SPOON_BASELINE);
    const [nodes, setNodes] = useState([]);
    const [crdtStatus, setCrdtStatus] = useState('connecting'); // connecting, connected, disconnected, error
    const [lastSyncTime, setLastSyncTime] = useState(null);

    const docRef = useRef(null);
    const providerRef = useRef(null);

    // Get Y.Doc for external access (e.g., for transactions)
    const getDoc = useCallback(() => docRef.current, []);

    useEffect(() => {
        let mounted = true;

        try {
            const doc = new Y.Doc();
            docRef.current = doc;

            // Connect to the CRDT server
            const wsProvider = new WebsocketProvider(CRDT_WS_URL, 'p31-room', doc, {
                connect: true,
                // Reconnect configuration
                resyncInterval: 30000, // Resync every 30s when reconnected
            });
            providerRef.current = wsProvider;

            const stateMap = doc.getMap('p31_state');
            const nodesArray = doc.getArray('p31_nodes');

            // Connection status tracking
            wsProvider.on('status', ({ status }) => {
                if (!mounted) return;

                if (status === 'connected') {
                    setCrdtStatus('connected');
                    setLastSyncTime(Date.now());
                    console.log('[CRDT] Connected to synchronization matrix');
                } else if (status === 'disconnected') {
                    setCrdtStatus('disconnected');
                    console.log('[CRDT] Disconnected from synchronization matrix');
                } else if (status === 'connecting') {
                    setCrdtStatus('connecting');
                }
            });

            // Connection error handling
            wsProvider.on('connection-error', (event) => {
                if (!mounted) return;
                console.error('[CRDT] Connection error:', event);
                setCrdtStatus('error');
            });

            // Sync event - fires when document is synchronized
            wsProvider.on('sync', (isSynced) => {
                if (!mounted) return;
                if (isSynced) {
                    setLastSyncTime(Date.now());
                    console.log('[CRDT] Document synchronized');
                }
            });

            // Listen for changes from the backend (or other clients)
            stateMap.observe((event) => {
                if (!mounted) return;
                if (stateMap.has('spoons')) {
                    const newSpoons = stateMap.get('spoons');
                    setSpoons(newSpoons);
                }
            });

            nodesArray.observe((event) => {
                if (!mounted) return;
                setNodes(nodesArray.toArray());
            });

            // Initialize with existing data if any
            if (stateMap.has('spoons')) {
                setSpoons(stateMap.get('spoons'));
            }
            setNodes(nodesArray.toArray());

        } catch (error) {
            console.error('[CRDT] Failed to initialize:', error);
            setCrdtStatus('error');
        }

        return () => {
            mounted = false;
            if (providerRef.current) {
                providerRef.current.destroy();
                providerRef.current = null;
            }
            if (docRef.current) {
                docRef.current.destroy();
                docRef.current = null;
            }
        };
    }, []);

    // Manual reconnect function
    const reconnect = useCallback(() => {
        if (providerRef.current) {
            providerRef.current.connect();
            setCrdtStatus('connecting');
        }
    }, []);

    // Check if we're stale (no sync in last 2 minutes)
    const isStale = lastSyncTime && (Date.now() - lastSyncTime > 120000);

    return {
        spoons,
        nodes,
        crdtStatus,
        lastSyncTime,
        isStale,
        reconnect,
        getDoc,
    };
}
