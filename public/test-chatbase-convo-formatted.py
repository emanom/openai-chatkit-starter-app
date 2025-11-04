import requests
import json
import sys
from datetime import datetime
from typing import Dict, List, Any, Optional

def format_timestamp(timestamp: str) -> str:
    """Convert ISO timestamp to human-readable format."""
    try:
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        return dt.strftime('%Y-%m-%d %H:%M:%S UTC')
    except:
        return timestamp

def format_conversation(conversation: Dict[str, Any]) -> str:
    """Format a single conversation into a human-readable transcript."""
    lines = []
    
    # Conversation header
    lines.append("=" * 80)
    lines.append(f"CONVERSATION ID: {conversation.get('id', 'N/A')}")
    lines.append(f"Session ID: {conversation.get('sessionId', 'N/A')}")
    
    # Timestamps
    if 'createdAt' in conversation:
        lines.append(f"Started: {format_timestamp(conversation['createdAt'])}")
    if 'updatedAt' in conversation:
        lines.append(f"Last Updated: {format_timestamp(conversation['updatedAt'])}")
    
    # Source information
    if 'source' in conversation:
        lines.append(f"Source: {conversation['source']}")
    
    # User information
    if 'userId' in conversation:
        lines.append(f"User ID: {conversation['userId']}")
    
    lines.append("=" * 80)
    lines.append("")
    
    # Messages/Transcript
    messages = conversation.get('messages', [])
    if not messages:
        messages = conversation.get('transcript', [])
    
    if messages:
        lines.append("TRANSCRIPT:")
        lines.append("-" * 80)
        
        for i, message in enumerate(messages, 1):
            # Determine role (user or assistant/bot)
            role = message.get('role', message.get('sender', 'unknown')).lower()
            
            if role in ['user', 'human']:
                speaker = "USER"
            elif role in ['assistant', 'bot', 'ai', 'agent']:
                speaker = "BOT"
            else:
                speaker = role.upper()
            
            # Get message content
            content = message.get('content', message.get('message', message.get('text', '')))
            
            # Get timestamp if available
            timestamp = ""
            if 'createdAt' in message:
                timestamp = f" [{format_timestamp(message['createdAt'])}]"
            elif 'timestamp' in message:
                timestamp = f" [{format_timestamp(message['timestamp'])}]"
            
            # Format the message
            lines.append(f"\n[{speaker}]{timestamp}")
            lines.append(f"{content}")
            
            # Add any additional metadata
            if 'feedback' in message:
                lines.append(f"  Feedback: {message['feedback']}")
            
        lines.append("-" * 80)
    else:
        lines.append("No transcript available.")
    
    lines.append("")
    lines.append("")
    
    return "\n".join(lines)

def main(output_file: Optional[str] = None):
    """
    Fetch and format chatbot conversations from Chatbase API.
    
    Args:
        output_file: Optional file path to save formatted transcripts.
                     If None, prints to stdout.
    """
    url = "https://www.chatbase.co/api/v1/get-conversations"
    
    querystring = {
        "chatbotId": "pHo9w64NCxL9BwyyTbpXY",
        "filteredSources": "Widget or Iframe",
        "startDate": "2025-11-04",
        "endDate": "2025-11-04"
    }
    
    headers = {"Authorization": "Bearer f81af249-a72a-4f81-a35e-5ff238d7f18f"}
    
    output_lines = []
    
    try:
        response = requests.get(url, headers=headers, params=querystring)
        response.raise_for_status()
        
        data = response.json()
        
        # Handle different response structures
        conversations = []
        if isinstance(data, dict):
            if 'conversations' in data:
                conversations = data['conversations']
            elif 'data' in data:
                conversations = data['data']
            else:
                # If the response is a single conversation object
                conversations = [data]
        elif isinstance(data, list):
            conversations = data
        
        # Format and display each conversation
        if conversations:
            header = f"\n{'=' * 80}\nFOUND {len(conversations)} CONVERSATION(S)\n{'=' * 80}\n"
            output_lines.append(header)
            
            for idx, conversation in enumerate(conversations, 1):
                conv_header = f"\n{'#' * 80}\nCONVERSATION #{idx} of {len(conversations)}\n{'#' * 80}\n"
                output_lines.append(conv_header)
                output_lines.append(format_conversation(conversation))
        else:
            output_lines.append("\nNo conversations found for the specified date range.")
            output_lines.append("\nRaw API Response:")
            output_lines.append(json.dumps(data, indent=2))
        
        # Output to file or stdout
        output_text = "\n".join(output_lines)
        
        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(output_text)
            print(f"\n✓ Formatted transcripts saved to: {output_file}")
        else:
            print(output_text)
    
    except requests.exceptions.RequestException as e:
        error_msg = f"Error fetching conversations: {e}"
        if hasattr(e, 'response') and e.response is not None:
            error_msg += f"\nResponse: {e.response.text}"
        print(error_msg)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON response: {e}")
        if 'response' in locals():
            print(f"Raw response: {response.text}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    # Allow optional output file argument
    output_file = sys.argv[1] if len(sys.argv) > 1 else None
    main(output_file)

