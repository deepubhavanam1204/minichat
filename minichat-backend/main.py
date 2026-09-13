
from datetime import datetime, timedelta

import bcrypt
import jwt

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    status,
    WebSocket,
    WebSocketDisconnect
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from db import (
    create_user,
    find_user_by_email,
    find_user_by_username,
    get_all_users,
    get_messages,
    save_message
)

app = FastAPI()

SECRET_KEY = "minichat-secret-key"
ALGORITHM = "HS256"

security = HTTPBearer()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SignupRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class ConnectionManager:

    def __init__(self):
        self.active_connections = {}

    async def connect(self, username, websocket):
        await websocket.accept()

        if username not in self.active_connections:
            self.active_connections[username] = set()

        was_offline = len(self.active_connections[username]) == 0

        self.active_connections[username].add(websocket)

        return was_offline

    def disconnect(self, username, websocket):
        if username not in self.active_connections:
            return False

        connections = self.active_connections[username]

        if websocket not in connections:
            return False

        connections.remove(websocket)

        if len(connections) == 0:
            del self.active_connections[username]
            return True

        return False

    async def send_to_user(self, username, message):
        connections = self.active_connections.get(username, set())

        for websocket in connections:
            await websocket.send_json(message)

    async def broadcast_presence(self, username, online):
        for connections in self.active_connections.values():
            for websocket in connections:
                await websocket.send_json({
                    "type": "presence",
                    "username": username,
                    "online": online
                })


manager = ConnectionManager()
online_users = set()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/users")
def users(current_user: dict = Depends(get_current_user)):

    all_users = get_all_users()

    return [
        {
            **user,
            "online": user["username"] in online_users
        }
        for user in all_users
        if user["username"] != current_user["username"]
    ]


@app.post("/signup")
def signup(data: SignupRequest):

    existing_email = find_user_by_email(data.email)

    if existing_email:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    existing_username = find_user_by_username(data.username)

    if existing_username:
        raise HTTPException(
            status_code=400,
            detail="Username already taken"
        )

    password_hash = bcrypt.hashpw(
        data.password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")

    user_id = create_user(
        data.username,
        data.email,
        password_hash
    )

    return {
        "id": user_id,
        "username": data.username,
        "email": data.email
    }


@app.post("/login")
def login(data: LoginRequest):

    user = find_user_by_email(data.email)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    password_correct = bcrypt.checkpw(
        data.password.encode("utf-8"),
        user["password_hash"].encode("utf-8")
    )

    if not password_correct:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    payload = {
        "id": user["id"],
        "username": user["username"],
        "exp": datetime.utcnow() + timedelta(hours=24)
    }

    token = jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return {
        "message": "Login successful",
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "token": token
    }


@app.get("/messages/{user1}/{user2}")
def messages(
    user1: str,
    user2: str,
    current_user: dict = Depends(get_current_user)
):

    if current_user["username"] != user1:
        raise HTTPException(
            status_code=403,
            detail="You can only access your own messages"
        )

    return get_messages(user1, user2)


@app.websocket("/ws/{username}")
async def websocket_endpoint(
    websocket: WebSocket,
    username: str
):

    token = websocket.query_params.get("token")

    if not token:
        await websocket.close(code=1008)
        return

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        if payload["username"] != username:
            await websocket.close(code=1008)
            return

    except jwt.ExpiredSignatureError:
        await websocket.close(code=1008)
        return

    except jwt.InvalidTokenError:
        await websocket.close(code=1008)
        return

    was_offline = await manager.connect(
        username,
        websocket
    )

    if was_offline:
        online_users.add(username)

        await manager.broadcast_presence(
            username,
            True
        )

    print(f"{username} connected")

    try:

        while True:

            data = await websocket.receive_json()

            message_id = save_message(
                username,
                data["receiver"],
                data["content"]
            )

            message = {
                "id": message_id,
                "sender": username,
                "receiver": data["receiver"],
                "content": data["content"],
                "created_at": datetime.utcnow().isoformat()
            }

            await manager.send_to_user(
                username,
                message
            )

            await manager.send_to_user(
                data["receiver"],
                message
            )

    except WebSocketDisconnect:

        was_last_connection = manager.disconnect(
            username,
            websocket
        )

        if was_last_connection:

            online_users.discard(username)

            await manager.broadcast_presence(
                username,
                False
            )

        print(f"{username} disconnected")

