"use client";

import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

const STORAGE_KEY = "zetechat:v0.2:chats";
const MAX_MODEL_MESSAGES = 24;
const MAX_MODEL_CHARS = 45_000;
const MAX_STORED_CHATS = 30;

function createId() {
  return crypto.randomUUID();
}

function createChat(): Chat {
  return {
    id: createId(),
    title: "New chat",
    messages: [],
    updatedAt: Date.now(),
  };
}

function deriveTitle(content: string) {
  const clean = content.replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 52 ? `${clean.slice(0, 49)}...` : clean;
}

function restoreChats(raw: string | null): Chat[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .slice(0, MAX_STORED_CHATS)
      .flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const item = candidate as Record<string, unknown>;
        if (typeof item.id !== "string" || typeof item.title !== "string") return [];
        if (!Array.isArray(item.messages) || typeof item.updatedAt !== "number") return [];

        const messages: Message[] = item.messages.flatMap((message) => {
          if (!message || typeof message !== "object") return [];
          const value = message as Record<string, unknown>;
          if (typeof value.id !== "string" || typeof value.content !== "string") return [];
          if (value.role !== "user" && value.role !== "assistant") return [];
          if (!value.content) return [];
          return [{ id: value.id, role: value.role, content: value.content }];
        });

        return [{ id: item.id, title: item.title.slice(0, 80), messages, updatedAt: item.updatedAt }];
      });
  } catch {
    return [];
  }
}

