"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const API_URL = process.env.NEXT_PUBLIC_API_URL;

    if (!API_URL) {
      console.error("NEXT_PUBLIC_API_URL is not defined");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      console.log(data);

      if (data.message === "Login successful") {
        localStorage.setItem("user", JSON.stringify(data));
        router.push("/");
      }
    } catch (error) {
      console.error("Login failed:", error);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">
          MiniChat Login
        </h1>

        <form
          onSubmit={handleLogin}
          className="space-y-4"
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border px-4 py-3 text-gray-900"
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border px-4 py-3 text-gray-900"
            required
          />

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-500 py-3 font-medium text-white hover:bg-blue-600"
          >
            Login
          </button>
        </form>

        <button
          onClick={() => router.push("/signup")}
          className="mt-4 w-full text-sm text-blue-500 hover:underline"
        >
          Don't have an account? Sign up
        </button>
      </div>
    </main>
  );
}