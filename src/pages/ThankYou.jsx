import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";

// Copy is per product and describes only what the purchase actually did.
const planMessages = {
  post_single: {
    title: "Post added",
    desc: "1 post has been added to your account. Publish your job whenever you're ready.",
    action: { label: "Post a Job", href: "/post-job" },
  },
  post_bag_small: {
    title: "Small Bag of Posts added",
    desc: "3 posts have been added to your account.",
    action: { label: "Post a Job", href: "/post-job" },
  },
  post_bag_medium: {
    title: "Medium Bag of Posts added",
    desc: "5 posts have been added to your account.",
    action: { label: "Post a Job", href: "/post-job" },
  },
  post_bag_large: {
    title: "Large Bag of Posts added",
    desc: "8 posts have been added to your account.",
    action: { label: "Post a Job", href: "/post-job" },
  },
  customer_monthly: {
    title: "Monthly subscription active",
    desc: "You can post jobs without using post credits while your subscription is active.",
    action: { label: "Post a Job", href: "/post-job" },
  },
  customer_annual: {
    title: "Annual subscription active",
    desc: "You can post jobs without using post credits while your subscription is active.",
    action: { label: "Post a Job", href: "/post-job" },
  },
  verified_pro: {
    title: "Pro Badge Purchased!",
    desc: "Your Pro Badge is now live on your profile. Note: this is a separate cosmetic badge from license verification — submit your license/EIN from Account for a real Verified badge.",
    action: { label: "View Your Profile", href: "/account" },
  },
  priority_booking: {
    title: "Priority Booking Activated!",
    desc: "Your next posted job will be marked priority and shown to contractors first.",
    action: { label: "Post a Job", href: "/post-job" },
  },
  handyman_pro: {
    title: "Welcome to Handyman Pro!",
    desc: "Your account has been upgraded with unlimited bids and priority placement.",
    action: { label: "Go to Jobs Map", href: "/jobs-map" },
  },
  featured_listing: {
    title: "Featured Listing Activated!",
    desc: "Your profile is featured for the next 7 days.",
    action: { label: "View Your Profile", href: "/account" },
  },
  business_pro: {
    title: "Welcome to Business Pro!",
    desc: "Your account has been upgraded with multi-property management features.",
    action: { label: "Go Home", href: "/" },
  },
};

export default function ThankYou() {
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState("confirming"); // confirming | confirmed | failed

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("plan");
    const token = params.get("token");
    setPlan(p);

    // The plan is only ever actually granted here — confirmPurchase verifies
    // `token` against the single-use PurchaseIntent row createCheckout
    // created before redirecting to Wix, so this page can no longer grant
    // anything just by being visited with a crafted ?plan= query param (see
    // confirmPurchase/entry.ts for the full reasoning).
    if (!token) {
      setStatus("failed");
      return;
    }
    base44.functions
      .invoke("confirmPurchase", { token })
      .then((res) => {
        setStatus(res?.data?.error ? "failed" : "confirmed");
      })
      .catch(() => setStatus("failed"));
  }, []);

  if (status === "failed") {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card rounded-2xl border border-border p-10 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="font-heading font-extrabold text-2xl text-foreground mb-2">We couldn't confirm this purchase</h1>
          <p className="text-muted-foreground text-sm mb-8">
            This link may have expired or already been used. If you completed a payment and don't see it reflected on your account, contact support.
          </p>
          <Link to="/plans">
            <Button className="rounded-2xl px-8 font-heading font-bold">
              Back to Plans
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

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
        <h1 className="font-heading font-extrabold text-2xl text-foreground mb-2">
          {status === "confirming" ? "Confirming your purchase..." : info.title}
        </h1>
        <p className="text-muted-foreground text-sm mb-8">
          {status === "confirming" ? "This will only take a moment." : info.desc}
        </p>
        {status === "confirmed" && (
          <Link to={info.action.href}>
            <Button className="rounded-2xl px-8 font-heading font-bold">
              {info.action.label}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        )}
      </motion.div>
    </div>
  );
}
