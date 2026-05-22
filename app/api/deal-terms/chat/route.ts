import { NextResponse } from "next/server";
import {
  DEAL_TERMS_SYSTEM_PROMPT,
  generateDealTermsFromConversation,
  getAssistantReply,
  isConversationComplete,
  type ChatMessage,
} from "@/lib/dealTermsCapture";

/**
 * Anthropic's Messages API requires the messages array to:
 *   - start with a `user` turn (no leading assistant)
 *   - alternate user/assistant
 *   - carry the system prompt at the top level, NOT inside messages
 *
 * We strip the leading assistant opening greeting and forward every other turn
 * verbatim so the model sees the full conversation history on every request.
 */
function toAnthropicMessages(
  messages: ChatMessage[],
): { role: "user" | "assistant"; content: string }[] {
  const firstUserIdx = messages.findIndex((m) => m.role === "user");
  if (firstUserIdx === -1) return [];
  return messages.slice(firstUserIdx).map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

async function getLlmReply(
  messages: ChatMessage[],
): Promise<{ message: string; complete: boolean } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const anthropicMessages = toAnthropicMessages(messages);
  if (anthropicMessages.length === 0) return null;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
        max_tokens: 1024,
        temperature: 0.2,
        system: DEAL_TERMS_SYSTEM_PROMPT,
        messages: anthropicMessages,
      }),
    });
  } catch (err) {
    console.error("Anthropic request failed:", err);
    return null;
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Anthropic API error:", res.status, errText);
    return null;
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const block = data.content?.find((c) => c.type === "text");
  const message = block?.text?.trim();
  if (!message) return null;

  return {
    message,
    complete: isConversationComplete(messages),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = (body.messages ?? []) as ChatMessage[];
    const action = body.action as string | undefined;

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { error: "messages must be an array" },
        { status: 400 },
      );
    }

    if (action === "generate") {
      const terms = generateDealTermsFromConversation(messages);
      return NextResponse.json({ terms });
    }

    const llmReply = await getLlmReply(messages);
    const { message, complete } = llmReply ?? getAssistantReply(messages);
    return NextResponse.json({ message, complete });
  } catch (err) {
    console.error("/api/deal-terms/chat error:", err);
    return NextResponse.json(
      { error: "Failed to process deal terms chat" },
      { status: 500 },
    );
  }
}
