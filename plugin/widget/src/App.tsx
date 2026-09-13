import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Clock, Maximize, MessageCircle, Minimize, Plus, X, MoreHorizontal, PenSquare, History, Ticket } from "lucide-react";

type ResponseType = "text" | "product_card" | "product_carousel" | "order_card" | "escalation";

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
type Config = { store_id: string; api_url: string; store_name: string; page_context: any; prechat_enabled: boolean; prechat_fields: PrechatField[]; primary_color: string; wc_url: string; enable_cart_action: boolean; enable_carousel: boolean; enable_quick_replies: boolean; };
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
  const response = await fetch(`${baseUrl}/api/widget/chat/history/?${params}`);
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
      wc_url?: string;
      widget_config?: {
        enable_cart_action?: boolean;
        enable_carousel?: boolean;
        enable_quick_replies?: boolean;
      };
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
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
    const primaryColor = wc?.primary_color || "#2271b1";
    const cfg: Config = {
      store_id: wc?.store_id ?? "",
      api_url: wc?.api_url ?? "http://localhost:8001",
      store_name: wc?.store_name ?? "Store assistant",
      page_context: window.WooCS?.page_context || { type: "general" },
      prechat_enabled: window.WooCS?.prechat_enabled ?? false,
      prechat_fields: window.WooCS?.prechat_fields || [],
      primary_color: window.WooCS?.primary_color || "#2271b1",
      wc_url: window.WooCS?.wc_url || "",
      enable_cart_action: window.WooCS?.widget_config?.enable_cart_action ?? true,
      enable_carousel: window.WooCS?.widget_config?.enable_carousel ?? true,
      enable_quick_replies: window.WooCS?.widget_config?.enable_quick_replies ?? true,
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
          widget_config: {
            enable_cart_action: config.enable_cart_action,
            enable_carousel: config.enable_carousel,
            enable_quick_replies: config.enable_quick_replies,
          }
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

  function handleEscalate(accept: boolean, message?: string) {
    setMessages((m) => {
      const newMessages = [...m];
      if (accept && message) {
        newMessages.push({
          id: uuid(),
          role: "user",
          text: message,
          response_type: "text",
        });
      }
      newMessages.push({
        id: uuid(),
        role: "bot",
        text: accept ? "Got it — a team member will reach out shortly." : "No problem. Let me know if anything else comes up.",
        response_type: "text",
      });
      return newMessages;
    });
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
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
      {isOpen && (
        <div className={`mb-3 flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border border-slate-200 bg-white font-sans text-slate-900 shadow-xl transition-[width,height] duration-150 ${
          isMaximized
            ? "h-[760px] w-[720px] rounded-xl"
            : "h-[620px] w-[400px] rounded-xl"
        }`}>
          <header 
            style={{ backgroundColor: config.primary_color }}
            className="woocs-embossed flex min-h-14 items-center justify-between px-3 text-white"
          >
            <div className="flex min-w-0 items-center gap-3">
              {showHistory && (
                <IconButton label="Back to chat" onClick={() => setShowHistory(false)} light>
                  <ArrowLeft size={20} />
                </IconButton>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-[16px] font-bold text-white tracking-wide">
                  {showHistory ? "Conversations" : config.store_name}
                </h1>
                {!showHistory && (
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-white/90">
                    <span className="h-2 w-2 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.8)]" aria-hidden="true" />
                    Available now
                  </p>
                )}
              </div>
            </div>
            <div className="relative flex items-center gap-1">
              <IconButton 
                label="More options" 
                onClick={() => setIsMenuOpen(!isMenuOpen)} 
                light
              >
                <MoreHorizontal size={20} />
              </IconButton>
              <IconButton label="Close" onClick={() => setIsOpen(false)} light>
                <X size={20} />
              </IconButton>
              
              {isMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsMenuOpen(false)} 
                  />
                  <div className="absolute right-8 top-10 z-50 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg animate-in fade-in zoom-in-95">
                    <button
                      onClick={() => {
                        resetChat();
                        setIsMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                    >
                      <PenSquare size={16} className="text-slate-500" />
                      Start a new chat
                    </button>
                    <button
                      onClick={() => {
                        resetChat();
                        setPrechatDone(false);
                        setCustomerInfo({});
                        setIsOpen(false);
                        setIsMenuOpen(false);
                        if (typeof window !== "undefined") {
                          window.localStorage.removeItem("woocs_prechat_v1");
                        }
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#d63638] hover:bg-red-50 text-left"
                    >
                      <X size={16} />
                      End chat
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      onClick={() => {
                        setShowHistory(true);
                        setIsMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                    >
                      <History size={16} className="text-slate-500" />
                      View recent chats
                    </button>

                    <button
                      onClick={() => {
                        setIsMaximized(!isMaximized);
                        setIsMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                    >
                      {isMaximized ? <Minimize size={16} className="text-slate-500" /> : <Maximize size={16} className="text-slate-500" />}
                      {isMaximized ? "Minimize window" : "Maximize window"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </header>

          {showHistory ? (
            <HistoryList entries={history} loading={historyLoading} onSelect={openConversation} onNew={resetChat} />
          ) : config.prechat_enabled && !prechatDone ? (
            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8 text-center">
              <div className="mb-8">
                <div 
                  className="woocs-embossed mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded text-white" 
                  style={{ backgroundColor: config.primary_color }}
                >
                  <MessageCircle size={24} strokeWidth={1.5} />
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
                  className="woocs-embossed-btn mt-4 w-full rounded-sm px-4 py-2 text-[13px] font-semibold text-white"
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

                  {!loading && messages.length > 0 && messages[messages.length - 1].role === "bot" && config?.enable_quick_replies && (
                    <div className="divide-y divide-[#dcdcde] border-y border-[#dcdcde]">
                      {(config?.page_context?.type === "product" ? ["Is this in stock?", "What are the shipping options?", "Check my order"] : QUICK_REPLIES).map((q) => (
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
              <div className="border-t border-[#e2e4e7] bg-white px-4 pb-4 pt-4 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                <form onSubmit={handleSubmit} className="flex items-center gap-3 rounded-xl border border-[#dcdcde] bg-[#f9fafb] p-1.5 pl-4 focus-within:border-black/20 focus-within:bg-white focus-within:ring-2 focus-within:ring-black/5 transition-all">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={loading}
                    placeholder="Ask anything..."
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-[#1d2327] placeholder:text-[#8c8f94] focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    style={{ backgroundColor: config.primary_color }}
                    className="woocs-embossed-btn flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm text-white disabled:pointer-events-none disabled:opacity-40"
                    aria-label="Send"
                  >
                    <ArrowUp size={16} strokeWidth={1.8} />
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
          className="woocs-embossed-btn flex h-12 w-12 items-center justify-center rounded text-white"
          aria-label="Open chat"
        >
          <MessageCircle size={24} strokeWidth={1.6} />
        </button>
      )}
    </div>
  );
}

function IconButton({ label, onClick, children, light }: { label: string; onClick: () => void; children: ReactNode; light?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid h-10 w-10 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
        light 
          ? "text-white/80 hover:bg-white/20 hover:text-white" 
          : "text-[#50575e] hover:bg-[#dcdcde] hover:text-[#1d2327]"
      }`}
      aria-label={label}
      title={label}
    >
      <span className="[&>svg]:stroke-[2]">{children}</span>
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
          className="max-w-[78%] rounded px-3.5 py-3 text-[14px] leading-relaxed text-white animate-in fade-in"
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
          className={`relative rounded border px-3.5 py-3 text-[14px] leading-relaxed ${
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
        {message.response_type === "product_carousel" && (message.metadata as any)?.products && (
          <ProductCarousel products={(message.metadata as any).products as ProductMeta[]} />
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
      
  const enableCart = typeof window !== "undefined" ? window.WooCS?.widget_config?.enable_cart_action ?? true : true;
  const primaryColor = typeof window !== "undefined" ? window.WooCS?.primary_color || "#2271b1" : "#2271b1";
  
  // Basic extract ID from URL (e.g. /?p=123) for simple Add to Cart link
  const wcIdMatch = meta.wc_url?.match(/p=(\d+)/);
  const wcId = wcIdMatch ? wcIdMatch[1] : null;

  return (
    <div className="overflow-hidden rounded border border-[#c3c4c7] bg-white min-w-[260px] shrink-0 snap-center">
      {meta.image_url && (
        <img src={meta.image_url} alt={meta.name} className="h-28 w-full object-cover" />
      )}
      <div className="p-4 flex flex-col h-full">
        <div className="text-[14px] font-semibold leading-tight text-[#1d2327] line-clamp-2 flex-1">{meta.name}</div>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="font-bold text-[#1d2327]">${meta.price}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${stock.cls}`}>{stock.label}</span>
        </div>
        
        <div className="mt-4 flex flex-col gap-2">
          {enableCart && wcId && meta.stock_status === "instock" ? (
            <>
              <a
                href={`${meta.wc_url}&add-to-cart=${wcId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ backgroundColor: primaryColor }}
                className="woocs-embossed-btn block w-full rounded-sm px-4 py-2 text-center text-[13px] font-semibold text-white"
              >
                Add to cart
              </a>
              <a
                href={meta.wc_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-sm border border-[#c3c4c7] bg-white px-4 py-2 text-center text-[13px] font-medium text-[#2c3338] hover:bg-slate-50 transition-colors"
              >
                View details
              </a>
            </>
          ) : (
            <a
              href={meta.wc_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ backgroundColor: primaryColor }}
              className="woocs-embossed-btn block w-full rounded-sm px-4 py-2 text-center text-[13px] font-semibold text-white"
            >
              View product
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductCarousel({ products }: { products: ProductMeta[] }) {
  return (
    <div className="flex overflow-x-auto gap-3 pb-2 -mx-4 px-4 snap-x hide-scrollbar">
      {products.map((p, idx) => (
        <ProductCard key={idx} meta={p} />
      ))}
    </div>
  );
}

function OrderCard({ meta }: { meta: OrderMeta }) {
  return (
    <div className="rounded border border-[#c3c4c7] bg-white p-4">
      <div className="text-[14px] font-semibold text-slate-900">Order #{meta.order_id}</div>
      <div className="mt-3 space-y-2.5 text-[13px]">
        <div className="flex justify-between border-b border-slate-100 pb-2">
          <span className="text-slate-500">Status</span>
          <span className="font-medium text-indigo-600">{meta.status}</span>
        </div>
        <div className="border-b border-slate-100 pb-2">
          <div className="mb-1.5 text-slate-500">Items</div>
          <ul className="space-y-1 text-slate-800">
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

function EscalationCard({ onEscalate }: { onEscalate: (a: boolean, msg?: string) => void }) {
  const [step, setStep] = useState<'initial' | 'form' | 'submitting' | 'done'>('initial');
  
  if (step === 'done') return null;

  if (step === 'form' || step === 'submitting') {
    return (
      <form 
        className="rounded border border-[#c3c4c7] bg-white p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setStep('submitting');
          const fd = new FormData(e.currentTarget);
          try {
            const wc = typeof window !== "undefined" ? window.WooCS : undefined;
            const apiUrl = wc?.api_url ?? "http://localhost:8001";
            const storeId = wc?.store_id ?? "";
            
            let sessionId = "";
            const raw = typeof window !== "undefined" ? window.localStorage.getItem("woocs_chat_v1") : null;
            if (raw) sessionId = JSON.parse(raw).sessionId;
            
            await fetch(`${apiUrl}/api/widget/chat/escalate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                store_id: storeId,
                session_id: sessionId || "unknown",
                name: fd.get('name') as string,
                email: fd.get('email') as string,
                message: fd.get('message') as string,
              }),
            });
            onEscalate(true, fd.get('message') as string);
            setStep('done');
          } catch (err) {
            console.error('Failed to submit escalation', err);
            setStep('form');
          }
        }}
      >
        <div className="text-[14px] font-medium leading-tight text-[#1d2327] mb-3">Leave a message for the team</div>
        <div className="space-y-3">
          <input
            type="text"
            name="name"
            placeholder="Your name (optional)"
            className="block w-full rounded-sm border border-[#c3c4c7] px-3 py-1.5 text-[13px] focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1]"
          />
          <input
            type="email"
            name="email"
            required
            placeholder="Your email address"
            className="block w-full rounded-sm border border-[#c3c4c7] px-3 py-1.5 text-[13px] focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1]"
          />
          <textarea
            name="message"
            required
            placeholder="How can we help?"
            rows={3}
            className="block w-full rounded-sm border border-[#c3c4c7] px-3 py-1.5 text-[13px] focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1]"
          />
          <button
            type="submit"
            disabled={step === 'submitting'}
            style={{ backgroundColor: typeof window !== "undefined" ? window.WooCS?.primary_color || "#2271b1" : "#2271b1" }}
            className="woocs-embossed-btn w-full rounded-sm px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-70"
          >
            {step === 'submitting' ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded border border-[#c3c4c7] bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="text-base text-amber-500">⚠</span>
        <div className="flex-1">
          <div className="text-[14px] font-medium leading-tight text-[#1d2327]">Want me to connect you with the team?</div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              onClick={() => setStep('form')}
              style={{ backgroundColor: typeof window !== "undefined" ? window.WooCS?.primary_color || "#2271b1" : "#2271b1" }}
              className="woocs-embossed-btn rounded-sm px-4 py-2 text-[13px] font-semibold text-white"
            >
              Talk to someone
            </button>
            <button
              onClick={() => {
                onEscalate(false);
                setStep('done');
              }}
              className="rounded-sm border border-[#c3c4c7] bg-white px-4 py-2 text-[13px] font-medium text-[#2c3338] transition-colors hover:bg-slate-50"
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
    <div className="flex items-center gap-2 py-1.5 text-[13px] text-slate-500">
      <span>Thinking</span>
      <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
    </div>
  );
}
