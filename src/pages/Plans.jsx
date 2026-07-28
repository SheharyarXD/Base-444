import { useState, useEffect } from "react";
import { CheckCircle, Shield, Zap, Crown, Star, Briefcase, Wrench } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { motion } from "framer-motion";

const plansByType = {
  Homeowner: ["priority_booking"],
  Realtor: ["priority_booking"],
  "Business Owner": ["priority_booking", "business_pro"],
  Contractor: ["verified_pro", "featured_listing"],
  Handyman: ["handyman_pro"],
};

const plans = [
  {
    id: "priority_booking",
    icon: Zap,
    title: "Priority Booking",
    subtitle: "Jump to the front of the queue",
    price: 2.99,
    priceLabel: "per booking",
    color: "amber",
    badge: null,
    isSubscription: false,
    features: [
      "Your request shown first to contractors",
      "Faster response time guaranteed",
      "Priority customer support",
      "One-time add-on per booking",
    ],
    cta: "Add Priority",
  },
  {
    id: "verified_pro",
    icon: Shield,
    title: "Verified Pro Badge",
    subtitle: "Stand out as a trusted contractor",
    price: 9.99,
    priceLabel: "one-time",
    color: "blue",
    badge: "For Contractors",
    isSubscription: false,
    features: [
      "Verified badge on your profile",
      "EIN check certification",
      "Higher placement in search results",
      "Increased customer trust",
    ],
    cta: "Get Verified",
  },

  {
    id: "handyman_pro",
    icon: Wrench,
    title: "Handyman Pro",
    subtitle: "Everything a handyman needs to succeed",
    price: 12.99,
    priceLabel: "/ month",
    color: "orange",
    badge: "For Handymen",
    isSubscription: true,
    features: [
      "Unlimited job bids per month",
      "Priority placement in search results",
      "Verified Handyman badge on profile",
      "Access to premium job postings",
      "Dedicated handyman dashboard",
    ],
    cta: "Start Handyman Pro",
  },
  {
    id: "featured_listing",
    icon: Star,
    title: "Featured Listing",
    subtitle: "Get seen by more customers",
    price: 1.99,
    priceLabel: "/ week",
    color: "green",
    badge: "For Contractors",
    isSubscription: false,
    features: [
      "Top placement on browse page",
      "Highlighted profile card",
      "Featured badge visible to customers",
      "7-day spotlight boost",
    ],
    cta: "Get Featured",
  },
  {
    id: "business_pro",
    icon: Briefcase,
    title: "Business Pro Plan",
    subtitle: "For business owners & property managers",
    price: 14.99,
    priceLabel: "/ month",
    color: "teal",
    badge: "For Business Owners",
    isSubscription: true,
    features: [
      "Manage multiple properties",
      "Team member access",
      "Monthly spending reports",
      "Dedicated account support",
      "Discounted booking rates",
    ],
    cta: "Start Business Pro",
  },
];

const colorMap = {
  orange: {
    icon: "bg-gradient-to-br from-orange-100 to-amber-100 text-orange-600",
    badge: "bg-gradient-to-r from-orange-100 to-amber-100 text-orange-700",
    btn: "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white",
  },
  amber: {
    icon: "bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600",
    badge: "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700",
    btn: "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white",
  },
  blue: {
    icon: "bg-gradient-to-br from-blue-100 to-cyan-100 text-blue-600",
    badge: "bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700",
    btn: "bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white",
  },
  violet: {
    icon: "bg-gradient-to-br from-violet-100 to-purple-100 text-violet-600",
    badge: "bg-gradient-to-r from-violet-100 to-purple-100 text-violet-700",
    btn: "bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-700 hover:to-purple-600 text-white",
  },
  green: {
    icon: "bg-gradient-to-br from-green-100 to-emerald-100 text-green-600",
    badge: "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700",
    btn: "bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 text-white",
  },
  teal: {
    icon: "bg-gradient-to-br from-teal-100 to-cyan-100 text-teal-600",
    badge: "bg-gradient-to-r from-teal-100 to-cyan-100 text-teal-700",
    btn: "bg-gradient-to-r from-teal-600 to-cyan-500 hover:from-teal-700 hover:to-cyan-600 text-white",
  },
  rose: {
    icon: "bg-gradient-to-br from-rose-100 to-pink-100 text-rose-600",
    badge: "bg-gradient-to-r from-rose-100 to-pink-100 text-rose-700",
    btn: "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white",
  },
};

export default function Plans() {
  const [purchasing, setPurchasing] = useState(null);
  const [filteredPlans, setFilteredPlans] = useState([]);
  const [userType, setUserType] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    base44.auth.me().then((me) => {
      const type = me?.user_type || "";
      setUserType(type);
      const allowed = plansByType[type];
      setFilteredPlans(allowed ? plans.filter(p => allowed.includes(p.id)) : plans);
      setLoadingUser(false);
    }).catch(() => setLoadingUser(false));
  }, []);

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center py-40">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }



  async function handlePurchase(plan) {
    setPurchasing(plan.id);
    try {
      const res = await base44.functions.invoke("createCheckout", {
        planId: plan.id,
        planName: plan.title,
        price: plan.price,
        isSubscription: plan.isSubscription,
      });
      window.location.href = res.data.redirectUrl;
    } catch (e) {
      toast.error("Payment setup failed. Please try again.");
      setPurchasing(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-24 md:pb-12 w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-100 to-red-100 text-orange-600 rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
          <Crown className="w-4 h-4" />
          Upgrade Your Experience
        </div>
        <h1 className="font-heading font-extrabold text-3xl md:text-4xl bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent mb-3">
          Plans and Add-ons
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Get more out of Linked with premium features for homeowners, realtors, and contractors.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 w-full">
        {filteredPlans.map((plan, i) => {
          const colors = colorMap[plan.color];
          const Icon = plan.icon;
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`relative bg-card rounded-2xl border-2 overflow-hidden ${
                plan.badge === "Most Popular"
                  ? "border-primary shadow-2xl shadow-primary/20 lg:scale-105"
                  : "border-border hover:border-primary/40"
              } p-3 md:p-4 flex flex-col w-full transition-all hover:shadow-lg`}
            >
              {plan.badge && (
                <span className={`inline-block mb-3 text-xs font-bold px-3 py-1 rounded-full ${colors.badge}`}>
                  {plan.badge}
                </span>
              )}

              <div className={`w-12 h-12 rounded-2xl ${colors.icon} flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6" />
              </div>

              <h2 className="font-heading font-bold text-lg text-foreground">{plan.title}</h2>
              <p className="text-sm text-muted-foreground mb-3">{plan.subtitle}</p>

              <div className="mb-4">
                <span className="font-heading font-extrabold text-3xl text-foreground">${plan.price}</span>
                <span className="text-sm text-muted-foreground ml-1">{plan.priceLabel}</span>
              </div>

              <ul className="space-y-2 mb-5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePurchase(plan)}
                disabled={purchasing === plan.id}
                className={`w-full py-3 rounded-xl font-heading font-bold text-sm transition-all shadow-lg hover:shadow-xl ${colors.btn} disabled:opacity-60`}
              >
                {purchasing === plan.id ? "Processing..." : plan.cta}
              </button>
            </motion.div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        Secure payments via Base44 Payments
      </p>
    </div>
  );
}