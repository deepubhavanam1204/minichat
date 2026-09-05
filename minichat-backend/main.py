from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json

from db import get_connection

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    sender: str
    receiver: str
    content: str


connected_users: dict[str, WebSocket] = {}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat")
def chat(message: ChatMessage):

    conn = get_connection()
    cursor = conn.cursor()

    query = """
        INSERT INTO messages (sender, receiver, content)
        VALUES (%s, %s, %s)
    """

    cursor.execute(
        query,
        (
            message.sender,
            message.receiver,
            message.content
        )
    )

    conn.commit()

    message_id = cursor.lastrowid

    cursor.close()
    conn.close()

    return {
        "success": True,
        "message": {
            "id": message_id,
            "sender": message.sender,
            "receiver": message.receiver,
            "content": message.content
        }
    }


@app.get("/messages")
def get_messages():

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        "SELECT * FROM messages ORDER BY id"
    )

    messages = cursor.fetchall()

    cursor.close()
    conn.close()

    return messages


@app.websocket("/ws/{user}")
async def websocket_endpoint(
    websocket: WebSocket,
    user: str
):

    await websocket.accept()

    connected_users[user] = websocket

    print(f"User {user} connected")
    print(
        f"Connected users: {list(connected_users.keys())}"
    )

    try:

        while True:

            data = await websocket.receive_text()

            print(
                f"Message received from User {user}: {data}"
            )

            message = json.loads(data)

            chat_message = ChatMessage(**message)

            conn = get_connection()
            cursor = conn.cursor()

            query = """
                INSERT INTO messages
                (sender, receiver, content)
                VALUES (%s, %s, %s)
            """

            cursor.execute(
                query,
                (
                    chat_message.sender,
                    chat_message.receiver,
                    chat_message.content
                )
            )

            conn.commit()

            message_id = cursor.lastrowid

            cursor.close()
            conn.close()

            message_with_id = {
                "id": message_id,
                "sender": chat_message.sender,
                "receiver": chat_message.receiver,
                "content": chat_message.content
            }

            receiver_socket = connected_users.get(
                chat_message.receiver
            )

            print(
                f"Trying to send message to User "
                f"{chat_message.receiver}"
            )

            if receiver_socket:

                print(
                    f"Receiver User "
                    f"{chat_message.receiver} "
                    f"is connected. Sending message..."
                )

                await receiver_socket.send_text(
                    json.dumps(message_with_id)
                )

                print(
                    f"Message delivered to User "
                    f"{chat_message.receiver}"
                )

            else:

                print(
                    f"User {chat_message.receiver} "
                    f"is NOT connected"
                )

            await websocket.send_text(
                json.dumps(message_with_id)
            )

    except WebSocketDisconnect:

        if connected_users.get(user) == websocket:
            del connected_users[user]

        print(f"User {user} disconnected")
        print(
            f"Connected users: {list(connected_users.keys())}"
        )