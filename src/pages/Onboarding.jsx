import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Home, Briefcase, Building2, Shield, Wrench, ArrowRight, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { toast } from "sonner";

const userTypes = [
  {
    value: "Homeowner",
    icon: Home,
    label: "Homeowner",
    desc: "Looking to hire contractors for home projects",
    color: "from-blue-500 to-cyan-500",
    bg: "bg-blue-50 dark:bg-blue-950",
    border: "border-blue-200 dark:border-blue-800",
    selectedBorder: "border-blue-500",
  },
  {
    value: "Realtor",
    icon: Building2,
    label: "Realtor",
    desc: "Real estate professional managing multiple properties",
    color: "from-violet-500 to-purple-500",
    bg: "bg-violet-50 dark:bg-violet-950",
    border: "border-violet-200 dark:border-violet-800",
    selectedBorder: "border-violet-500",
  },
  {
    value: "Business Owner",
    icon: Briefcase,
    label: "Business Owner",
    desc: "Managing commercial properties or facilities",
    color: "from-teal-500 to-cyan-500",
    bg: "bg-teal-50 dark:bg-teal-950",
    border: "border-teal-200 dark:border-teal-800",
    selectedBorder: "border-teal-500",
  },
  {
    value: "Contractor",
    icon: Shield,
    label: "Contractor",
    desc: "Licensed professional offering skilled services",
    color: "from-orange-500 to-red-500",
    bg: "bg-orange-50 dark:bg-orange-950",
    border: "border-orange-200 dark:border-orange-800",
    selectedBorder: "border-orange-500",
  },
  {
    value: "Handyman",
    icon: Wrench,
    label: "Handyman",
    desc: "General repairs and maintenance services",
    color: "from-amber-500 to-orange-500",
    bg: "bg-amber-50 dark:bg-amber-950",
    border: "border-amber-200 dark:border-amber-800",
    selectedBorder: "border-amber-500",
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    if (!selectedType) {
      toast.error("Please select your account type to continue");
      return;
    }
    setSaving(true);
    await base44.auth.updateMe({ user_type: selectedType });
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <span className="text-primary-foreground font-heading font-bold text-xl">I</span>
          </div>
          <h1 className="font-heading font-extrabold text-3xl text-foreground mb-2">
            Welcome to Linked
          </h1>
          <p className="text-muted-foreground text-base">
            Tell us how you'll be using Linked so we can personalize your experience.
          </p>
        </div>

        {/* User Type Selection */}
        <div className="space-y-3 mb-8">
          <p className="font-semibold text-sm text-foreground">I am a...</p>
          {userTypes.map((type, i) => {
            const Icon = type.icon;
            const isSelected = selectedType === type.value;
            return (
              <motion.button
                key={type.value}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.07 }}
                onClick={() => setSelectedType(type.value)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                  isSelected
                    ? `${type.bg} ${type.selectedBorder} shadow-md`
                    : "bg-card border-border hover:border-primary/30"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${type.color} flex items-center justify-center shrink-0`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-bold text-foreground">{type.label}</p>
                  <p className="text-xs text-muted-foreground">{type.desc}</p>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>



        {/* Continue Button */}
        <button
          onClick={handleContinue}
          disabled={!selectedType || saving}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-heading font-bold text-base hover:shadow-lg hover:shadow-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Setting up...</>
          ) : (
            <><ArrowRight className="w-5 h-5" /> Continue</>
          )}
        </button>
      </motion.div>
    </div>
  );
}