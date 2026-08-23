"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function createId() {
  return crypto.randomUUID();
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();

    const content = input.trim();
    if (!content || isGenerating) return;

    const userMessage: Message = { id: createId(), role: "user", content };
    const assistantId = createId();
    const requestMessages = [...messages, userMessage].map(({ role, content }) => ({ role, content }));

    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setInput("");
    setError(null);
    setIsGenerating(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: requestMessages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "The request failed.");
      }

      if (!response.body) throw new Error("The response stream was empty.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, content: message.content + chunk }
              : message,
          ),
        );
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setMessages((current) =>
          current.filter((message) => message.id !== assistantId || message.content.length > 0),
        );
      } else {
        const message = caught instanceof Error ? caught.message : "Something went wrong.";
        setError(message);
        setMessages((current) => current.filter((item) => item.id !== assistantId));
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function newChat() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setError(null);
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="sidebarTop">
          <div className="brandBlock">
            <span className="wordmark">zetemora</span>
            <span className="productName">ZeteChat</span>
          </div>

          <button className="newChatButton" type="button" onClick={newChat}>
            <span aria-hidden="true">+</span>
            New chat
          </button>

          <nav className="sidebarNav" aria-label="Chat navigation">
            <div className="navLabel">Chat</div>
            <div className="navItem active" aria-current="page">
              Current conversation
            </div>
          </nav>
        </div>

        <div className="sidebarFooter">
          <span>Open-source AI chat starter</span>
        </div>
      </aside>

      <section className="chatPanel">
        <header className="chatHeader">
          <div>
            <span className="mobileWordmark">zetemora</span>
            <h1>ZeteChat</h1>
          </div>
          <span className="status">AI chat</span>
        </header>

        <section className="conversation" aria-live="polite">
          {messages.length === 0 ? (
            <div className="emptyState">
              <span className="emptyWordmark">zetemora</span>
              <h2>What can I help with?</h2>
              <p>A clean AI chat starter with server-side API access.</p>
            </div>
          ) : (
            <div className="messages">
              {messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <span className="role">{message.role === "user" ? "You" : "ZeteChat"}</span>
                  <div className="messageText">
                    {message.content || (isGenerating ? <span className="cursor" aria-label="Generating" /> : null)}
                  </div>
                </article>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <div className="composerArea">
          {error ? <p className="error" role="alert">{error}</p> : null}
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              aria-label="Message"
              placeholder="Message ZeteChat"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={8000}
              disabled={isGenerating}
            />
            {isGenerating ? (
              <button className="sendButton" type="button" onClick={() => abortRef.current?.abort()} aria-label="Stop generating">
                Stop
              </button>
            ) : (
              <button className="sendButton" type="submit" disabled={!input.trim()}>
                Send
              </button>
            )}
          </form>
          <p className="hint">Enter to send. Shift + Enter for a new line.</p>
        </div>
      </section>
    </main>
  );
}
