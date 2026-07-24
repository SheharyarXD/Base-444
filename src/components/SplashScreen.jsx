import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";

export default function SplashScreen({ onDone, hasAccount }) {
  const [showButtons, setShowButtons] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1

  const WRITE_DURATION = 2000; // ms to "write" the word

  useEffect(() => {
    const startDelay = setTimeout(() => {
      const start = performance.now();

      const tick = (now) => {
        const elapsed = now - start;
        const p = Math.min(elapsed / WRITE_DURATION, 1);
        // ease-in-out
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        setProgress(eased);

        if (p < 1) {
          requestAnimationFrame(tick);
        } else if (hasAccount) {
          // Auto-transition for existing users after 4 seconds
          setTimeout(() => onDone(), 4000);
        } else {
          // Show buttons for new users
          setTimeout(() => setShowButtons(true), 400);
        }
      };

      requestAnimationFrame(tick);
    }, 600);

    return () => clearTimeout(startDelay);
  }, [hasAccount, onDone]);

  // The pen nib position (percentage 0-100 across the text width)
  const penPct = progress * 100;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-between py-20"
      style={{
        backgroundImage: 'url(https://media.base44.com/images/public/69f0913914dfde6303da8626/643810e1b_generated_image.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Writing area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center w-full px-6 gap-2">
        <div className="relative flex items-center justify-center" style={{ width: "min(90vw, 520px)", height: 130 }}>

          {/* Ghost text */}
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

          {/* Revealed text — clips from left to right */}
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
              clipPath: `inset(0 ${(100 - penPct).toFixed(2)}% 0 0)`,
              textShadow: "0 2px 24px rgba(255,150,50,0.6), 0 1px 6px rgba(0,0,0,0.9)",
            }}
          >
            Linked
          </span>

          {/* Glowing pen nib */}
          {progress > 0.01 && progress < 0.99 && (
            <div
              style={{
                position: "absolute",
                left: `${penPct.toFixed(1)}%`,
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
      </div>

      {/* Buttons */}
      <AnimatePresence>
        {showButtons && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex flex-col items-center gap-4 w-full max-w-sm px-6"
          >
            {!hasAccount && (
              <button
                onClick={() => base44.auth.redirectToLogin()}
                className="w-full py-3 rounded-2xl bg-white text-black font-bold text-sm shadow-xl hover:bg-white/90 transition-colors"
                style={{ fontFamily: "'Cinzel', serif" }}
              >
                Get Started
              </button>
            )}
            <button
              onClick={() => hasAccount ? base44.auth.redirectToLogin() : onDone()}
              className="w-full py-3 rounded-2xl bg-white text-black font-bold text-sm shadow-xl hover:bg-white/90 transition-colors"
              style={{ fontFamily: "'Cinzel', serif" }}
            >
              Sign In
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}