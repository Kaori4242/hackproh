import { startTransition, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { CHAT_API_URL } from "../lib/config";
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
      text: "Ask about operations, marketing, staffing, and uploaded business files. Weather context is available when you ask for it."
    }
  ]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        text: "Ask about operations, marketing, staffing, and uploaded business files. Weather context is available when you ask for it."
      }
    ]);
    setDraft("");
    setError(null);
  }, [business?.id]);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTo({
        top: streamRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, isSending]);

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

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const form = event.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  }

  return (
    <section className="chat-panel">
      <div className="chat-panel-head">
        <div>
          <p className="eyebrow">SME Copilot</p>
          <h2>Gemini 2.5 Pro copilot</h2>
        </div>
      </div>

      <div className="chat-stream" ref={streamRef}>
        {!business ? (
          <section className="chat-empty-state">
            <h3>Create a project first</h3>
            <p>Open the Projects tab, complete the 3-step setup, then start chatting with your indexed business context.</p>
          </section>
        ) : null}

        {messages.map((entry, index) => (
          <article className={`message-row message-row-${entry.role}`} key={`${entry.role}-${index}`}>
            <article className={`message message-${entry.role}`}>
              <p>{entry.text}</p>
            </article>
          </article>
        ))}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <form className="chat-form" onSubmit={handleSend}>
        <div className="composer-shell">
          <textarea
            disabled={!business || isSending}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={
              business
                ? "Message SME Copilot..."
                : "Create a project first."
            }
          />
          <div className="composer-actions">
            <small>{business ? "Uses project profile, indexed files, and links. Weather is used only when asked." : "No active project selected."}</small>
            <button className="composer-send" disabled={!business || isSending || !draft.trim()} type="submit">
              {isSending ? "Thinking..." : "Send"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
