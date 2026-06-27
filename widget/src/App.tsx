import { useEffect, useRef, useState, type FormEvent } from "react";

type ResponseType = "text" | "product_card" | "order_card" | "escalation";

interface ProductMeta {
  name: string;
  price: string;
  stock_status: "instock" | "outofstock" | "onbackorder" | string;
  stock_quantity?: number | null;
  wc_url: string;
  image_url?: string;
}

interface OrderMeta {
  order_id: string;
  status: string;
  items: string[];
  total: string;
}

interface ApiResponse {
  answer: string;
  confidence: number;
  escalated: boolean;
  escalation_reason: string | null;
  session_id: string;
  response_type: ResponseType;
  metadata: ProductMeta | OrderMeta | null;
}

interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  response_type?: ResponseType;
  metadata?: ProductMeta | OrderMeta | null;
  error?: boolean;
}

const STORAGE_KEY = "woocs_chat_state_v1";
const QUICK_REPLIES = ["Check my order", "Returns & refunds", "Browse products"];

declare global {
  interface Window {
    WooCS?: { store_id: string; api_url: string; store_name?: string };
  }
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function App() {
  const [config, setConfig] = useState<{ store_id: string; api_url: string; store_name: string } | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [slowHint, setSlowHint] = useState<"none" | "slow" | "timeout">("none");
  const [lastUserMessage, setLastUserMessage] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Init config + restore state
  useEffect(() => {
    const wc = typeof window !== "undefined" ? window.WooCS : undefined;
    const cfg = {
      store_id: wc?.store_id ?? "demo-store",
      api_url: wc?.api_url ?? "http://localhost:8000",
      store_name: wc?.store_name ?? "Store assistant",
    };
    setConfig(cfg);

    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { sessionId: string; messages: Message[]; isOpen?: boolean };
        setSessionId(parsed.sessionId || uuid());
        setMessages(parsed.messages || []);
        if (parsed.isOpen !== undefined) setIsOpen(parsed.isOpen);
        return;
      }
    } catch {
      /* ignore */
    }
    setSessionId(uuid());
    setMessages([
      {
        id: uuid(),
        role: "bot",
        text: `Hi! I'm your ${cfg.store_name}. I can help you find products, check stock, or track your order.`,
        response_type: "text",
      },
    ]);
  }, []);

  // Persist
  useEffect(() => {
    if (!sessionId) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, messages, isOpen }));
    } catch {
      /* ignore */
    }
  }, [sessionId, messages, isOpen]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, isOpen]);

  // Focus input
  useEffect(() => {
    if (isOpen && !loading) inputRef.current?.focus();
  }, [isOpen, loading, messages.length]);

  async function sendMessage(text: string) {
    if (!config || !text.trim() || loading) return;
    const userMsg: Message = { id: uuid(), role: "user", text: text.trim() };
    setMessages((m) => [...m, userMsg]);
    setLastUserMessage(text.trim());
    setInput("");
    setLoading(true);
    setSlowHint("none");

    const slowTimer = setTimeout(() => setSlowHint("slow"), 8000);
    const timeoutTimer = setTimeout(() => setSlowHint("timeout"), 15000);
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 16000);

    try {
      const res = await fetch(`${config.api_url.replace(/\/$/, "")}/api/widget/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: config.store_id, session_id: sessionId, message: text.trim() }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ApiResponse;
      if (data.session_id && data.session_id !== sessionId) setSessionId(data.session_id);
      setMessages((m) => [
        ...m,
        {
          id: uuid(),
          role: "bot",
          text: data.answer,
          response_type: data.response_type,
          metadata: data.metadata,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { id: uuid(), role: "bot", text: "Something went wrong. Please try again.", error: true, response_type: "text" },
      ]);
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
      clearTimeout(abortTimer);
      setLoading(false);
      setSlowHint("none");
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleEscalate(accept: boolean) {
    setMessages((m) => [
      ...m,
      {
        id: uuid(),
        role: "bot",
        text: accept ? "Got it — a team member will reach out shortly." : "No problem. Let me know if anything else comes up.",
        response_type: "text",
      },
    ]);
  }

  function resetChat() {
    const newId = uuid();
    setSessionId(newId);
    setMessages([
      {
        id: uuid(),
        role: "bot",
        text: `Hi! I'm your ${config?.store_name ?? "Store assistant"}. How can I help today?`,
        response_type: "text",
      },
    ]);
  }

  if (!config) return null;

  // Render as full-screen app by default
  return (
    <div className="flex h-screen flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm">
            <BotIcon />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900 sm:text-base">{config.store_name}</h1>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Online
            </p>
          </div>
        </div>
        <button
          onClick={resetChat}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          New chat
        </button>
      </header>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        <div className="flex flex-col gap-4">
          {messages.map((m) => (
            <MessageRow key={m.id} message={m} onEscalate={handleEscalate} />
          ))}

          {loading && (
            <div className="flex items-end gap-2">
              <Avatar />
              <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
                {slowHint === "timeout" ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-slate-600">Taking too long — try again.</span>
                    <button
                      onClick={() => sendMessage(lastUserMessage)}
                      className="self-start rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      Retry
                    </button>
                  </div>
                ) : slowHint === "slow" ? (
                  <span className="text-sm text-slate-600">Still looking…</span>
                ) : (
                  <TypingDots />
                )}
              </div>
            </div>
          )}

          {!loading && messages.length > 0 && messages[messages.length - 1].role === "bot" && (
            <div className="ml-10 flex flex-wrap gap-2">
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 bg-white p-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Ask anything..."
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            <SendIcon />
          </button>
        </form>
        <p className="mt-2 text-center text-[10px] text-slate-400">Powered by WooCS.ai</p>
      </div>
    </div>
  );
}

