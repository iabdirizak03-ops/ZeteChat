import OpenAI from "openai";

export const runtime = "nodejs";

const MAX_BODY_CHARS = 100_000;
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 8000;
const MAX_TOTAL_CHARS = 50_000;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function validateMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null;

  const messages: ChatMessage[] = [];
  let totalChars = 0;

  for (const item of value) {
    if (!item || typeof item !== "object") return null;

    const candidate = item as Record<string, unknown>;
    if (candidate.role !== "user" && candidate.role !== "assistant") return null;
    if (typeof candidate.content !== "string") return null;

    const content = candidate.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) return null;

    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) return null;

    messages.push({ role: candidate.role, content });
  }

  if (messages.at(-1)?.role !== "user") return null;
  return messages;
}

function providerStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function providerError(error: unknown) {
  const status = providerStatus(error);

  if (status === 401 || status === 403) {
    return Response.json(
      { error: "The server AI credentials are invalid or do not have access to this model." },
      { status: 503 },
    );
  }

  if (status === 429) {
    return Response.json(
      { error: "The AI provider rate limit or spend limit was reached. Try again later." },
      { status: 429 },
    );
  }

  if (status !== null && status >= 400 && status < 500) {
    return Response.json(
      { error: "The AI provider rejected this request. Check the configured model and account access." },
      { status: 502 },
    );
  }

  return Response.json(
    { error: "The AI provider is temporarily unavailable." },
    { status: 502 },
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";

  if (!apiKey) {
    return Response.json(
      { error: "Server configuration is missing OPENAI_API_KEY." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_CHARS) {
    return Response.json({ error: "Conversation payload is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const candidate = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const messages = validateMessages(candidate?.messages);

  if (!messages) {
    return Response.json({ error: "Invalid conversation payload." }, { status: 400 });
  }

  const client = new OpenAI({ apiKey });

  try {
    const upstream = await client.responses.create(
      {
        model,
        instructions:
          "You are ZeteChat, a concise and helpful AI assistant. Be accurate, clear, and honest about uncertainty.",
        input: messages,
        stream: true,
      },
      { signal: request.signal },
    );

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of upstream) {
            if (event.type === "response.output_text.delta") {
              controller.enqueue(encoder.encode(event.delta));
            }
          }

          controller.close();
        } catch (error) {
          if (request.signal.aborted) {
            controller.close();
            return;
          }

          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("ZeteChat upstream request failed", error);
    return providerError(error);
  }
}
