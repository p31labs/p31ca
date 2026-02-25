"""
P31 Backup Manager — Coordinates IPFS and Arweave persistence
Monitors CRDT changes and ensures Sovereign nodes are backed up to decentralized storage.
"""

import asyncio
from typing import Any, Dict, List, Optional

from pycrdt import Array

from ipfs_service import persistence_engine


class BackupManager:
    """Coordinates backup operations between IPFS and Arweave."""

    def __init__(self):
        self.backup_queue: List[Dict[str, Any]] = []
        self.is_running = False
        self.backup_task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the backup monitoring task."""
        if not self.is_running:
            self.is_running = True
            self.backup_task = asyncio.create_task(self._backup_loop())
            print("[P31 Backup] Manager started.")

    async def stop(self):
        """Stop the backup monitoring task."""
        if self.is_running:
            self.is_running = False
            if self.backup_task:
                self.backup_task.cancel()
                try:
                    await self.backup_task
                except asyncio.CancelledError:
                    pass
            print("[P31 Backup] Manager stopped.")

    async def _backup_loop(self):
        """Main backup loop that processes the queue."""
        while self.is_running:
            try:
                if self.backup_queue:
                    # Process queue in batches
                    batch = self.backup_queue[:10]  # Process 10 at a time
                    self.backup_queue = self.backup_queue[10:]

                    for node_data in batch:
                        await self._process_node_backup(node_data)

                await asyncio.sleep(1.0)  # Check every second
            except Exception as e:
                print(f"[P31 Backup] Error in backup loop: {e}")
                await asyncio.sleep(5.0)  # Wait before retrying

    async def _process_node_backup(self, node_data: Dict[str, Any]):
        """Process a single node backup."""
        node_id = node_data.get("id")
        ciphertext = node_data.get("ciphertext")
        access_control = node_data.get("access_control")

        if not all([node_id, ciphertext, access_control]):
            return

        # Try IPFS first
        ipfs_hash = await persistence_engine.pin_sovereign_node(
            str(node_id) if node_id else "",
            str(ciphertext) if ciphertext else "",
            access_control if access_control else {},
        )

        if ipfs_hash:
            # Update the node with the IPFS hash
            node_data["ipfs_hash"] = ipfs_hash
            node_data["backup_status"] = "pinned"
            print(f"[P31 Backup] Node {node_id} backed up to IPFS: {ipfs_hash}")
        else:
            # Mark as failed
            node_data["backup_status"] = "failed"
            print(f"[P31 Backup] Failed to backup node {node_id}")

    def queue_node_for_backup(self, node_data: Dict[str, Any]):
        """Queue a node for backup."""
        # Check if node is already in queue
        for queued in self.backup_queue:
            if queued.get("id") == node_data.get("id"):
                return  # Already queued

        self.backup_queue.append(node_data)
        print(f"[P31 Backup] Queued node {node_data.get('id')} for backup")

    def process_crdt_nodes(self, crdt_nodes: Array):
        """Scan CRDT nodes and queue Sovereign nodes for backup."""
        for node in crdt_nodes:
            # If node is encrypted but doesn't have a persistence hash yet
            if node.get("ciphertext") and not node.get("ipfs_hash"):
                self.queue_node_for_backup(node)

    async def get_backup_status(self) -> Dict[str, Any]:
        """Get current backup status."""
        return {
            "queue_length": len(self.backup_queue),
            "ipfs_connected": persistence_engine.is_connected(),
            "status": "running" if self.is_running else "stopped",
        }


# Global Instance
backup_manager = BackupManager()
