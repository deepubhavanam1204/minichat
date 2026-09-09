
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
        self.active_connections[username] = websocket

    def disconnect(self, username):
        if username in self.active_connections:
            del self.active_connections[username]

    async def send_to_user(self, username, message):
        websocket = self.active_connections.get(username)

        if websocket:
            await websocket.send_json(message)


manager = ConnectionManager()


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
    return {
        "status": "ok"
    }


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

    await manager.connect(username, websocket)

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

        manager.disconnect(username)

        print(f"{username} disconnected")