function MessageRow({ message, onEscalate }: { message: Message; onEscalate: (a: boolean) => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2 text-[13px] leading-relaxed text-white shadow-sm animate-in fade-in slide-in-from-bottom-2">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 animate-in fade-in slide-in-from-bottom-2">
      <Avatar />
      <div className="flex max-w-[85%] flex-col gap-2">
        <div
          className={`rounded-2xl rounded-bl-sm px-3.5 py-2 text-[13px] leading-relaxed shadow-sm ring-1 ${
            message.error
              ? "bg-red-50 text-red-700 ring-red-200"
              : "bg-white text-slate-800 ring-slate-200"
          }`}
        >
          {message.text}
        </div>
        {message.response_type === "product_card" && message.metadata && (
          <ProductCard meta={message.metadata as ProductMeta} />
        )}
        {message.response_type === "order_card" && message.metadata && (
          <OrderCard meta={message.metadata as OrderMeta} />
        )}
        {message.response_type === "escalation" && (
          <EscalationCard onEscalate={onEscalate} />
        )}
      </div>
    </div>
  );
}

function ProductCard({ meta }: { meta: ProductMeta }) {
  const stock =
    meta.stock_status === "instock"
      ? { label: meta.stock_quantity != null ? `In stock (${meta.stock_quantity})` : "In stock", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" }
      : meta.stock_status === "outofstock"
      ? { label: "Out of stock", cls: "bg-red-50 text-red-700 ring-red-200" }
      : { label: "Backorder", cls: "bg-amber-50 text-amber-700 ring-amber-200" };
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      {meta.image_url && (
        <img src={meta.image_url} alt={meta.name} className="h-28 w-full object-cover" />
      )}
      <div className="p-3">
        <div className="text-[13px] font-semibold leading-tight text-slate-900">{meta.name}</div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-bold text-slate-900">${meta.price}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${stock.cls}`}>{stock.label}</span>
        </div>
        <a
          href={meta.wc_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-center text-[11px] font-medium text-white transition hover:bg-indigo-700"
        >
          View product
        </a>
      </div>
    </div>
  );
}

function OrderCard({ meta }: { meta: OrderMeta }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <div className="text-[13px] font-semibold text-slate-900">Order #{meta.order_id}</div>
      <div className="mt-2.5 space-y-2 text-[11px]">
        <div className="flex justify-between border-b border-slate-100 pb-1.5">
          <span className="text-slate-500">Status</span>
          <span className="font-medium text-indigo-600">{meta.status}</span>
        </div>
        <div className="border-b border-slate-100 pb-1.5">
          <div className="mb-1 text-slate-500">Items</div>
          <ul className="space-y-0.5 text-slate-800">
            {meta.items.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        </div>
        <div className="flex justify-between pt-1">
          <span className="text-slate-500">Total</span>
          <span className="font-semibold text-slate-900">${meta.total}</span>
        </div>
      </div>
    </div>
  );
}

function EscalationCard({ onEscalate }: { onEscalate: (a: boolean) => void }) {
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
      <div className="flex items-start gap-2">
        <span className="text-sm text-amber-600">⚠</span>
        <div className="flex-1">
          <div className="text-[12px] leading-tight text-amber-900">Want me to connect you with the team?</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              onClick={() => {
                onEscalate(true);
                setDone(true);
              }}
              className="rounded-md bg-amber-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-amber-700"
            >
              Talk to someone
            </button>
            <button
              onClick={() => {
                onEscalate(false);
                setDone(true);
              }}
              className="rounded-md bg-white px-2.5 py-1.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-50"
            >
              No thanks
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm">
      <BotIcon small />
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
    </div>
  );
}

function BotIcon({ small = false }: { small?: boolean }) {
  const s = small ? 14 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="3" />
      <path d="M12 4v4" />
      <circle cx="9" cy="14" r="1.5" />
      <circle cx="15" cy="14" r="1.5" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  );
}
