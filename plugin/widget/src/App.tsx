import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Clock, Maximize, MessageCircle, Minimize, Plus, X } from "lucide-react";

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
  context_used?: string;
}

interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  response_type?: ResponseType;
  metadata?: ProductMeta | OrderMeta | null;
  error?: boolean;
  confidence?: number;
  context_used?: string;
  latency?: number;
}

type PrechatField = { key: string; label: string; type: string; required: boolean };
type Config = { store_id: string; api_url: string; store_name: string; page_context: any; prechat_enabled: boolean; prechat_fields: PrechatField[]; primary_color: string };
type HistoryEntry = { sessionId: string; title: string; updatedAt: string };

const STORAGE_KEY = "woocs_chat_state_v1";
const HISTORY_KEY = "woocs_chat_history_v1";
const QUICK_REPLIES = ["Check my order", "Returns & refunds", "Browse products"];

function readHistory(): HistoryEntry[] {
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 20)));
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}

function mapMessages(messages: any[]): Message[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role === "assistant" ? "bot" : message.role,
    text: message.content,
    response_type: message.response_type,
    metadata: message.metadata,
    error: message.error,
    confidence: message.metadata?.confidence,
    context_used: message.metadata?.context_used,
  }));
}

async function fetchConversation(config: Config, sessionId: string) {
  const baseUrl = config.api_url.replace(/\/$/, "");
  const params = new URLSearchParams({ store_id: config.store_id, session_id: sessionId });
  const response = await fetch(`${baseUrl}/api/widget/history/?${params}`);
  if (!response.ok) return [];
  const data = await response.json();
  return mapMessages(data.messages || []);
}

