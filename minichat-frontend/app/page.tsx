
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: number;
  username: string;
  email: string;
  token: string;
};

type ChatUser = {
  id: number;
  username: string;
  email: string;
  online: boolean;
  last_message: string | null;
  last_message_time: string | null;
  last_message_sender: string | null;
  last_message_status: "SENT" | "DELIVERED" | "READ" | null;
};

type Message = {
  id: number;
  sender: string;
  receiver: string;
  content: string;
  status: "SENT" | "DELIVERED" | "READ";
  created_at: string | null;
};

type PresenceMessage = {
  type: "presence";
  username: string;
  online: boolean;
};

type TypingMessage = {
  type: "typing";
  username: string;
  typing: boolean;
};

type MessageStatus = {
  type: "message_status";
  message_id: number;
  status: "SENT" | "DELIVERED" | "READ";
};

export default function Home() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [showChat, setShowChat] = useState(false);
  const [searchText, setSearchText] = useState("");

  const socketRef = useRef<WebSocket | null>(null);

  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const reconnectingRef = useRef(false);
  const manuallyClosedRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToBottom = useRef(true);

  const selectedUserRef = useRef<ChatUser | null>(null);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const lastOutgoingMessageIdsRef = useRef<Record<string, number>>({});

  const API_URL = process.env.NEXT_PUBLIC_API_URL;
  const WS_URL = process.env.NEXT_PUBLIC_WS_URL;

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

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

    manuallyClosedRef.current = false;

    async function loadUsers() {
      try {
        const response = await fetch(`${API_URL}/users`, {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        });

        if (response.status === 401) {
          localStorage.removeItem("user");
          router.push("/login");
          return;
        }

        if (!response.ok) {
          console.error("Failed to load users");
          return;
        }

        const data: ChatUser[] = await response.json();

        setUsers(data);
      } catch (error) {
        console.error("Failed to load users:", error);
      }
    }

    function clearReconnectTimeout() {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    }

    function scheduleReconnect() {
      if (manuallyClosedRef.current) {
        return;
      }

      if (document.visibilityState !== "visible") {
        return;
      }

      if (reconnectTimeoutRef.current) {
        return;
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectWebSocket();
      }, 1000);
    }

    function connectWebSocket() {
      if (manuallyClosedRef.current) {
        return;
      }

      if (document.visibilityState !== "visible") {
        return;
      }

      if (
        socketRef.current &&
        (
          socketRef.current.readyState === WebSocket.OPEN ||
          socketRef.current.readyState === WebSocket.CONNECTING
        )
      ) {
        return;
      }

      if (reconnectingRef.current) {
        return;
      }

      reconnectingRef.current = true;

      const socket = new WebSocket(
        `${WS_URL}/ws/${user.username}?token=${encodeURIComponent(
          user.token
        )}`
      );

      socketRef.current = socket;

      socket.onopen = () => {
        reconnectingRef.current = false;
        clearReconnectTimeout();

        setConnected(true);

        loadUsers();
      };

      socket.onmessage = (event) => {
        const incomingData = JSON.parse(event.data);

        if (incomingData.type === "presence") {
          const presenceMessage: PresenceMessage = incomingData;

          setUsers((previousUsers) =>
            previousUsers.map((existingUser) =>
              existingUser.username === presenceMessage.username
                ? {
                    ...existingUser,
                    online: presenceMessage.online,
                  }
                : existingUser
            )
          );

          setSelectedUser((previousSelectedUser) => {
            if (
              previousSelectedUser &&
              previousSelectedUser.username ===
                presenceMessage.username
            ) {
              return {
                ...previousSelectedUser,
                online: presenceMessage.online,
              };
            }

            return previousSelectedUser;
          });

          return;
        }

        if (incomingData.type === "typing") {
          const typingMessage: TypingMessage = incomingData;

          if (typingMessage.username === user.username) {
            return;
          }

          setTypingUsers((previousTypingUsers) => ({
            ...previousTypingUsers,
            [typingMessage.username]: typingMessage.typing,
          }));

          const selected = selectedUserRef.current;

          if (
            selected &&
            typingMessage.username === selected.username
          ) {
            if (typingMessage.typing) {
              setTypingUser(typingMessage.username);
            } else {
              setTypingUser(null);
            }
          }

          return;
        }

        if (incomingData.type === "message_status") {
          const statusMessage: MessageStatus = incomingData;

          setMessages((previousMessages) =>
            previousMessages.map((msg) =>
              msg.id === statusMessage.message_id
                ? {
                    ...msg,
                    status: statusMessage.status,
                  }
                : msg
            )
          );

          const lastMessageOwner = Object.keys(
            lastOutgoingMessageIdsRef.current
          ).find(
            (username) =>
              lastOutgoingMessageIdsRef.current[username] ===
              statusMessage.message_id
          );

          if (lastMessageOwner) {
            setUsers((previousUsers) =>
              previousUsers.map((chatUser) =>
                chatUser.username === lastMessageOwner
                  ? {
                      ...chatUser,
                      last_message_status:
                        statusMessage.status,
                    }
                  : chatUser
              )
            );
          }

          return;
        }

        if (incomingData.type === "new_message") {
          const incomingMessage: Message = incomingData;

          if (incomingMessage.sender === user.username) {
            lastOutgoingMessageIdsRef.current[
              incomingMessage.receiver
            ] = incomingMessage.id;
          }

          if (incomingMessage.receiver === user.username) {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  type: "delivered",
                  message_id: incomingMessage.id,
                })
              );
            }
          }

          const selected = selectedUserRef.current;

          if (selected) {
            const belongsToCurrentChat =
              (incomingMessage.sender === user.username &&
                incomingMessage.receiver === selected.username) ||
              (incomingMessage.sender === selected.username &&
                incomingMessage.receiver === user.username);

            if (belongsToCurrentChat) {
              setMessages((previousMessages) => {
                const temporaryMessageIndex =
                  previousMessages.findIndex(
                    (msg) =>
                      msg.id < 0 &&
                      msg.sender === incomingMessage.sender &&
                      msg.receiver === incomingMessage.receiver &&
                      msg.content === incomingMessage.content
                  );

                if (temporaryMessageIndex !== -1) {
                  const updatedMessages = [...previousMessages];

                  updatedMessages[temporaryMessageIndex] =
                    incomingMessage;

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

              if (
                incomingMessage.receiver === user.username &&
                socket.readyState === WebSocket.OPEN
              ) {
                socket.send(
                  JSON.stringify({
                    type: "read",
                    message_id: incomingMessage.id,
                  })
                );
              }
            }
          }

          updateLastMessagePreview(incomingMessage);

          return;
        }
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }

        reconnectingRef.current = false;

        setConnected(false);

        scheduleReconnect();
      };

      socket.onerror = () => {
        setConnected(false);

        if (socketRef.current === socket) {
          socket.close();
        }
      };
    }

    loadUsers();
    connectWebSocket();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        const socket = socketRef.current;

        if (
          !socket ||
          (
            socket.readyState !== WebSocket.OPEN &&
            socket.readyState !== WebSocket.CONNECTING
          )
        ) {
          clearReconnectTimeout();
          connectWebSocket();
        } else if (socket.readyState === WebSocket.OPEN) {
          setConnected(true);
          loadUsers();
        }
      }
    }

    function handleOnline() {
      if (!navigator.onLine) {
        return;
      }

      const socket = socketRef.current;

      if (
        !socket ||
        (
          socket.readyState !== WebSocket.OPEN &&
          socket.readyState !== WebSocket.CONNECTING
        )
      ) {
        clearReconnectTimeout();
        connectWebSocket();
      }
    }

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    window.addEventListener("online", handleOnline);

    return () => {
      manuallyClosedRef.current = true;

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      window.removeEventListener("online", handleOnline);

      clearReconnectTimeout();

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      reconnectingRef.current = false;

      setConnected(false);
    };
  }, [API_URL, WS_URL, router]);

  useEffect(() => {
    if (!currentUser || !selectedUser || !API_URL) {
      return;
    }

    const loggedInUser = currentUser;
    const chatUser = selectedUser;

    async function loadMessages() {
      try {
        setMessages([]);
        setTypingUser(null);

        const response = await fetch(
          `${API_URL}/messages/${loggedInUser.username}/${chatUser.username}`,
          {
            headers: {
              Authorization: `Bearer ${loggedInUser.token}`,
            },
          }
        );

        if (response.status === 401) {
          localStorage.removeItem("user");
          router.push("/login");
          return;
        }

        if (response.status === 403) {
          console.error(
            "You are not allowed to access these messages"
          );
          return;
        }

        if (!response.ok) {
          console.error("Failed to load messages");
          return;
        }

        const data: Message[] = await response.json();

        setMessages(data);

        const socket = socketRef.current;

        if (
          socket &&
          socket.readyState === WebSocket.OPEN
        ) {
          for (const msg of data) {
            if (
              msg.receiver === loggedInUser.username &&
              msg.status !== "READ"
            ) {
              socket.send(
                JSON.stringify({
                  type: "delivered",
                  message_id: msg.id,
                })
              );

              socket.send(
                JSON.stringify({
                  type: "read",
                  message_id: msg.id,
                })
              );
            }
          }
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
      }
    }

    loadMessages();
  }, [currentUser, selectedUser, API_URL, router]);

  useEffect(() => {
    if (shouldScrollToBottom.current) {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [messages]);

  function updateLastMessagePreview(incomingMessage: Message) {
    const otherUsername =
      incomingMessage.sender === currentUser?.username
        ? incomingMessage.receiver
        : incomingMessage.sender;

    setUsers((previousUsers) => {
      const updatedUsers = previousUsers.map((user) =>
        user.username === otherUsername
          ? {
              ...user,
              last_message: incomingMessage.content,
              last_message_time: incomingMessage.created_at,
              last_message_sender: incomingMessage.sender,
              last_message_status:
                incomingMessage.sender === currentUser?.username
                  ? incomingMessage.status
                  : null,
            }
          : user
      );

      return updatedUsers.sort((a, b) => {
        if (!a.last_message_time && !b.last_message_time) {
          return a.username.localeCompare(b.username);
        }

        if (!a.last_message_time) {
          return 1;
        }

        if (!b.last_message_time) {
          return -1;
        }

        const timeA = new Date(a.last_message_time).getTime();
        const timeB = new Date(b.last_message_time).getTime();

        return timeB - timeA;
      });
    });
  }

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;

    const distanceFromBottom =
      element.scrollHeight -
      element.scrollTop -
      element.clientHeight;

    shouldScrollToBottom.current = distanceFromBottom < 100;
  }

  function selectUser(user: ChatUser) {
    if (isTypingRef.current) {
      stopTyping();
    }

    setSelectedUser(user);
    setMessages([]);
    setTypingUser(null);
    shouldScrollToBottom.current = true;
    setShowChat(true);
  }

  function goBackToUsers() {
    if (isTypingRef.current) {
      stopTyping();
    }

    setShowChat(false);
    setSelectedUser(null);
    setMessages([]);
    setTypingUser(null);
    shouldScrollToBottom.current = true;
  }

  function startTyping() {
    const socket = socketRef.current;

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !currentUser ||
      !selectedUser
    ) {
      return;
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true;

      socket.send(
        JSON.stringify({
          type: "typing",
          receiver: selectedUser.username,
          typing: true,
        })
      );
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 1000);
  }

  function stopTyping() {
    const socket = socketRef.current;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (
      !isTypingRef.current ||
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !selectedUser
    ) {
      isTypingRef.current = false;
      return;
    }

    socket.send(
      JSON.stringify({
        type: "typing",
        receiver: selectedUser.username,
        typing: false,
      })
    );

    isTypingRef.current = false;
  }

  function sendMessage() {
    if (message.trim() === "") {
      return;
    }

    const socket = socketRef.current;

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !currentUser ||
      !selectedUser
    ) {
      return;
    }

    stopTyping();

    const messageContent = message.trim();

    const temporaryMessage: Message = {
      id: -Date.now(),
      sender: currentUser.username,
      receiver: selectedUser.username,
      content: messageContent,
      status: "SENT",
      created_at: new Date().toISOString(),
    };

    setMessages((previousMessages) => [
      ...previousMessages,
      temporaryMessage,
    ]);

    updateLastMessagePreview(temporaryMessage);

    const chatMessage = {
      receiver: selectedUser.username,
      content: messageContent,
    };

    socket.send(JSON.stringify(chatMessage));

    setMessage("");
  }

  function logout() {
    stopTyping();

    manuallyCloseSocket();

    localStorage.removeItem("user");

    setCurrentUser(null);
    setUsers([]);
    setSelectedUser(null);
    setMessages([]);
    setTypingUser(null);
    setTypingUsers({});
    setConnected(false);
    setShowChat(false);

    router.push("/login");
  }

  function manuallyCloseSocket() {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    manuallyClosedRef.current = true;

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }

  function formatTime(createdAt: string | null) {
    if (!createdAt) {
      return "";
    }

    const utcDate = createdAt.endsWith("Z")
      ? createdAt
      : `${createdAt}Z`;

    const date = new Date(utcDate);
    const now = new Date();

    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (sameDay) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    }

    return date.toLocaleDateString([], {
      day: "2-digit",
      month: "2-digit",
    });
  }

  function formatLastMessage(message: string | null) {
    if (!message) {
      return "No messages yet";
    }

    if (message.length > 38) {
      return `${message.substring(0, 38)}...`;
    }

    return message;
  }

  function getMessageStatus(msg: Message) {
    if (msg.status === "READ") {
      return "✓✓";
    }

    if (msg.status === "DELIVERED") {
      return "✓✓";
    }

    return "✓";
  }

  function getLastMessageStatus(user: ChatUser) {
    if (
      user.last_message_sender !== currentUser?.username ||
      !user.last_message_status
    ) {
      return null;
    }

    if (
      user.last_message_status === "DELIVERED" ||
      user.last_message_status === "READ"
    ) {
      return "✓✓";
    }

    return "✓";
  }

  function isLastMessageRead(user: ChatUser) {
    return (
      user.last_message_sender === currentUser?.username &&
      user.last_message_status === "READ"
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-0 text-gray-900 md:p-6">

      <div className="mx-auto flex h-[100dvh] w-full overflow-hidden bg-white shadow-lg md:h-[90vh] md:max-w-6xl md:rounded-xl md:border">

        <div
          className={`${
            showChat ? "hidden md:flex" : "flex"
          } w-full flex-col border-r md:w-[360px]`}
        >

          <div className="border-b bg-gray-50 px-4 py-3">

            <div className="flex items-center justify-between">

              <div>
                <h1 className="text-xl font-bold">
                  MiniChat
                </h1>

                {currentUser && (
                  <div className="text-sm text-gray-500">
                    {currentUser.username}
                  </div>
                )}
              </div>

              <button
                onClick={logout}
                className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
              >
                Logout
              </button>

            </div>

          </div>

          <div className="border-b p-3">

            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search users..."
              className="w-full rounded-lg bg-gray-100 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />

          </div>

          <div className="flex-1 overflow-y-auto">

            {users.length > 0 && (
              <div className="px-4 py-3 text-xs font-semibold tracking-wide text-gray-500">
                CHATS
              </div>
            )}

            {users.filter((user) =>
              user.username
                .toLowerCase()
                .includes(searchText.toLowerCase())
            ).length === 0 ? (

              <div className="px-4 py-8 text-center text-sm text-gray-500">
                No users found
              </div>

            ) : (

              users
                .filter((user) =>
                  user.username
                    .toLowerCase()
                    .includes(searchText.toLowerCase())
                )
                .map((user) => {

                  const lastMessageStatus =
                    getLastMessageStatus(user);

                  const lastMessageRead =
                    isLastMessageRead(user);

                  return (

                    <button
                      key={user.id}
                      onClick={() => selectUser(user)}
                      className={`flex w-full items-center gap-3 border-b px-4 py-4 text-left transition hover:bg-gray-50 ${
                        selectedUser?.id === user.id
                          ? "bg-blue-50"
                          : "bg-white"
                      }`}
                    >

                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-200 text-lg font-semibold">

                        {user.username.charAt(0).toUpperCase()}

                        <span
                          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
                            user.online
                              ? "bg-green-500"
                              : "bg-gray-400"
                          }`}
                        />

                      </div>

                      <div className="min-w-0 flex-1">

                        <div className="flex items-center justify-between gap-2">

                          <span className="truncate font-semibold">
                            {user.username}
                          </span>

                          {user.last_message_time && (
                            <span className="shrink-0 text-xs text-gray-400">
                              {formatTime(user.last_message_time)}
                            </span>
                          )}

                        </div>

                        <div className="mt-1 flex items-center gap-1">

                          {typingUsers[user.username] ? (

                            <span className="truncate text-sm font-medium text-blue-500">
                              typing...
                            </span>

                          ) : (

                            <span className="flex min-w-0 items-center text-sm text-gray-500">

                              {lastMessageStatus && (
                                <span
                                  className={`mr-1 shrink-0 font-bold ${
                                    lastMessageRead
                                      ? "text-blue-500"
                                      : "text-gray-500"
                                  }`}
                                >
                                  {lastMessageStatus}
                                </span>
                              )}

                              {user.last_message_sender ===
                                currentUser?.username && (
                                <span className="mr-1 shrink-0">
                                  You:
                                </span>
                              )}

                              <span className="truncate">
                                {formatLastMessage(
                                  user.last_message
                                )}
                              </span>

                            </span>

                          )}

                        </div>

                      </div>

                    </button>

                  );
                })

            )}

          </div>

        </div>

        <div
          className={`${
            showChat ? "flex" : "hidden md:flex"
          } min-w-0 flex-1 flex-col`}
        >

          <div className="border-b bg-gray-50 px-3 py-3 md:px-4">

            <div className="flex items-center justify-between gap-3">

              <div className="flex min-w-0 items-center gap-3">

                <button
                  onClick={goBackToUsers}
                  className="rounded-lg px-2 py-1 text-xl hover:bg-gray-200 md:hidden"
                >
                  ←
                </button>

                {selectedUser ? (

                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 font-semibold">

                    {selectedUser.username.charAt(0).toUpperCase()}

                    <span
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
                        selectedUser.online
                          ? "bg-green-500"
                          : "bg-gray-400"
                      }`}
                    />

                  </div>

                ) : null}

                <div className="min-w-0">

                  <h2 className="truncate text-lg font-semibold">
                    {selectedUser
                      ? selectedUser.username
                      : "Select a chat"}
                  </h2>

                  {selectedUser ? (

                    <div className="text-xs text-gray-500">
                      {typingUser
                        ? "typing..."
                        : selectedUser.online
                        ? "online"
                        : "offline"}
                    </div>

                  ) : (

                    <div className="text-xs text-gray-500">
                      Choose a user to start chatting
                    </div>

                  )}

                </div>

              </div>

              <div className="flex shrink-0 items-center gap-2">

                <span
                  className={`hidden text-xs font-medium sm:inline ${
                    connected
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {connected ? "Connected" : "Disconnected"}
                </span>

                <button
                  onClick={logout}
                  className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
                >
                  Logout
                </button>

              </div>

            </div>

          </div>

          <div
            className="flex-1 overflow-y-auto bg-[#efeae2] p-3 md:p-5"
            onScroll={handleScroll}
          >

            {!selectedUser ? (

              <div className="flex h-full flex-col items-center justify-center text-center">

                <div className="mb-3 text-5xl">
                  💬
                </div>

                <div className="text-lg font-semibold text-gray-600">
                  MiniChat
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Select a user from the left to start chatting
                </div>

              </div>

            ) : messages.length === 0 ? (

              <div className="flex h-full items-center justify-center text-center text-gray-500">
                No messages yet
              </div>

            ) : (

              <div className="flex flex-col gap-2">

                {messages.map((msg) => {

                  const isMine =
                    msg.sender === currentUser?.username;

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
                        className={`max-w-[85%] rounded-lg px-3 py-2 shadow-sm md:max-w-[70%] ${
                          isMine
                            ? "bg-[#d9fdd3] text-gray-900"
                            : "bg-white text-gray-900"
                        }`}
                      >

                        <div className="break-words text-sm">
                          {msg.content}
                        </div>

                        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-gray-500">

                          <span>
                            {formatTime(msg.created_at)}
                          </span>

                          {isMine && (

                            <span
                              className={`font-bold ${
                                msg.status === "READ"
                                  ? "text-blue-500"
                                  : "text-gray-500"
                              }`}
                            >
                              {getMessageStatus(msg)}
                            </span>

                          )}

                        </div>

                      </div>

                    </div>

                  );

                })}

                <div ref={messagesEndRef} />

              </div>

            )}

          </div>

          {selectedUser && (

            <div className="border-t bg-gray-50 p-3 md:p-4">

              {typingUser && (

                <div className="mb-2 text-xs text-gray-500">
                  {typingUser} is typing...
                </div>

              )}

              <div className="flex items-center gap-2">

                <input
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);

                    if (event.target.value.trim() !== "") {
                      startTyping();
                    } else {
                      stopTyping();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      sendMessage();
                    }
                  }}
                  disabled={!currentUser || !selectedUser}
                  placeholder={`Message ${selectedUser.username}...`}
                  className="min-w-0 flex-1 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
                />

                <button
                  onClick={sendMessage}
                  disabled={!currentUser || !selectedUser}
                  className="shrink-0 rounded-full bg-blue-500 px-5 py-3 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  Send
                </button>

              </div>

            </div>

          )}

        </div>

      </div>

    </main>
  );
}