function buildModelContext(messages: Message[]) {
  const selected: Array<{ role: "user" | "assistant"; content: string }> = [];
  let totalChars = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const content = message.content.trim();
    if (!content) continue;
    if (selected.length >= MAX_MODEL_MESSAGES) break;
    if (totalChars + content.length > MAX_MODEL_CHARS) break;

    selected.unshift({ role: message.role, content });
    totalChars += content.length;
  }

  return selected;
}

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    return extractText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function MarkdownMessage({ content }: { content: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyCode(text: string) {
    if (!navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.setTimeout(() => {
        setCopied((current) => (current === text ? null : current));
      }, 1200);
    } catch {
      setCopied(null);
    }
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          );
        },
        pre({ children }) {
          const text = extractText(children).replace(/\n$/, "");
          return (
            <div className="codeBlock">
              <div className="codeBlockBar">
                <span>Code</span>
                <button type="button" onClick={() => void copyCode(text)}>
                  {copied === text ? "Copied" : "Copy"}
                </button>
              </div>
              <pre>{children}</pre>
            </div>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const messages = activeChat?.messages ?? [];
  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => b.updatedAt - a.updatedAt),
    [chats],
  );

  useEffect(() => {
    const restored = restoreChats(localStorage.getItem(STORAGE_KEY));
    const next = restored.length > 0 ? restored : [createChat()];
    setChats(next);
    setActiveChatId(next[0].id);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || isGenerating) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, MAX_STORED_CHATS)));
      setStorageWarning(null);
    } catch {
      setStorageWarning("Conversation history could not be saved in this browser.");
    }
  }, [chats, hydrated, isGenerating]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 42), 180)}px`;
  }, [input]);

  function updateChat(chatId: string, updater: (chat: Chat) => Chat) {
    setChats((current) => current.map((chat) => (chat.id === chatId ? updater(chat) : chat)));
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();

    const content = input.trim();
    if (!content || isGenerating || !activeChat) return;

    const chatId = activeChat.id;
    const userMessage: Message = { id: createId(), role: "user", content };
    const assistantId = createId();
    const nextMessages = [...activeChat.messages, userMessage];
    const requestMessages = buildModelContext(nextMessages);

    updateChat(chatId, (chat) => ({
      ...chat,
      title: chat.messages.length === 0 ? deriveTitle(content) : chat.title,
      messages: [...chat.messages, userMessage, { id: assistantId, role: "assistant", content: "" }],
      updatedAt: Date.now(),
    }));

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
        throw new Error(payload?.error || `The request failed with status ${response.status}.`);
      }

      if (!response.body) throw new Error("The response stream was empty.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        updateChat(chatId, (chat) => ({
          ...chat,
          messages: chat.messages.map((message) =>
            message.id === assistantId
              ? { ...message, content: message.content + chunk }
              : message,
          ),
        }));
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        updateChat(chatId, (chat) => ({
          ...chat,
          messages: chat.messages.filter(
            (message) => message.id !== assistantId || message.content.length > 0,
          ),
        }));
      } else {
        const message = caught instanceof Error ? caught.message : "Something went wrong.";
        setError(message);
        updateChat(chatId, (chat) => ({
          ...chat,
          messages: chat.messages.filter((item) => item.id !== assistantId),
        }));
      }
    } finally {
      updateChat(chatId, (chat) => ({ ...chat, updatedAt: Date.now() }));
      abortRef.current = null;
      setIsGenerating(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function newChat() {
    abortRef.current?.abort();
    const fresh = createChat();
    setChats((current) => [fresh, ...current.filter((chat) => chat.messages.length > 0)]);
    setActiveChatId(fresh.id);
    setInput("");
    setError(null);
    setEditingChatId(null);
    setSidebarOpen(false);
  }

  function selectChat(chatId: string) {
    abortRef.current?.abort();
    setActiveChatId(chatId);
    setInput("");
    setError(null);
    setEditingChatId(null);
    setSidebarOpen(false);
  }

  function startRename(chat: Chat) {
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  }

  function commitRename(chatId: string) {
    const title = editingTitle.replace(/\s+/g, " ").trim().slice(0, 64);
    if (title) {
      updateChat(chatId, (chat) => ({ ...chat, title, updatedAt: Date.now() }));
    }
    setEditingChatId(null);
    setEditingTitle("");
  }

  function deleteChat(chatId: string) {
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return;
    if (!window.confirm(`Delete “${chat.title}”? This only removes the local browser copy.`)) return;

    const remaining = chats.filter((item) => item.id !== chatId);
    const next = remaining.length > 0 ? remaining : [createChat()];
    setChats(next);
    if (activeChatId === chatId) setActiveChatId(next[0].id);
    setEditingChatId(null);
    setError(null);
  }

  return (
    <main className="appShell">
      {sidebarOpen ? (
        <button
          className="sidebarBackdrop"
          type="button"
          aria-label="Close chat history"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Chat history">
        <div className="sidebarTop">
          <div className="mobileSidebarHeader">
            <span className="wordmark">zetemora</span>
            <button className="textButton" type="button" onClick={() => setSidebarOpen(false)}>
              Close
            </button>
          </div>

          <div className="brandBlock">
            <span className="wordmark">zetemora</span>
            <span className="productName">ZeteChat</span>
          </div>

          <button className="newChatButton" type="button" onClick={newChat}>
            <span aria-hidden="true">+</span>
            New chat
          </button>

          <nav className="sidebarNav" aria-label="Conversations">
            <div className="navLabel">Chats</div>
            <div className="chatList">
              {hydrated ? (
                sortedChats.map((chat) => {
                  const active = chat.id === activeChatId;
                  const editing = editingChatId === chat.id;

                  return (
                    <div className={`chatRow ${active ? "active" : ""}`} key={chat.id}>
                      {editing ? (
                        <input
                          className="renameInput"
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onBlur={() => commitRename(chat.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitRename(chat.id);
                            if (event.key === "Escape") setEditingChatId(null);
                          }}
                          maxLength={64}
                          autoFocus
                          aria-label="Rename chat"
                        />
                      ) : (
                        <button
                          className="chatSelect"
                          type="button"
                          onClick={() => selectChat(chat.id)}
                          aria-current={active ? "page" : undefined}
                          disabled={isGenerating && !active}
                        >
                          {chat.title}
                        </button>
                      )}

                      {!editing ? (
                        <div className="chatActions">
                          <button
                            type="button"
                            aria-label={`Rename ${chat.title}`}
                            title="Rename"
                            onClick={() => startRename(chat)}
                            disabled={isGenerating}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${chat.title}`}
                            title="Delete"
                            onClick={() => deleteChat(chat.id)}
                            disabled={isGenerating}
                          >
                            ×
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <span className="loadingChats">Loading chats...</span>
              )}
            </div>
          </nav>
        </div>

        <div className="sidebarFooter">
          <span>Conversation history is stored in this browser.</span>
        </div>
      </aside>

      <section className="chatPanel">
        <header className="chatHeader">
          <div className="headerIdentity">
            <button
              className="menuButton"
              type="button"
              aria-label="Open chat history"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              Menu
            </button>
            <div>
              <span className="mobileWordmark">zetemora</span>
              <h1>{activeChat?.title || "ZeteChat"}</h1>
            </div>
          </div>
          <span className="status">v0.2</span>
        </header>

        <section className="conversation" aria-live="polite" aria-busy={isGenerating}>
          {messages.length === 0 ? (
            <div className="emptyState">
              <span className="emptyWordmark">zetemora</span>
              <h2>What can I help with?</h2>
              <p>Conversation history is saved locally in this browser.</p>
            </div>
          ) : (
            <div className="messages">
              {messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <span className="role">{message.role === "user" ? "You" : "ZeteChat"}</span>
                  <div className="messageText">
                    {message.role === "assistant" && message.content ? (
                      <MarkdownMessage content={message.content} />
                    ) : message.content ? (
                      message.content
                    ) : isGenerating ? (
                      <span className="typingDots" aria-label="ZeteChat is responding">
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <div className="composerArea">
          {storageWarning ? (
            <div className="notice warning" role="status">
              <span>{storageWarning}</span>
              <button type="button" onClick={() => setStorageWarning(null)}>Dismiss</button>
            </div>
          ) : null}
          {error ? (
            <div className="notice error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}>Dismiss</button>
            </div>
          ) : null}

          <form className="composer" onSubmit={sendMessage}>
            <label className="srOnly" htmlFor="message-input">Message ZeteChat</label>
            <textarea
              id="message-input"
              ref={inputRef}
              placeholder="Message ZeteChat"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={8000}
              disabled={isGenerating || !hydrated}
              aria-describedby="composer-hint"
            />
            {isGenerating ? (
              <button
                className="sendButton"
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="Stop generating"
              >
                Stop
              </button>
            ) : (
              <button className="sendButton" type="submit" disabled={!input.trim() || !hydrated}>
                Send
              </button>
            )}
          </form>
          <p className="hint" id="composer-hint">Enter to send. Shift + Enter for a new line.</p>
        </div>
      </section>
    </main>
  );
}
