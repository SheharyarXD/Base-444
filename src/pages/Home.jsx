import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shield, Clock, Star, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";

const features = [
  { icon: Shield, title: "Verified Pros", desc: "Background-checked and insured contractors" },
  { icon: Clock, title: "Fast Response", desc: "Get matched within minutes, not days" },
  { icon: Star, title: "Quality Guaranteed", desc: "Rated and reviewed by real customers" },
  { icon: Zap, title: "Linked Booking", desc: "Book online, no phone calls needed" },
];

export default function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState(0);

  const WRITE_DURATION = 2000;

  // Redirect contractors to jobs map
  useEffect(() => {
    if (user && (user.user_type === "Contractor" || user.user_type === "Handyman")) {
      navigate("/jobs-map", { replace: true });
    }
  }, [user?.user_type]);

  useEffect(() => {
    const startDelay = setTimeout(() => {
      const start = performance.now();
      const tick = (now) => {
        const elapsed = now - start;
        const p = Math.min(elapsed / WRITE_DURATION, 1);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        setProgress(eased);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 600);
    return () => clearTimeout(startDelay);
  }, []);

  useEffect(() => {
    base44.auth.me().then((user) => {
      setUser(user);
    }).catch(() => {});
  }, [navigate]);

  // Don't show home page for contractors (they're redirected)
  if (user && (user.user_type === "Contractor" || user.user_type === "Handyman")) {
    return null;
  }

  return (
    <div className="pb-24 md:pb-12">

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(24_95%_53%/0.2),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,hsl(174_62%_47%/0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,hsl(262_52%_55%/0.1),transparent_70%)]" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <div className="relative flex items-center justify-center mb-4" style={{ width: "min(90vw, 520px)", height: 130, margin: "0 auto 2rem" }}>
              <span
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: "clamp(3rem, 13vw, 6.5rem)",
                  fontWeight: 400,
                  color: "rgba(255,255,255,0.10)",
                  position: "absolute",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                  letterSpacing: "0.02em",
                }}
              >
                Linked
              </span>
              <span
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: "clamp(3rem, 13vw, 6.5rem)",
                  fontWeight: 400,
                  color: "#fff",
                  position: "absolute",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                  letterSpacing: "0.02em",
                  clipPath: `inset(0 ${(100 - progress * 100).toFixed(2)}% 0 0)`,
                  textShadow: "0 2px 24px rgba(255,150,50,0.6), 0 1px 6px rgba(0,0,0,0.9)",
                }}
              >
                Linked
              </span>
              {progress > 0.01 && progress < 0.99 && (
                <div
                  style={{
                    position: "absolute",
                    left: `${(progress * 100).toFixed(1)}%`,
                    top: "50%",
                    transform: "translate(-50%, -30%)",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "rgba(255, 200, 100, 1)",
                    boxShadow: "0 0 12px 6px rgba(255,140,40,0.8), 0 0 30px 12px rgba(255,100,20,0.4)",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
            <p className="text-lg text-white mb-10 max-w-lg mx-auto leading-relaxed font-semibold">
              No more phone books, no more google searches. Just post and wait.
            </p>

            <div className="max-w-md mx-auto">
              <div className="flex gap-3">
                {user?.user_type !== "Handyman" && (
                  <Link to="/post-job" className="w-full">
                    <button className="w-full py-3.5 rounded-xl bg-white/15 backdrop-blur-sm text-white font-heading font-bold text-sm border border-white/30 hover:bg-white/25 transition-colors">
                      Post Job
                    </button>
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="text-center mb-16">
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-foreground mb-4">
            Why Linked?
          </h2>
          <p className="text-white text-lg max-w-xl mx-auto font-semibold">
            Find verified contractors, get instant quotes, and book in minutes.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
              className="bg-card rounded-2xl border border-border p-6 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <f.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-heading font-bold text-sm mb-1">{f.title}</h3>
              <p className="text-xs text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}