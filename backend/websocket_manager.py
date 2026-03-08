from fastapi import WebSocket
from typing import Dict, Set
import logging
import json

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self.admin_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket, user_id: int = None, is_admin: bool = False):
        await websocket.accept()

        if is_admin:
            self.admin_connections.add(websocket)
            logger.info("WebSocket connected for admin")
        elif user_id is not None:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = set()
            self.active_connections[user_id].add(websocket)
            logger.info(f"WebSocket connected for user {user_id}")

    def disconnect(self, websocket: WebSocket, user_id: int = None, is_admin: bool = False):
        if is_admin:
            self.admin_connections.discard(websocket)
            logger.info("WebSocket disconnected for admin")
        elif user_id is not None:
            if user_id in self.active_connections:
                self.active_connections[user_id].discard(websocket)
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
            logger.info(f"WebSocket disconnected for user {user_id}")

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending message to user {user_id}: {e}")
                    disconnected.add(connection)
            for connection in disconnected:
                self.disconnect(connection, user_id)

    async def broadcast_to_admins(self, message: dict):
        disconnected = set()
        for connection in self.admin_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to admin: {e}")
                disconnected.add(connection)
        for connection in disconnected:
            self.disconnect(connection, is_admin=True)

    async def send_to_account(self, message: dict, account_id: int, user_id: int):
        message_with_account = {
            **message,
            "account_id": account_id
        }
        await self.send_personal_message(message_with_account, user_id)
        # Also broadcast to admins
        await self.broadcast_to_admins(message_with_account)

    async def broadcast_to_user(self, message: dict, user_id: int):
        await self.send_personal_message(message, user_id)

manager = ConnectionManager()
