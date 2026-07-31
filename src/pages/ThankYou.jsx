import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";

const planMessages = {
  realtor_pro: {
    title: "Welcome to Realtor Pro!",
    desc: "Your account has been upgraded. Head to your Properties dashboard to manage bookings.",
    action: { label: "Go to Properties", href: "/realtor-dashboard" },
  },
  verified_pro: {
    title: "Verified Pro Badge Purchased!",
    desc: "An admin will verify your contractor profile shortly. Your badge will appear once approved.",
    action: { label: "View Your Profile", href: "/account" },
  },
  priority_booking: {
    title: "Priority Booking Activated!",
    desc: "Your next booking will be prioritized. Contractors will see your request first.",
    action: { label: "Post a Job", href: "/post-job" },
  },
};

export default function ThankYou() {
  const [plan, setPlan] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("plan");
    setPlan(p);

    // Update user plan for realtor_pro
    if (p === "realtor_pro") {
      base44.auth.updateMe({ plan: "realtor_pro", user_type: "Realtor" }).catch(() => {});
    }
  }, []);

  const info = planMessages[plan] || {
    title: "Payment Successful!",
    desc: "Thank you for your purchase.",
    action: { label: "Go Home", href: "/" },
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl border border-border p-10 max-w-md w-full text-center"
      >
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="font-heading font-extrabold text-2xl text-foreground mb-2">{info.title}</h1>
        <p className="text-muted-foreground text-sm mb-8">{info.desc}</p>
        <Link to={info.action.href}>
          <Button className="rounded-2xl px-8 font-heading font-bold">
            {info.action.label}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}