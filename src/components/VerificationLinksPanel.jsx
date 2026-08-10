import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getStateVerificationLinks } from "@/lib/stateVerificationLinks";

// Shared by ContractorSetup.jsx and Account.jsx (Phase 2 "State Verification
// Guidance" + "Copy Helpers") so both places pick up new states / link
// changes automatically instead of duplicating this UI. All state-specific
// data lives in src/lib/stateVerificationLinks.js — nothing here is
// state-specific.
export default function VerificationLinksPanel({ state, licenseNumber, einNumber }) {
  const [justCopied, setJustCopied] = useState(null);
  const links = getStateVerificationLinks(state);

  function copy(value, key, label) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setJustCopied(key);
      toast.success(`${label} copied`);
      setTimeout(() => setJustCopied((k) => (k === key ? null : k)), 2000);
    }).catch(() => toast.error("Couldn't copy — please copy manually"));
  }

  if (!state) {
    return <p className="text-xs text-muted-foreground italic">Select a state above to see official verification links.</p>;
  }
  if (!links) {
    return <p className="text-xs text-muted-foreground italic">No verification links on file yet for this state.</p>;
  }

  const chipClass = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-card border border-border hover:bg-secondary transition-colors";

  return (
    <div className="bg-secondary/40 rounded-xl p-4 space-y-2.5">
      <p className="text-xs font-semibold text-foreground">Verify in {links.name}</p>
      <div className="flex flex-wrap gap-2">
        {licenseNumber && (
          <button type="button" onClick={() => copy(licenseNumber, "license", "License number")} className={chipClass}>
            {justCopied === "license" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            Copy License Number
          </button>
        )}
        {einNumber && (
          <button type="button" onClick={() => copy(einNumber, "ein", "EIN")} className={chipClass}>
            {justCopied === "ein" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            Copy EIN
          </button>
        )}
        <a href={links.licenseBoardUrl} target="_blank" rel="noopener noreferrer" className={chipClass} title={links.licenseBoardLabel}>
          <ExternalLink className="w-3.5 h-3.5" />
          Open Verification Website
        </a>
        <a href={links.businessEntitySearchUrl} target="_blank" rel="noopener noreferrer" className={chipClass}>
          <ExternalLink className="w-3.5 h-3.5" />
          Open Business Registry
        </a>
      </div>
      <p className="text-[11px] text-muted-foreground">{links.licenseBoardLabel}</p>
    </div>
  );
}
