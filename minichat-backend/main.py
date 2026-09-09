from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import bcrypt

from db import get_connection, get_messages, save_message, create_user

app = FastAPI()

class SignupRequest(BaseModel):
    username: str
    email: str
    password: str

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

connections = {}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/db-test")
def db_test():
    conn = get_connection()
    conn.close()
    return {"database": "connected"}

@app.post("/signup")
def signup(request: SignupRequest):
    password_hash = bcrypt.hashpw(
        request.password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")

    user_id = create_user(
        request.username,
        request.email,
        password_hash
    )

    return {
        "id": user_id,
        "username": request.username,
        "email": request.email
    }

@app.get("/messages/{user1}/{user2}")
def messages(user1: str, user2: str):
    return get_messages(user1, user2)


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await websocket.accept()
    connections[user_id] = websocket

    try:
        while True:
            data = await websocket.receive_json()

            message_id = save_message(
                data["sender"],
                data["receiver"],
                data["content"]
            )

            message = {
                "id": message_id,
                "sender": data["sender"],
                "receiver": data["receiver"],
                "content": data["content"],
                "created_at": datetime.now().isoformat()
            }

            if data["receiver"] in connections:
                await connections[data["receiver"]].send_json(message)

            if data["sender"] in connections:
                await connections[data["sender"]].send_json(message)

    except WebSocketDisconnect:
        if connections.get(user_id) is websocket:
            del connections[user_id]