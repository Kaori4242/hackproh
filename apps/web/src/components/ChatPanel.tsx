import { startTransition, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CHAT_API_URL } from "../lib/config";
import type { BusinessRecord, ChatMessage } from "../lib/types";

type ChatPanelProps = {
  business?: BusinessRecord;
  user?: User | null;
  onCreateProjectClick?: () => void;
};

export function ChatPanel({ business, user, onCreateProjectClick }: ChatPanelProps) {
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
      <div className="chat-stream" ref={streamRef}>
        {!business ? (
          <section className="chat-empty-state">
            <h3>Create a project first</h3>
            <p>Open the Projects tab, complete the 3-step setup, then start chatting with your indexed business context.</p>
            <button className="primary-button chat-empty-cta" onClick={onCreateProjectClick} type="button">
              Create project
            </button>
          </section>
        ) : null}

        {messages.map((entry, index) => (
          <article className={`message-row message-row-${entry.role}`} key={`${entry.role}-${index}`}>
            <article className={`message message-${entry.role}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.text}</ReactMarkdown>
            </article>
          </article>
        ))}
        {isSending && (
          <article className="message-row message-row-assistant">
            <article className="message message-assistant">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </article>
          </article>
        )}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <form className="chat-form" onSubmit={handleSend}>
        <div className="composer-shell">
          <textarea
            disabled={!business || isSending}
            rows={1}
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
            <button className="composer-send" disabled={!business || isSending || !draft.trim()} type="submit" aria-label="Send">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
            </button>
          </div>
        </div>
        <p className="chat-disclaimer">
          {business ? "Uses project profile, indexed files, and links. Weather is used only when asked." : "No active project selected."}
        </p>
      </form>
    </section>
  );
}
