import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, ChevronDown } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { SERVICE_CATEGORIES } from "@/lib/serviceCategories";

const states = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

export default function ContractorSetup() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [stateDrawerOpen, setStateDrawerOpen] = useState(false);
  const [form, setForm] = useState({
    category: "",
    hourly_rate: "",
    location: "",
    state: "",
    description: "",
    years_experience: "",
  });

  useEffect(() => {
    async function load() {
      const me = await base44.auth.me();
      setUser(me);
      const contractors = await base44.entities.Contractor.filter({ created_by: me.email }, "", 1);
      if (contractors.length > 0) {
        const c = contractors[0];
        setForm({
          category: c.category || "",
          hourly_rate: c.hourly_rate || "",
          location: c.location || "",
          state: c.state || "",
          description: c.description || "",
          years_experience: c.years_experience || "",
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    if (!form.category || !form.hourly_rate || !form.location || !form.state) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        hourly_rate: parseFloat(form.hourly_rate),
        years_experience: form.years_experience ? parseInt(form.years_experience) : 0,
      };
      const contractors = await base44.entities.Contractor.filter({ created_by: user.email }, "", 1);
      if (contractors.length > 0) {
        await base44.entities.Contractor.update(contractors[0].id, payload);
      } else {
        await base44.entities.Contractor.create({
          ...payload,
          name: user.full_name,
        });
      }
      toast.success("Profile complete!");
      navigate("/");
    } catch (err) {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Complete Your Profile</h1>
          <p className="text-muted-foreground">Set up your contractor information to get started</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
          {/* Category */}
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">Category *</label>
            <Drawer open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
              <button
                onClick={() => setCategoryDrawerOpen(true)}
                type="button"
                className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-left flex items-center justify-between hover:bg-secondary/80 transition-colors focus:ring-2 focus:ring-primary/30"
              >
                <span>{form.category || "Select a category"}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              <DrawerContent className="max-h-[80vh] flex flex-col">
                <DrawerHeader className="sticky top-0 bg-card border-b border-border z-10">
                  <DrawerTitle>Select Category</DrawerTitle>
                </DrawerHeader>
                <div className="px-4 space-y-2 overflow-y-auto flex-1">
                  {SERVICE_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setForm({ ...form, category: cat });
                        setCategoryDrawerOpen(false);
                      }}
                      className={`w-full px-4 py-3 rounded-lg text-left text-sm transition-colors font-medium ${
                        form.category === cat ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </DrawerContent>
            </Drawer>
          </div>

          {/* Hourly Rate */}
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">Hourly Rate ($) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.hourly_rate}
              onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
              placeholder="e.g., 50"
              className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Location */}
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">Service Area *</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g., New York, NY"
              className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* State */}
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">License State *</label>
            <Drawer open={stateDrawerOpen} onOpenChange={setStateDrawerOpen}>
              <button
                onClick={() => setStateDrawerOpen(true)}
                type="button"
                className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-left flex items-center justify-between hover:bg-secondary/80 transition-colors focus:ring-2 focus:ring-primary/30"
              >
                <span>{form.state || "Select a state"}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              <DrawerContent className="max-h-[80vh] flex flex-col">
                <DrawerHeader className="sticky top-0 bg-card border-b border-border z-10">
                  <DrawerTitle>Select License State</DrawerTitle>
                </DrawerHeader>
                <div className="px-4 space-y-2 overflow-y-auto flex-1">
                  {states.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setForm({ ...form, state: st });
                        setStateDrawerOpen(false);
                      }}
                      className={`w-full px-4 py-3 rounded-lg text-left text-sm transition-colors font-medium ${
                        form.state === st ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </DrawerContent>
            </Drawer>
          </div>

          {/* Years Experience */}
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">Years of Experience</label>
            <input
              type="number"
              min="0"
              value={form.years_experience}
              onChange={(e) => setForm({ ...form, years_experience: e.target.value })}
              placeholder="e.g., 10"
              className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">Bio</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Tell customers about yourself..."
              rows="3"
              className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        </div>

        <button
           onClick={handleSave}
           disabled={!form.category || !form.hourly_rate || !form.location || !form.state || saving}
          className="w-full mt-6 py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-heading font-bold text-base hover:shadow-lg hover:shadow-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
          ) : (
            <><ArrowRight className="w-5 h-5" /> Complete Setup</>
          )}
        </button>
      </div>
    </div>
  );
}