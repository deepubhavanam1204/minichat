"use client";

import { useEffect, useRef, useState } from "react";

type User = "A" | "B";

type Message = {
  id: number;
  sender: User;
  receiver: User;
  content: string;
};

export default function Home() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUser, setCurrentUser] =
    useState<User | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState("Select a user");

  const socketRef = useRef<WebSocket | null>(null);

  // Reference to the bottom of the chat
  const messagesEndRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      try {
        const response = await fetch(
         `${process.env.NEXT_PUBLIC_API_URL}/messages`
        );

        const data: Message[] = await response.json();

        if (!cancelled) {
          setMessages((previousMessages) => {
            const combined = [
              ...data,
              ...previousMessages
            ];

            const uniqueMessages =
              combined.filter(
                (msg, index, array) =>
                  array.findIndex(
                    (item) => item.id === msg.id
                  ) === index
              );

            return uniqueMessages.sort(
              (a, b) => a.id - b.id
            );
          });
        }
      } catch (error) {
        console.log(
          "Failed to load messages:",
          error
        );
      }
    }

    loadMessages();

    setConnectionStatus("Connecting...");

    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL}/ws/${currentUser}`
    );

    socketRef.current = ws;

    ws.onopen = () => {
      console.log(
        `WebSocket connected as User ${currentUser}`
      );

      setConnectionStatus("Connected");
    };

    ws.onmessage = (event) => {
      console.log(
        `Message received by User ${currentUser}:`,
        event.data
      );

      const newMessage: Message =
        JSON.parse(event.data);

      setMessages((previousMessages) => {
        const alreadyExists =
          previousMessages.some(
            (msg) => msg.id === newMessage.id
          );

        if (alreadyExists) {
          return previousMessages;
        }

        return [
          ...previousMessages,
          newMessage
        ].sort((a, b) => a.id - b.id);
      });
    };

    ws.onerror = (error) => {
      console.log(
        `WebSocket error for User ${currentUser}:`,
        error
      );

      setConnectionStatus("Connection error");
    };

    ws.onclose = () => {
      console.log(
        `WebSocket disconnected for User ${currentUser}`
      );

      setConnectionStatus("Disconnected");

      if (socketRef.current === ws) {
        socketRef.current = null;
      }
    };

    return () => {
      cancelled = true;

      if (socketRef.current === ws) {
        socketRef.current = null;
      }

      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    };
  }, [currentUser]);

  // Automatically scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages]);

  function sendMessage() {
    if (message.trim() === "") {
      return;
    }

    const socket = socketRef.current;

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !currentUser
    ) {
      console.log(
        "WebSocket is not connected"
      );

      return;
    }

    const receiver =
      currentUser === "A" ? "B" : "A";

    const chatMessage = {
      sender: currentUser,
      receiver: receiver,
      content: message
    };

    socket.send(
      JSON.stringify(chatMessage)
    );

    setMessage("");
  }

  function switchUser(user: User) {
    setCurrentUser(user);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">

        <h1 className="text-2xl font-bold mb-4">
          MiniChat
        </h1>

        <div className="mb-4">

          <p className="mb-2 font-semibold">
            You are:
          </p>

          <div className="flex gap-2">

            <button
              onClick={() => switchUser("A")}
              className="border px-4 py-2 rounded-lg"
            >
              User A
            </button>

            <button
              onClick={() => switchUser("B")}
              className="border px-4 py-2 rounded-lg"
            >
              User B
            </button>

          </div>

          <p className="mt-2 text-sm text-gray-600">
            {currentUser
              ? `Currently chatting as User ${currentUser}`
              : "Please select User A or User B"}
          </p>

          {currentUser && (
            <p className="text-sm mt-1">
              Status: {connectionStatus}
            </p>
          )}

        </div>

        <div className="h-80 border rounded-lg p-4 mb-4 overflow-y-auto">

          {messages.map((msg) => {

            const isMine =
              msg.sender === currentUser;

            return (
              <div
                key={msg.id}
                className={`flex mb-2 ${
                  isMine
                    ? "justify-end"
                    : "justify-start"
                }`}
              >

                <div
                  className={`max-w-[75%] px-3 py-2 rounded-lg ${
                    isMine
                      ? "bg-blue-500 text-white rounded-br-none"
                      : "bg-gray-200 text-gray-900 rounded-bl-none"
                  }`}
                >

                  <div className="text-sm font-semibold mb-1">
                    User {msg.sender}
                  </div>

                  <div>
                    {msg.content}
                  </div>

                </div>

              </div>
            );
          })}

          {/* Invisible element at the bottom */}
          <div ref={messagesEndRef} />

        </div>

        <div className="flex gap-2">

          <input
            type="text"
            value={message}
            onChange={(e) =>
              setMessage(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendMessage();
              }
            }}
            placeholder={
              currentUser
                ? "Type a message..."
                : "Select a user first"
            }
            disabled={!currentUser}
            className="flex-1 border rounded-lg px-3 py-2"
          />

          <button
            onClick={sendMessage}
            disabled={!currentUser}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:bg-gray-400"
          >
            Send
          </button>

        </div>

      </div>
    </main>
  );
}