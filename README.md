# MiniChat 💬

MiniChat is a simple real-time 1-to-1 chat application built to understand how messages travel from a frontend to a backend, get stored in a database, and reach another connected user in real time.

## 🚀 Live Application

**Frontend:**
https://minichat-jade.vercel.app/

**Backend:**
https://minichat-production-00bd.up.railway.app/

## 🛠️ Tech Stack

* **Frontend:** Next.js, React, TypeScript, Tailwind CSS
* **Backend:** Python, FastAPI
* **Database:** MySQL
* **Real-time communication:** WebSockets
* **Frontend deployment:** Vercel
* **Backend deployment:** Railway

## 🏗️ Architecture

```text
User A Browser
      │
      │ HTTP / WebSocket
      ▼
Next.js Frontend
      │
      │ HTTP / WebSocket
      ▼
FastAPI Backend
      │
      ├──────────────► MySQL Database
      │
      │ WebSocket
      ▼
User B Browser
```

## ✨ Features

* Select User A or User B
* Real-time 1-to-1 messaging
* WebSocket connection status
* Messages stored permanently in MySQL
* Message history after reopening the app
* Timestamps
* Auto-scroll to latest messages
* Send messages using Enter
* Empty messages are prevented
* Works across different devices and networks
* Responsive mobile-friendly interface
* Duplicate sent-message prevention

## 🔄 What Happens When You Send a Message?

Suppose User A sends:

```text
Hello!
```

The process is:

```text
User A
  │
  │  "Hello!"
  ▼
Next.js Frontend
  │
  │ WebSocket
  ▼
FastAPI Backend
  │
  ├──► Save message to MySQL
  │
  └──► Send message through WebSocket
            │
            ▼
         User B
```

The backend also sends the saved message back to User A so that the frontend receives the database-generated message ID.

## 🔌 Why WebSockets?

Normal HTTP works well for requests such as:

```text
Frontend → Backend
"Give me my previous messages"
```

But real-time chat needs the server to be able to send a message to the browser immediately.

With WebSockets:

```text
User A ───────────────► Server
                         │
                         │
                         ▼
                      User B
```

A WebSocket connection stays open, allowing the server to push new messages immediately without the browser repeatedly asking:

```text
"Any new message?"
"Any new message?"
"Any new message?"
```

## 🌐 HTTP vs WebSocket

### HTTP

Used for things such as loading message history.

```text
Frontend → GET /messages/A/B → Backend
Frontend ← Previous messages ← Backend
```

### WebSocket

Used for real-time communication.

```text
Frontend ←──── WebSocket ────► Backend
```

The connection stays open while the user is chatting.

## 💾 Why Use a Database?

Without a database, messages would disappear when the backend restarts.

MySQL provides permanent storage.

For example:

```text
User A sends "Hello"
        ↓
FastAPI
        ↓
MySQL
        ↓
Message stored
```

When User B opens the conversation later:

```text
User B
  ↓
GET /messages/A/B
  ↓
FastAPI
  ↓
MySQL
  ↓
Previous messages
```

## 📴 What If the Receiver Is Offline?

The message is still saved in MySQL.

For example:

```text
User A → FastAPI → MySQL
                    ✓ saved

User B
offline
```

When User B comes back and opens the chat, the frontend requests the message history and the stored message appears.

## 🔄 What If the Backend Restarts?

The messages are not lost because they are stored in MySQL rather than only in backend memory.

After the backend starts again:

```text
Frontend
   ↓
FastAPI
   ↓
MySQL
   ↓
Previous messages
```

The conversation history can still be loaded.

## 📁 Project Structure

```text
minichat/
│
├── minichat-frontend/
│   ├── app/
│   │   └── page.tsx
│   ├── package.json
│   └── ...
│
├── minichat-backend/
│   ├── main.py
│   ├── db.py
│   ├── requirements.txt
│   ├── .env
│   └── .env.example
│
└── README.md
```

## 🔐 Environment Variables

Environment variables are used for database and deployment configuration.

The `.env` file contains private values and should **never be committed to GitHub**.

The project uses `.env.example` to show which variables are required without exposing secrets.

## 💻 Running Locally

### Backend

Go to the backend directory:

```bash
cd minichat-backend
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start FastAPI:

```bash
uvicorn main:app --reload
```

### Frontend

Go to the frontend directory:

```bash
cd minichat-frontend
```

Install dependencies:

```bash
npm install
```

Start Next.js:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## 📡 API Endpoints

### Health Check

```text
GET /health
```

Used to verify that the backend is running.

### Database Test

```text
GET /db-test
```

Used to verify that the backend can connect to MySQL.

### Message History

```text
GET /messages/{user1}/{user2}
```

Returns the conversation between two users.

### WebSocket

```text
/ws/{user_id}
```

Used for real-time messaging.

## 🧠 Important Concepts Learned

This project was built to understand:

* Client-server architecture
* HTTP requests
* REST APIs
* JSON
* WebSockets
* Database persistence
* MySQL
* Environment variables
* Frontend/backend communication
* Real-time communication
* Deployment
* Vercel
* Railway
* Git and GitHub

## 🎯 V1 Scope

MiniChat intentionally keeps the first version simple.

The following are **not included** in V1:

* Google login
* OTP authentication
* JWT
* Group chats
* Profile pictures
* Voice/video calls
* Image/file sharing
* Message reactions
* Message editing/deletion
* Push notifications
* End-to-end encryption
* Redis
* Kafka
* Docker/Kubernetes
* Microservices
* AI chatbot

These can be explored in future versions.

## 📌 Definition of Done

MiniChat V1 is complete when:

* [x] User A and User B can select a user
* [x] Messages can be sent in real time
* [x] Messages are stored in MySQL
* [x] Message history loads after reopening
* [x] WebSocket connection works
* [x] App works across devices
* [x] Backend is deployed
* [x] Frontend is deployed
* [x] Environment variables are configured
* [x] GitHub repository contains the project
* [x] README documents the system

## 👩‍💻 Project

Built as a learning project to understand how a real-time full-stack application works from frontend to backend, database, and WebSocket communication.
