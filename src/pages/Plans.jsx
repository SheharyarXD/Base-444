import { useState, useEffect } from "react";
import { CheckCircle, Shield, Zap, Crown, Star, Briefcase, Wrench } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import {
  POST_CREDIT_PRODUCTS,
  POST_CREDIT_ORDER,
  CUSTOMER_SUBSCRIPTIONS,
  CUSTOMER_SUBSCRIPTION_ORDER,
  formatPrice,
  pricePerPost,
} from "@/lib/pricing";

// Which add-ons each account type may purchase.
//
// handyman_pro and business_pro are deliberately absent. Both grant a
// subscription flag that nothing in the application reads, so a buyer would
// be charged monthly for no functional benefit. Everything they originally
// advertised — bid limits, premium job postings, a separate dashboard, team
// access, spending reports, discounted rates — would have to be built from
// scratch, which is well outside completing what already exists.
//
// Their definitions, checkout entries, grant logic and cancellation path are
// all left intact below and in the purchase functions, so anyone already
// subscribed keeps working and can still cancel. Re-add the id here once the
// features behind it genuinely exist.
const plansByType = {
  Homeowner: ["priority_booking"],
  Realtor: ["priority_booking"],
  "Business Owner": ["priority_booking"],
  Contractor: ["verified_pro", "featured_listing"],
  // Handymen are providers too, and the two provider add-ons below are the
  // ones that actually deliver something today.
  Handyman: ["verified_pro", "featured_listing"],
};

