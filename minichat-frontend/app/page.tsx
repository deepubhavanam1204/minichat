"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: number;
  username: string;
  email: string;
  token: string;
};

type Message = {
  id: number;
  sender: string;
  receiver: string;
  content: string;
  created_at: string | null;
};

export default function Home() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToBottom = useRef(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;
  const WS_URL = process.env.NEXT_PUBLIC_WS_URL;

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      router.push("/login");
      return;
    }

    const user: User = JSON.parse(storedUser);
    setCurrentUser(user);

    if (!API_URL || !WS_URL) {
      return;
    }

    const receiver =
      user.username === "alice" ? "bob" : "alice";

    async function loadMessages() {
      try {
        const response = await fetch(
          `${API_URL}/messages/${user.username}/${receiver}`,
          {
            headers: {
              Authorization: `Bearer ${user.token}`,
            },
          }
        );

        if (response.status === 401) {
          localStorage.removeItem("user");
          router.push("/login");
          return;
        }

        if (response.status === 403) {
          console.error("You are not allowed to access these messages");
          return;
        }

        const data = await response.json();

        setMessages(data);
      } catch (error) {
        console.error("Failed to load messages:", error);
      }
    }

    loadMessages();

  const socket = new WebSocket(
  `${WS_URL}/ws/${user.username}?token=${encodeURIComponent(user.token)}`
);

    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
      console.log("WebSocket connected");
    };

    socket.onmessage = (event) => {
      const incomingMessage: Message = JSON.parse(event.data);

      setMessages((previousMessages) => {
        const temporaryMessageIndex = previousMessages.findIndex(
          (msg) =>
            msg.id < 0 &&
            msg.sender === incomingMessage.sender &&
            msg.receiver === incomingMessage.receiver &&
            msg.content === incomingMessage.content
        );

        if (temporaryMessageIndex !== -1) {
          const updatedMessages = [...previousMessages];

          updatedMessages[temporaryMessageIndex] = incomingMessage;

          return updatedMessages;
        }

        const alreadyExists = previousMessages.some(
          (msg) => msg.id === incomingMessage.id
        );

        if (alreadyExists) {
          return previousMessages;
        }

        return [...previousMessages, incomingMessage];
      });
    };

    socket.onclose = () => {
      setConnected(false);
      console.log("WebSocket disconnected");
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [API_URL, WS_URL, router]);

  useEffect(() => {
    if (shouldScrollToBottom.current) {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [messages]);

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;

    const distanceFromBottom =
      element.scrollHeight -
      element.scrollTop -
      element.clientHeight;

    shouldScrollToBottom.current = distanceFromBottom < 100;
  }

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
      console.log("WebSocket is not connected");
      return;
    }

    const receiver =
      currentUser.username === "alice" ? "bob" : "alice";

    const messageContent = message.trim();

    const temporaryMessage: Message = {
      id: -Date.now(),
      sender: currentUser.username,
      receiver,
      content: messageContent,
      created_at: new Date().toISOString(),
    };

    setMessages((previousMessages) => [
      ...previousMessages,
      temporaryMessage,
    ]);

    const chatMessage = {
      sender: currentUser.username,
      receiver,
      content: messageContent,
    };

    socket.send(JSON.stringify(chatMessage));

    setMessage("");
  }

  function logout() {
    socketRef.current?.close();

    localStorage.removeItem("user");

    setCurrentUser(null);
    setMessages([]);
    setConnected(false);

    router.push("/login");
  }

  function formatTime(createdAt: string | null) {
    if (!createdAt) {
      return "";
    }

    return new Date(createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4 text-gray-900">
      <div className="mx-auto flex h-[90vh] max-w-2xl flex-col rounded-xl border-2 border-black bg-white shadow-lg">
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              MiniChat
            </h1>

            <button
              onClick={logout}
              className="rounded-lg bg-red-500 px-4 py-2 font-medium text-white hover:bg-red-600"
            >
              Logout
            </button>
          </div>

          {currentUser && (
            <div className="mt-3 flex items-center gap-3">
              <span className="font-medium">
                Logged in as: {currentUser.username}
              </span>

              <span
                className={`text-sm font-medium ${
                  connected
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {connected ? "Connected" : "Disconnected"}
              </span>
            </div>
          )}
        </div>

        <div
          className="flex-1 overflow-y-auto p-4"
          onScroll={handleScroll}
        >
          {!currentUser ? (
            <div className="flex h-full items-center justify-center text-gray-500">
              Please login first
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((msg) => {
                const isMine =
                  msg.sender === currentUser.username;

                return (
                  <div
                    key={msg.id}
                    className={`flex ${
                      isMine
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[75%] rounded-xl px-4 py-2 ${
                        isMine
                          ? "bg-blue-500 text-white"
                          : "bg-gray-200 text-gray-900"
                      }`}
                    >
                      <div>{msg.content}</div>

                      <div
                        className={`mt-1 text-xs ${
                          isMine
                            ? "text-blue-100"
                            : "text-gray-500"
                        }`}
                      >
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="border-t p-4">
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(event) =>
                setMessage(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  sendMessage();
                }
              }}
              disabled={!currentUser}
              placeholder={
                currentUser
                  ? "Type a message..."
                  : "Please login first..."
              }
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-900 outline-none focus:border-blue-500 disabled:bg-gray-100"
            />

            <button
              onClick={sendMessage}
              disabled={!currentUser}
              className="rounded-lg bg-blue-500 px-5 py-2 font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}