"""
WebSocket Message Schemas — Validation for incoming messages
"""

from typing import Literal, Optional, Any, Union
from pydantic import BaseModel, Field, validator


class HeartbeatMessage(BaseModel):
    type: Literal['heartbeat']
    timestamp: Optional[float] = None


class ThickClickMessage(BaseModel):
    type: Literal['thick_click']


class IngestWorkspaceMessage(BaseModel):
    action: Literal['ingest_workspace']


class ChatMessage(BaseModel):
    action: Literal['chat']
    content: str = Field(..., min_length=1, max_length=50000)
    history: list = Field(default_factory=list)


class PromoteToSovereignMessage(BaseModel):
    action: Literal['promote_to_sovereign']
    node_id: str = Field(..., min_length=1, max_length=200)


class LitResponseMessage(BaseModel):
    type: Literal['lit_response']
    action: Literal['encrypt_node']
    node_id: str = Field(..., min_length=1, max_length=200)
    ciphertext: str
    accessControlConditions: Any


class ProvideAuthContentMessage(BaseModel):
    action: Literal['provide_auth_content']
    node_id: str = Field(..., min_length=1, max_length=200)
    content: str


# Message type registry for validation
MESSAGE_SCHEMAS = {
    # Type-based messages
    'heartbeat': HeartbeatMessage,
    'thick_click': ThickClickMessage,
    'lit_response': LitResponseMessage,
    # Action-based messages
    'ingest_workspace': IngestWorkspaceMessage,
    'chat': ChatMessage,
    'promote_to_sovereign': PromoteToSovereignMessage,
    'provide_auth_content': ProvideAuthContentMessage,
}


def validate_message(data: dict) -> tuple[Optional[BaseModel], Optional[str]]:
    """
    Validate an incoming WebSocket message against known schemas.

    Returns:
        tuple: (validated_model, error_message)
        - If valid: (model_instance, None)
        - If unknown type: (None, None) - allows pass-through
        - If validation error: (None, error_string)
    """
    # Determine message type (check both 'type' and 'action' fields)
    msg_type = data.get('type')
    msg_action = data.get('action')

    # Special case: lit_response has both type and action
    if msg_type == 'lit_response' and msg_action == 'encrypt_node':
        schema = MESSAGE_SCHEMAS.get('lit_response')
    elif msg_type in MESSAGE_SCHEMAS:
        schema = MESSAGE_SCHEMAS[msg_type]
    elif msg_action in MESSAGE_SCHEMAS:
        schema = MESSAGE_SCHEMAS[msg_action]
    else:
        # Unknown message type - allow pass-through for extensibility
        return None, None

    try:
        validated = schema(**data)
        return validated, None
    except Exception as e:
        return None, str(e)


def get_error_response(message: str, code: str = "validation_error") -> dict:
    """Generate a standardized error response."""
    return {
        "type": "error",
        "code": code,
        "message": message,
    }
