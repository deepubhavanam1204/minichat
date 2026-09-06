
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from db import get_connection, get_messages, save_message

app = FastAPI()

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

            save_message(
                data["sender"],
                data["receiver"],
                data["content"]
            )

            if data["receiver"] in connections:
                await connections[data["receiver"]].send_json(data)

    except WebSocketDisconnect:
        if connections.get(user_id) is websocket:
            del connections[user_id]

