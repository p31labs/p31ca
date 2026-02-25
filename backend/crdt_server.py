import asyncio

import websockets
from pycrdt import Doc
from pycrdt_websocket import WebsocketServer

# Initialize the shared P31 document
doc = Doc()

# Define our shared data structures
# We map the Spoon Engine state and the Graph Nodes
state_map = doc.get_map("p31_state")
nodes_array = doc.get_array("p31_nodes")


async def main():
    async with websockets.serve(
        lambda websocket: WebsocketServer(websocket, doc).serve(),
        "localhost",
        8032,  # Running on a separate port from the AI Mesh (8031)
    ):
        print("[P31 CRDT] Synchronization Matrix Online on port 8032")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
