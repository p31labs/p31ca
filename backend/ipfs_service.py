"""
P31 Persistence Engine — IPFS Integration
Handles pinning of Sovereign nodes to the InterPlanetary File System.
"""

import asyncio
from typing import Any, Dict, Optional

import ipfshttpclient


class P31Persistence:
    """Manages IPFS pinning for Sovereign nodes."""

    def __init__(self, ipfs_host: str = "/ip4/127.0.0.1/tcp/5001"):
        self.ipfs_host = ipfs_host
        self.client = None
        self._connect()

    def _connect(self):
        """Establish connection to IPFS daemon."""
        try:
            self.client = ipfshttpclient.connect(self.ipfs_host)
            print("[P31 Persistence] IPFS Node Linked.")
        except Exception as e:
            print(
                f"[P31 Persistence] IPFS Connection Failed: {e}. Operating in Local-Only mode."
            )
            self.client = None

    async def pin_sovereign_node(
        self, node_id: str, ciphertext: str, access_control: Dict[str, Any]
    ) -> Optional[str]:
        """
        Pin a Sovereign node to IPFS.

        Args:
            node_id: Unique identifier for the node
            ciphertext: Encrypted content from Lit Protocol
            access_control: Lit Protocol access control conditions

        Returns:
            IPFS hash if successful, None otherwise
        """
        if not self.client:
            return None

        # Package the encrypted node with its Lit Access Controls
        payload = {
            "node_id": node_id,
            "ciphertext": ciphertext,
            "access_control": access_control,
            "version": "1.0.0",
            "timestamp": asyncio.get_event_loop().time(),
        }

        try:
            # Pin to IPFS
            res = self.client.add_json(payload)
            ipfs_hash = res
            print(f"[P31 Persistence] Node {node_id} pinned to IPFS: {ipfs_hash}")
            return ipfs_hash
        except Exception as e:
            print(f"[P31 Persistence] Failed to pin node {node_id}: {e}")
            return None

    async def retrieve_sovereign_node(self, ipfs_hash: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a Sovereign node from IPFS.

        Args:
            ipfs_hash: IPFS hash of the node

        Returns:
            Node data if successful, None otherwise
        """
        if not self.client:
            return None

        try:
            payload = self.client.cat_json(ipfs_hash)
            print(
                f"[P31 Persistence] Retrieved node from IPFS: {payload.get('node_id')}"
            )
            return payload
        except Exception as e:
            print(f"[P31 Persistence] Failed to retrieve node {ipfs_hash}: {e}")
            return None

    def is_connected(self) -> bool:
        """Check if IPFS connection is active."""
        return self.client is not None


# Global Instance
persistence_engine = P31Persistence()
