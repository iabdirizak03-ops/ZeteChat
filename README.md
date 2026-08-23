# ZeteChat

A small, readable AI chat starter built by **Zetemora**.

ZeteChat is intentionally narrow. It provides a clean chat interface, a server-side AI route, streaming responses, basic request validation, and a simple foundation developers can understand and change.

## Status

**v0.1 starter**

The repository now contains a runnable application. It is still early software and should not be treated as a production-ready hosted service without additional controls.

## What is included

- Next.js + TypeScript
- Minimal responsive chat interface
- Streaming model responses
- Server-side OpenAI API key handling
- Conversation input validation and size limits
- Stop generation and new chat controls
- No database, authentication, billing, tracking, or hidden infrastructure
- CI typecheck and production build verification

## Quick start

Requirements:

- Node.js 22 or newer
- An OpenAI API key

```bash
git clone https://github.com/iabdirizak03-ops/ZeteChat.git
cd ZeteChat
npm install
cp .env.example .env.local
```

Add your key to `.env.local`:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.6-luna
```

Then run:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Architecture

The browser sends the current conversation to `POST /api/chat`. The server validates the payload and calls the model provider. The provider API key is read only from the server environment and is never intentionally sent to the browser.

The current provider implementation uses the OpenAI Responses API. If you want another provider, replace the implementation in `app/api/chat/route.ts` while keeping the browser contract small.

## Security notes

Never commit `.env.local`, API keys, database credentials, service-role keys, access tokens, or private user data.

The included API route validates message roles, message sizes, total conversation size, and requires the final message to come from the user. These checks are useful boundaries, not a complete abuse-prevention system.

If you deploy ZeteChat publicly with your own paid model key, add appropriate authentication, rate limiting, spend controls, monitoring, and abuse protections first. Otherwise strangers may be able to consume your API budget.

See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance.

## Contributing

Small, focused contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

ZeteChat is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 Zetemora.

## About

ZeteChat is a public developer project by **Zetemora**.

Build useful things. Keep them understandable.
