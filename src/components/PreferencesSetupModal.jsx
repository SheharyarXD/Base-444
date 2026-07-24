import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function PreferencesSetupModal({ open, onOpenChange, contractor, user }) {
  const [zipCode, setZipCode] = useState(contractor?.preferred_zip_code || "");
  const [distance, setDistance] = useState(contractor?.preferred_miles_distance || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!zipCode.trim()) {
      toast.error("Please enter your preferred zip code");
      return;
    }

    setSaving(true);
    await base44.entities.Contractor.update(contractor.id, {
      preferred_zip_code: zipCode,
      preferred_miles_distance: distance ? parseFloat(distance) : null,
    });
    toast.success("Preferences saved!");
    onOpenChange(false);
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">Welcome to Linked!</DialogTitle>
          <DialogDescription>Let's set up your work preferences</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Set your preferred service area so you only receive job notifications that match your preferences.
          </p>
          
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block">
              Preferred Zip Code *
            </label>
            <input
              type="text"
              placeholder="e.g. 10001"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block">
              Willing to Travel (miles)
            </label>
            <input
              type="number"
              placeholder="e.g. 10"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">Optional - leave blank for no distance limit</p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Skip for Now
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={saving || !zipCode.trim()}
          >
            {saving ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}