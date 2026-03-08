import { startTransition, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { CHAT_API_URL } from "../lib/config";
import { MALAYSIA_CITY_MAP } from "../lib/malaysiaCities";
import type { BusinessRecord, ChatMessage } from "../lib/types";

type ChatPanelProps = {
  business?: BusinessRecord;
  user?: User | null;
};

export function ChatPanel({ business, user }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Ask about operations, marketing, flood readiness, rain-sensitive demand, staffing, or uploaded business files."
    }
  ]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cityProfile = business ? MALAYSIA_CITY_MAP.get(business.city) : undefined;

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        text: "Ask about operations, marketing, flood readiness, rain-sensitive demand, staffing, or uploaded business files."
      }
    ]);
    setDraft("");
    setError(null);
  }, [business?.id]);

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!business || !user || !draft.trim()) {
      return;
    }

    const message = draft.trim();
    setDraft("");
    setIsSending(true);
    setError(null);

    const nextHistory = [...messages, { role: "user" as const, text: message }];
    startTransition(() => {
      setMessages(nextHistory);
    });

    try {
      const token = await user.getIdToken();
      const response = await fetch(`${CHAT_API_URL}/api/businesses/${business.id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message,
          history: messages
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as { answer: string };

      startTransition(() => {
        setMessages((current) => [...current, { role: "assistant", text: payload.answer }]);
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Chat request failed.");
      startTransition(() => {
        setMessages((current) => current.slice(0, -1));
      });
      setDraft(message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="panel chat-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI Chat</p>
          <h2>Gemini 2.5 Pro copilot</h2>
        </div>
        {cityProfile ? (
          <div className="chip">
            <span>{cityProfile.city}</span>
            <small>{cityProfile.floodSummary}</small>
          </div>
        ) : null}
      </div>

      <div className="chat-stream">
        {messages.map((entry, index) => (
          <article className={`message message-${entry.role}`} key={`${entry.role}-${index}`}>
            <span>{entry.role === "assistant" ? "Copilot" : "You"}</span>
            <p>{entry.text}</p>
          </article>
        ))}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <form className="chat-form" onSubmit={handleSend}>
        <textarea
          disabled={!business || isSending}
          rows={4}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            business
              ? "How should I adjust staffing next week if heavy rain disrupts walk-ins?"
              : "Create a business profile first."
          }
        />
        <button className="primary-button" disabled={!business || isSending || !draft.trim()} type="submit">
          {isSending ? "Thinking..." : "Send"}
        </button>
      </form>
    </section>
  );
}
