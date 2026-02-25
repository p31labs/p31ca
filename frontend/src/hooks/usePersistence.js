import { useState, useEffect } from 'react';
import { useSync } from './useSync';

export function usePersistence() {
    const { nodes } = useSync();
    const [syncStatus, setSyncStatus] = useState('Idle');

    useEffect(() => {
        const encryptedNodes = nodes.filter(n => !!n.ciphertext);
        const pinnedNodes = encryptedNodes.filter(n => !!n.ipfs_hash);

        if (encryptedNodes.length > pinnedNodes.length) {
            setSyncStatus('Syncing to Andromeda...');
        } else if (encryptedNodes.length > 0) {
            setSyncStatus('Sovereign State Persistent');
        } else {
            setSyncStatus('Local Mode');
        }
    }, [nodes]);

    return { syncStatus };
}