const plans = [
  {
    id: "priority_booking",
    icon: Zap,
    title: "Priority Booking",
    subtitle: "Highlight your job for providers",
    price: 2.99,
    priceLabel: "per booking",
    color: "amber",
    badge: null,
    isSubscription: false,
    features: [
      "Your job is flagged as priority and highlighted for providers",
      "Applies to your next booking",
      "One-time add-on per booking",
    ],
    cta: "Add Priority",
  },
  {
    id: "verified_pro",
    icon: Shield,
    title: "Pro Badge",
    subtitle: "Stand out with a Pro badge on your profile",
    price: 9.99,
    priceLabel: "one-time",
    color: "blue",
    badge: "For Contractors",
    isSubscription: false,
    features: [
      "Pro badge shown on your profile",
      "Separate from license verification — submit that free from Account",
    ],
    cta: "Get Pro Badge",
  },

  {
    id: "handyman_pro",
    icon: Wrench,
    title: "Handyman Pro",
    subtitle: "Support the platform",
    price: 12.99,
    priceLabel: "/ month",
    color: "orange",
    badge: "For Handymen",
    isSubscription: true,
    features: [
      // Not offered for purchase — see plansByType above.
    ],
    cta: "Start Handyman Pro",
  },
  {
    id: "featured_listing",
    icon: Star,
    title: "Featured Listing",
    subtitle: "A featured badge on your profile",
    price: 1.99,
    priceLabel: "/ week",
    color: "green",
    badge: "For Contractors",
    isSubscription: false,
    features: [
      "Featured badge shown to customers on your profile",
      "Lasts 7 days from purchase",
    ],
    cta: "Get Featured",
  },
  {
    id: "business_pro",
    icon: Briefcase,
    title: "Business Pro Plan",
    subtitle: "Support the platform",
    price: 14.99,
    priceLabel: "/ month",
    color: "teal",
    badge: "For Business Owners",
    isSubscription: true,
    features: [
      // Not offered for purchase — see plansByType above.
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
  const [entitlement, setEntitlement] = useState(null);
  const [searchParams] = useSearchParams();
  // Set when a customer is sent here from a post they could not publish.
  const needsPost = searchParams.get("need") === "post";
  // Providers are not charged to receive work under this model, so the
  // customer post/subscription section is hidden from them entirely.
  const isProvider = ["Contractor", "Handyman"].includes(userType);

  useEffect(() => {
    base44.auth.me().then((me) => {
      const type = me?.user_type || "";
      setUserType(type);
      const allowed = plansByType[type];
      setFilteredPlans(allowed ? plans.filter(p => allowed.includes(p.id)) : plans);
      setLoadingUser(false);
    }).catch(() => setLoadingUser(false));

    // Balance and subscription state are read from the server, never held
    // in the browser — nothing here can be edited into an entitlement.
    base44.functions
      .invoke("getPostEntitlement", {})
      .then((res) => setEntitlement(res?.data || null))
      .catch(() => setEntitlement(null));
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
      // Only planId is sent — price/name/subscription-ness are looked up
      // server-side from createCheckout's own PLANS table, which is the
      // actual source of truth for what gets charged.
      const res = await base44.functions.invoke("createCheckout", { planId: plan.id });
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

      {/* Post credits and subscription — customers only. Providers are not
          charged to receive work, so this whole section is hidden for them. */}
      {!isProvider && (
        <section className="mb-10">
          {needsPost && (
            <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <p className="font-heading font-bold text-sm text-amber-900">You&apos;re out of posts</p>
              <p className="text-xs text-amber-700">
                Pick up a single post or a bag below, then head back to finish your job post.
              </p>
            </div>
          )}

          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h2 className="font-heading font-extrabold text-xl text-foreground">Posts</h2>
            {entitlement && (
              <span className="text-xs font-heading font-bold text-muted-foreground">
                {entitlement.subscription?.active
                  ? "Subscription active"
                  : `${entitlement.credits} post${entitlement.credits === 1 ? "" : "s"} available`}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            One post publishes one job. Buy a single post, or a bag to keep several on hand.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
            {POST_CREDIT_ORDER.map((id) => {
              const product = POST_CREDIT_PRODUCTS[id];
              const each = pricePerPost(id);
              const single = pricePerPost("post_single");
              // Only ever shown when the maths actually supports it. At the
              // currently approved prices a bag costs MORE per post than a
              // single, so this stays hidden rather than claiming a saving
              // that does not exist. It will light up on its own if the
              // prices change.
              const saves = id !== "post_single" && each < single;
              return (
                <div
                  key={id}
                  className="rounded-2xl border-2 border-border bg-card p-4 flex flex-col hover:border-primary/40 transition-all"
                >
                  <p className="font-heading font-bold text-sm text-foreground leading-tight">{product.name}</p>
                  <p className="text-2xl font-heading font-extrabold text-foreground mt-2">
                    {formatPrice(product.price)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {product.credits} post{product.credits === 1 ? "" : "s"}
                  </p>
                  {/* Per-post price is always shown for bags so the customer
                      can compare honestly; it is only coloured as a saving
                      when it genuinely is one. */}
                  {id !== "post_single" && (
                    <p className={`text-[11px] font-semibold mt-1 ${saves ? "text-emerald-700" : "text-muted-foreground"}`}>
                      {formatPrice(Number(each.toFixed(2)))} per post
                    </p>
                  )}
                  <button
                    onClick={() => handlePurchase({ id })}
                    disabled={purchasing === id}
                    className="mt-4 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-heading font-bold disabled:opacity-60"
                  >
                    {purchasing === id ? "Starting…" : "Buy"}
                  </button>
                </div>
              );
            })}
          </div>

          <h2 className="font-heading font-extrabold text-xl text-foreground mb-1">Subscription</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Post jobs without buying credits, for as long as your subscription is active.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CUSTOMER_SUBSCRIPTION_ORDER.map((id) => {
              const sub = CUSTOMER_SUBSCRIPTIONS[id];
              const isCurrent = entitlement?.subscription?.active && entitlement.subscription.plan_id === id;
              return (
                <div
                  key={id}
                  className={`rounded-2xl border-2 p-5 flex flex-col ${
                    isCurrent ? "border-emerald-400 bg-emerald-50/40" : "border-border bg-card hover:border-primary/40"
                  } transition-all`}
                >
                  <p className="font-heading font-bold text-sm text-foreground">{sub.name}</p>
                  <p className="text-3xl font-heading font-extrabold text-foreground mt-2">
                    {formatPrice(sub.price)}
                    <span className="text-sm font-bold text-muted-foreground"> / {sub.intervalLabel}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{sub.description}</p>
                  <button
                    onClick={() => handlePurchase({ id })}
                    disabled={purchasing === id || isCurrent}
                    className="mt-5 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-heading font-bold disabled:opacity-60"
                  >
                    {isCurrent ? "Current plan" : purchasing === id ? "Starting…" : "Subscribe"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

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