declare global {
  interface Window {
    WooCS?: {
      store_id: string;
      api_url: string;
      store_name?: string;
      page_context?: { type: string; product_id?: number; product_name?: string };
    };
  }
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

declare global {
  interface Window {
    WooCS?: {
      store_id: string;
      api_url: string;
      store_name?: string;
      page_context?: { type: string; product_id?: number; product_name?: string };
      prechat_enabled?: boolean;
      prechat_fields?: Array<{ key: string; label: string; type: string; required: boolean }>;
      primary_color?: string;
    };
    WooCS_Test?: {
      resetWidget?: () => void;
      triggerMessage?: (msg: string) => void;
    };
  }
}


export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [slowHint, setSlowHint] = useState<"none" | "slow" | "timeout">("none");
  const [lastUserMessage, setLastUserMessage] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // Pre-chat state
  const [prechatDone, setPrechatDone] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<{ name?: string; email?: string; phone?: string }>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Init config + restore state
  useEffect(() => {
    const wc = typeof window !== "undefined" ? window.WooCS : undefined;
    if (!wc?.store_id) {
      console.warn("WooCS widget requires window.WooCS.store_id to be set.");
    }
    const pageContext = wc?.page_context ?? { type: "general" };
    const primaryColor = wc?.primary_color || "#2271b1";
    const cfg: Config = {
      store_id: wc?.store_id ?? "",
      api_url: wc?.api_url ?? "http://localhost:8000",
      store_name: wc?.store_name ?? "Store assistant",
      page_context: pageContext,
      prechat_enabled: wc?.prechat_enabled ?? false,
      prechat_fields: wc?.prechat_fields ?? [],
      primary_color: primaryColor,
    };
    setConfig(cfg);

    // Restore prechat info
    try {
      const pc = typeof window !== "undefined" ? window.localStorage.getItem("woocs_prechat_v1") : null;
      if (pc) {
        setCustomerInfo(JSON.parse(pc));
        setPrechatDone(true);
      }
    } catch { /* ignore */ }

    let savedSessionId = "";
    let savedIsOpen = false;
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { sessionId: string; isOpen?: boolean };
        savedSessionId = parsed.sessionId || "";
        savedIsOpen = parsed.isOpen ?? false;
      }
    } catch {
      /* ignore */
    }

    const currentSessionId = savedSessionId || uuid();
    setSessionId(currentSessionId);
    setIsOpen(savedIsOpen);
    setHistory(readHistory());

    // Fetch history from DB
    async function fetchHistory() {
      try {
        const storedMessages = await fetchConversation(cfg, currentSessionId);
        if (storedMessages.length > 0) {
          setMessages(storedMessages);
          return;
        }
      } catch (err) {
        console.error("Failed to load chat history", err);
      }
      
      // Fallback: new chat if no history
      const greeting = cfg.page_context.type === "product"
        ? (cfg.page_context.product_name ? `Hi! Looking at the ${cfg.page_context.product_name}? Ask me about sizes, stock, or anything else!` : `Hi! Ask me anything about this product.`)
        : `Hi! I'm your ${cfg.store_name}. I can help you find products, check stock, or track your order.`;
      
      setMessages([
        {
          id: uuid(),
          role: "bot",
          text: greeting,
          response_type: "text",
        },
      ]);
    }
    
    fetchHistory();

    // Test helpers for A4 Preview Page
    if (typeof window !== "undefined") {
      window.WooCS_Test = {
        resetWidget: () => {
          window.localStorage.removeItem(STORAGE_KEY);
          // Simple reload to pick up new window.WooCS.page_context
          window.location.reload();
        },
        triggerMessage: (msg: string) => {
          setIsOpen(true);
          // Wait for state update to finish
          setTimeout(() => {
             // We can't directly call sendMessage from outside unless we bind it,
             // let's create a custom event that the component listens to.
             window.dispatchEvent(new CustomEvent('woocs_test_message', { detail: msg }));
          }, 100);
        }
      };
    }
  }, []);

  // Listen for test messages
  useEffect(() => {
    const handleTestMessage = (e: any) => {
      if (e.detail) {
        sendMessage(e.detail);
      }
    };
    window.addEventListener('woocs_test_message', handleTestMessage);
    return () => window.removeEventListener('woocs_test_message', handleTestMessage);
  }, [config, sessionId]);

  // Persist
  useEffect(() => {
    if (!sessionId) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, isOpen }));
    } catch {
      /* ignore */
    }
  }, [sessionId, isOpen]);

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
    const cleanText = text.trim();
    const userMsg: Message = { id: uuid(), role: "user", text: cleanText };
    const nextHistory = [
      { sessionId, title: messages.some((message) => message.role === "user") ? (history.find((item) => item.sessionId === sessionId)?.title || cleanText) : cleanText, updatedAt: new Date().toISOString() },
      ...history.filter((item) => item.sessionId !== sessionId),
    ].slice(0, 20);
    setHistory(nextHistory);
    saveHistory(nextHistory);
    setMessages((m) => [...m, userMsg]);
    setLastUserMessage(cleanText);
    setInput("");
    setLoading(true);
    setSlowHint("none");

    const slowTimer = setTimeout(() => setSlowHint("slow"), 8000);
    const timeoutTimer = setTimeout(() => setSlowHint("timeout"), 15000);
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 16000);

    try {
      const startTime = performance.now();
      const res = await fetch(`${config.api_url.replace(/\/$/, "")}/api/widget/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: config.store_id,
          session_id: sessionId,
          message: cleanText,
          page_context: config.page_context.type === "product"
            ? { type: "product", product_id: config.page_context.product_id, product_name: config.page_context.product_name }
            : { type: "general" },
          customer_info: Object.keys(customerInfo).length > 0 ? customerInfo : undefined,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ApiResponse;
      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      if (data.session_id && data.session_id !== sessionId) setSessionId(data.session_id);
      setMessages((m) => [
        ...m,
        {
          id: uuid(),
          role: "bot",
          text: data.answer,
          response_type: data.response_type,
          metadata: data.metadata,
          confidence: data.confidence,
          context_used: data.context_used,
          latency: latencyMs,
        } as Message,
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
    setShowHistory(false);
    const greeting = config?.page_context?.type === "product"
      ? (config.page_context.product_name ? `Looking at ${config.page_context.product_name}? I can help with sizing, availability, or your order.` : `I can help with details, availability, or anything else about this product.`)
      : `Hi — I’m the ${config?.store_name ?? "store"} assistant. What can I help you find?`;

    setMessages([
      {
        id: uuid(),
        role: "bot",
        text: greeting,
        response_type: "text",
      },
    ]);
  }

  async function openConversation(entry: HistoryEntry) {
    if (!config) return;
    setHistoryLoading(true);
    try {
      const storedMessages = await fetchConversation(config, entry.sessionId);
      setSessionId(entry.sessionId);
      setMessages(storedMessages);
      setShowHistory(false);
    } finally {
      setHistoryLoading(false);
    }
  }

  if (!config) return null;

  // Render as a floating widget
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end">
      {isOpen && (
        <div className={`mb-3 flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border border-[#c3c4c7] bg-white font-sans text-[#1d2327] transition-[width,height] duration-150 ${
          isMaximized
            ? "h-[760px] w-[720px] rounded"
            : "h-[620px] w-[400px] rounded"
        }`}>
          <header className="flex min-h-14 items-center justify-between border-b border-[#dcdcde] bg-[#f6f7f7] px-3">
            <div className="flex min-w-0 items-center gap-2">
              {showHistory && (
                <IconButton label="Back to chat" onClick={() => setShowHistory(false)}>
                  <ArrowLeft size={16} />
                </IconButton>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-[13px] font-semibold text-[#1d2327]">
                  {showHistory ? "Conversations" : config.store_name}
                </h1>
                {!showHistory && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#646970]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#00a32a]" aria-hidden="true" />
                    Available now
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {!showHistory && (
                <IconButton label="Conversation history" onClick={() => setShowHistory(true)}>
                  <Clock size={16} />
                </IconButton>
              )}
              <IconButton label="New conversation" onClick={resetChat}>
                <Plus size={18} />
              </IconButton>
              <IconButton
                onClick={() => setIsMaximized((value) => !value)}
                label={isMaximized ? "Restore chat size" : "Maximize chat"}
              >
                {isMaximized
                  ? <Minimize size={16} />
                  : <Maximize size={16} />}
              </IconButton>
              <IconButton label="Close" onClick={() => setIsOpen(false)}>
                <X size={17} />
              </IconButton>
            </div>
          </header>

          {showHistory ? (
            <HistoryList entries={history} loading={historyLoading} onSelect={openConversation} onNew={resetChat} />
          ) : config.prechat_enabled && !prechatDone ? (
            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8 text-center">
              <div className="mb-6">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded border border-[#c3c4c7] bg-[#f6f7f7]" style={{ color: config.primary_color }}>
                  <MessageCircle size={26} strokeWidth={1.6} />
                </div>
                <h2 className="text-lg font-semibold text-[#1d2327]">Welcome to {config.store_name}</h2>
                <p className="mt-2 text-sm text-[#646970]">Please introduce yourself before we start.</p>
              </div>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const info = {
                    name: (fd.get('name') as string) || undefined,
                    email: (fd.get('email') as string) || undefined,
                    phone: (fd.get('phone') as string) || undefined,
                  };
                  setCustomerInfo(info);
                  setPrechatDone(true);
                  try { window.localStorage.setItem("woocs_prechat_v1", JSON.stringify(info)); } catch { /* ignore */ }
                }}
                className="w-full max-w-sm space-y-4 text-left"
              >
                {config.prechat_fields.map(f => (
                  <div key={f.key}>
                    <label className="mb-1.5 block text-xs font-medium text-[#1d2327]">
                      {f.label} {f.required && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type={f.type}
                      name={f.key}
                      required={f.required}
                      className="block w-full rounded-sm border border-[#8c8f94] px-3 py-2 text-sm text-[#1d2327] focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1]"
                    />
                  </div>
                ))}
                <button
                  type="submit"
                  style={{ backgroundColor: config.primary_color }}
                className="mt-4 w-full rounded-sm px-4 py-2.5 text-sm font-medium text-white hover:brightness-95"
                >
                  Start Chatting
                </button>
              </form>
            </div>
          ) : (
            <>
              {/* Thread */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto bg-white px-4 py-5">
                <div className="flex flex-col gap-5">
                  {messages.map((m) => (
                    <MessageRow key={m.id} message={m} onEscalate={handleEscalate} />
                  ))}

                  {loading && (
                    <div className="max-w-[90%]">
                      <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] px-3 py-2.5">
                        {slowHint === "timeout" ? (
                          <div className="flex flex-col gap-2">
                            <span className="text-sm text-slate-600">Taking too long — try again.</span>
                            <button
                              onClick={() => sendMessage(lastUserMessage)}
                              style={{ backgroundColor: config.primary_color }}
                              className="self-start rounded-md px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
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
                    <div className="divide-y divide-[#dcdcde] border-y border-[#dcdcde]">
                      {(config?.page_context?.type === "product" ? ["Is this in stock?", "What sizes are available?", "Check my order"] : QUICK_REPLIES).map((q) => (
                        <button
                          key={q}
                          onClick={() => sendMessage(q)}
                          className="group flex w-full items-center justify-between py-2.5 text-left text-[12px] font-medium text-[#2271b1] hover:text-[#135e96]"
                        >
                          <span>{q}</span>
                          <ArrowRight className="text-[#8c8f94] group-hover:text-[#2271b1]" size={14} strokeWidth={1.7} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Input */}
              <div className="border-t border-[#dcdcde] bg-[#f6f7f7] px-3 pb-2.5 pt-3">
                <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-sm border border-[#8c8f94] bg-white p-1 pl-3 focus-within:border-[#2271b1] focus-within:ring-1 focus-within:ring-[#2271b1]">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={loading}
                    placeholder="Ask anything..."
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] text-[#1d2327] placeholder:text-[#8c8f94] focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    style={{ backgroundColor: config.primary_color }}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Send"
                  >
                    <ArrowUp size={17} strokeWidth={1.8} />
                  </button>
                </form>
                <p className="mt-2 text-center text-[10px] text-[#787c82]">Powered by WooCS.ai</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{ backgroundColor: config.primary_color }}
          className="flex h-12 w-12 items-center justify-center rounded border border-black/10 text-white hover:brightness-95 active:brightness-90"
          aria-label="Open chat"
        >
          <MessageCircle size={22} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-sm text-[#50575e] hover:bg-[#dcdcde] hover:text-[#1d2327] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2271b1]"
      aria-label={label}
      title={label}
    >
      <span className="[&>svg]:stroke-[1.55]">{children}</span>
    </button>
  );
}

function HistoryList({ entries, loading, onSelect, onNew }: {
  entries: HistoryEntry[];
  loading: boolean;
  onSelect: (entry: HistoryEntry) => void;
  onNew: () => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <p className="text-sm font-medium text-[#1d2327]">No conversations yet</p>
        <p className="mt-1 text-xs leading-5 text-[#646970]">Your recent conversations will appear here.</p>
        <button onClick={onNew} className="mt-5 text-xs font-semibold text-[#2271b1] underline underline-offset-4 hover:text-[#135e96]">
          Start a conversation
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2" aria-busy={loading}>
      <div className="divide-y divide-[#dcdcde]">
        {entries.map((entry) => (
          <button
            key={entry.sessionId}
            onClick={() => onSelect(entry)}
            disabled={loading}
            className="group flex w-full items-center justify-between gap-5 px-2 py-3.5 text-left hover:bg-[#f6f7f7] disabled:opacity-50"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-[#2271b1] group-hover:text-[#135e96]">{entry.title}</span>
              <span className="mt-1 block text-[11px] text-[#787c82]">
                {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.updatedAt))}
              </span>
            </span>
            <ChevronRight className="shrink-0 text-[#8c8f94] group-hover:text-[#2271b1]" size={16} strokeWidth={1.6} />
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({ message, onEscalate }: { message: Message; onEscalate: (a: boolean) => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div 
          style={{ backgroundColor: typeof window !== "undefined" ? window.WooCS?.primary_color || "#2271b1" : "#2271b1" }}
          className="max-w-[78%] rounded px-3 py-2 text-[13px] leading-relaxed text-white animate-in fade-in"
        >
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in">
      <div className="flex max-w-[90%] flex-col gap-3">
        <div
          className={`relative rounded border px-3 py-2.5 text-[13px] leading-5 ${
            message.error
              ? "border-[#d63638] bg-[#fcf0f1] text-[#8a2424]"
              : "border-[#dcdcde] bg-[#f6f7f7] text-[#2c3338]"
          }`}
        >
          {message.text}
          {/* Debug overlay (only shown if we have context info via metadata or a custom property in the future, for PoC we can just read it if passed) */}
          {((message as any).context_used || (message as any).latency) && (
            <div className="absolute -top-5 right-0 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-white opacity-80 whitespace-nowrap">
              {((message as any).latency) && `${(message as any).latency}ms | `}
              conf: {((message as any).confidence ?? 0).toFixed(2)} | context: {(message as any).context_used || 'general'}
            </div>
          )}
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
    <div className="overflow-hidden rounded border border-[#c3c4c7] bg-white">
      {meta.image_url && (
        <img src={meta.image_url} alt={meta.name} className="h-28 w-full object-cover" />
      )}
      <div className="p-3">
        <div className="text-[13px] font-semibold leading-tight text-[#1d2327]">{meta.name}</div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-bold text-[#1d2327]">${meta.price}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${stock.cls}`}>{stock.label}</span>
        </div>
        <a
          href={meta.wc_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ backgroundColor: typeof window !== "undefined" ? window.WooCS?.primary_color || "#2271b1" : "#2271b1" }}
          className="mt-3 block w-full rounded-sm px-3 py-1.5 text-center text-[11px] font-medium text-white hover:brightness-95"
        >
          View product
        </a>
      </div>
    </div>
  );
}

function OrderCard({ meta }: { meta: OrderMeta }) {
  return (
    <div className="rounded border border-[#c3c4c7] bg-white p-3">
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
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
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

function TypingDots() {
  return (
    <div className="flex items-center gap-2 py-1 text-[11px] text-slate-500">
      <span>Thinking</span>
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
    </div>
  );
}
