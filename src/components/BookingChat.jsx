import { useState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";

function recipientFor(booking, isCustomer) {
  return isCustomer ? booking?.accepted_by_email : booking?.customer_email;
}

export default function BookingChat({ bookingId, currentUser, booking, isCustomer }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [optimisticId, setOptimisticId] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    base44.entities.Message.filter({ booking_id: bookingId }, "created_date", 100).then(setMessages);

    const unsubscribe = base44.entities.Message.subscribe((event) => {
      if (event.data?.booking_id === bookingId) {
        if (event.type === "create") {
          setMessages((prev) => [...prev, event.data]);
        }
      }
    });
    return unsubscribe;
  }, [bookingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    setOptimisticId(tempId);
    const recipient_email = recipientFor(booking, isCustomer);
    setMessages(prev => [...prev, {
      id: tempId,
      booking_id: bookingId,
      sender_email: currentUser.email,
      sender_name: currentUser.full_name || currentUser.email,
      recipient_email,
      content: text,
      created_date: new Date().toISOString(),
    }]);
    try {
      await base44.entities.Message.create({
        booking_id: bookingId,
        sender_email: currentUser.email,
        sender_name: currentUser.full_name || currentUser.email,
        recipient_email,
        content: text,
      });
    } catch (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
      setOptimisticId(null);
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-bold text-base">Messages</h2>
          <p className="text-xs text-muted-foreground">Chat with your {isCustomer ? "contractor" : "customer"}</p>
        </div>
        {isCustomer && booking?.contractor_name && (
           <a
             href={booking?.contractor_id ? `/contractor/${booking.contractor_id}` : "#"}
             onClick={(e) => {
               if (!booking?.contractor_id) {
                 e.preventDefault();
                 alert("Contractor profile not available yet.");
               }
             }}
             style={{ cursor: booking?.contractor_id ? 'pointer' : 'default' }}
            className="flex items-center gap-2.5 bg-secondary/60 hover:bg-secondary rounded-xl px-3 py-2 transition-colors shrink-0"
          >
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
              {booking.contractor_photo ? (
                <img src={booking.contractor_photo} alt={booking.contractor_name} className="w-full h-full object-cover" />
              ) : (
                <span className="font-heading font-bold text-primary text-sm">
                  {booking.contractor_name?.charAt(0) || "?"}
                </span>
              )}
            </div>
            <div className="text-left">
              <p className="font-heading font-semibold text-xs text-foreground leading-tight">{booking.contractor_name}</p>
              {booking.contractor_business_name && (
                <p className="text-[10px] text-muted-foreground leading-tight">{booking.contractor_business_name}</p>
              )}
              <p className="text-[10px] text-primary leading-tight">View profile →</p>
            </div>
          </a>
          )}
      </div>

      {/* Messages */}
      <div className="h-72 overflow-y-auto px-4 py-4 space-y-3 bg-secondary/20">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground mt-8">No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_email === currentUser.email;
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-1`}>
                {!isMe && (
                  <span className="text-[10px] text-muted-foreground px-1">{msg.sender_name}</span>
                )}
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card border border-border rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message..."
          className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
        />
        <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
      </div>
    </div>
  );
}