import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, X, MapPin, Calendar, Clock, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import DatePickerInput from "../components/DatePickerInput";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SERVICE_CATEGORIES } from "@/lib/serviceCategories";
import { geocodeAddress } from "@/lib/geo";

export default function PostJob() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [timeDrawerOpen, setTimeDrawerOpen] = useState(false);
  const timeOptions = ["Now", "Morning (8am-12pm)", "Afternoon (12pm-4pm)", "Evening (4pm-8pm)", "Flexible"];
  const [form, setForm] = useState({
    job_title: "",
    category: "",
    descriptions: [],
    address: "",
    city: "",
    state: "",
    zip: searchParams.get("zip") || "",
    preferred_date: "",
    preferred_time: "Flexible",
  });

  useEffect(() => {
    base44.auth.me().then((me) => {
      if (me && (me.user_type === "Contractor" || me.user_type === "Handyman")) {
        navigate("/bookings");
      } else if (me) {
        setUser(me);
        // Pre-fill address from saved profile (not for Realtors)
        if (me.user_type !== "Realtor" && (me.address_street || me.address_city || me.address_state || me.address_zip)) {
          setForm(prev => ({
            ...prev,
            address: me.address_street || prev.address,
            city: me.address_city || prev.city,
            state: me.address_state || prev.state,
            zip: me.address_zip || prev.zip,
          }));
        }
      }
    }).catch(() => {});
  }, [navigate]);

  function set(field, val) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploadingPhoto(true);
    const urls = await Promise.all(
      files.map(async (file) => {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        return file_url;
      })
    );
    setPhotos((prev) => [...prev, ...urls]);
    setUploadingPhoto(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.job_title || !form.address || !form.city || !form.state || !form.zip || !form.preferred_date) {
      toast.error("Please fill in the required fields.");
      return;
    }
    if (!form.category) {
      toast.error("Please select a service category.");
      return;
    }
    setSubmitting(true);
    // Auto-save address to profile for homeowners and business owners (not Realtors)
    if (user && ["Homeowner", "Business Owner"].includes(user.user_type) && user.user_type !== "Realtor") {
      await base44.auth.updateMe({
        address_street: form.address,
        address_city: form.city,
        address_state: form.state,
        address_zip: form.zip,
      });
    }

    try {
      // Geocode once at creation time so provider discovery (JobsMap) doesn't
      // have to re-geocode this job's address on every future page view.
      const fullAddress = `${form.address}, ${form.city}, ${form.state} ${form.zip}`;
      const coords = await geocodeAddress(fullAddress);

      await base44.entities.Booking.create({
        ...form,
        job_description: form.descriptions.join(" | "),
        photo_urls: photos,
        status: "pending",
        customer_name: user?.full_name || "",
        customer_email: user?.email || "",
        customer_type: user?.user_type || "Homeowner",
        ...(coords ? { job_lat: coords.lat, job_lng: coords.lng } : {}),
      });
    } catch (err) {
      console.error('Error creating booking:', err);
      toast.error("Failed to post job. Please try again.");
      setSubmitting(false);
      return;
    }
    toast.success("Job posted! Contractors near you will see it on the map.");
    navigate("/bookings");
  }

  function addDescription() {
    setForm(prev => ({ ...prev, descriptions: [...prev.descriptions, ""] }));
  }

  function updateDescription(idx, val) {
    setForm(prev => ({
      ...prev,
      descriptions: prev.descriptions.map((d, i) => i === idx ? val : d)
    }));
  }

  function removeDescription(idx) {
    setForm(prev => ({
      ...prev,
      descriptions: prev.descriptions.filter((_, i) => i !== idx)
    }));
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div>
          <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-foreground">Post a Job</h1>
          <p className="text-muted-foreground text-sm mt-1">Describe what needs to be done and matching providers near you will see it.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Job Details */}
          <div className="bg-white rounded-2xl border border-slate-300 p-5 space-y-4">
            <h2 className="font-heading font-bold text-sm text-black">Job Details</h2>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-2 block">Service Category *</label>
              <Drawer open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
                <button
                  onClick={() => setCategoryDrawerOpen(true)}
                  type="button"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-sm text-left flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <span className={form.category ? "text-black font-medium" : "text-slate-500"}>
                    {form.category || "Select a category"}
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </button>
                <DrawerContent className="max-h-[80vh] flex flex-col">
                  <DrawerHeader className="sticky top-0 bg-white border-b border-slate-300 z-10">
                    <DrawerTitle>Select Service Category</DrawerTitle>
                  </DrawerHeader>
                  <div className="px-4 space-y-2 overflow-y-auto flex-1">
                    {SERVICE_CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          set("category", c);
                          setCategoryDrawerOpen(false);
                        }}
                        className={`w-full px-4 py-3 rounded-lg text-left text-sm transition-colors font-medium ${
                          form.category === c ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-muted"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </DrawerContent>
              </Drawer>
              <p className="text-xs text-muted-foreground mt-2">This determines which providers see and are notified about your job.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Job Title *</label>
              <input
                type="text"
                placeholder="e.g. Fix leaking kitchen sink"
                value={form.job_title}
                onChange={(e) => set("job_title", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-black text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-2 block">Descriptions</label>
              <div className="space-y-2 mb-3">
                {form.descriptions.map((desc, idx) => (
                  <div key={idx} className="flex gap-2">
                    <textarea
                      placeholder="Describe what needs to be done..."
                      value={desc}
                      onChange={(e) => updateDescription(idx, e.target.value)}
                      rows={2}
                      className="flex-1 px-4 py-3 rounded-xl border border-slate-300 bg-white text-black text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeDescription(idx)}
                      className="px-3 py-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addDescription}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Description
              </button>
            </div>
          </div>

          {/* Location and Schedule */}
          <div className="bg-white rounded-2xl border border-slate-300 p-5 space-y-4">
            <h2 className="font-heading font-bold text-sm text-black">Location and Schedule</h2>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Street Address *
              </label>
              <input
                type="text"
                placeholder="123 Main St"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-black text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">City *</label>
                <input
                  type="text"
                  placeholder="e.g. New York"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-black text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">State *</label>
                <input
                  type="text"
                  placeholder="e.g. NY"
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-black text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Zip Code *</label>
                <input
                  type="text"
                  placeholder="e.g. 10001"
                  value={form.zip}
                  onChange={(e) => set("zip", e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-black text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Date *
                </label>
                <DatePickerInput
                  value={form.preferred_date}
                  onChange={(val) => set("preferred_date", val)}
                  min={new Date().toISOString().split('T')[0]}
                  className="rounded-xl h-12 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Time
                </label>
                <Drawer open={timeDrawerOpen} onOpenChange={setTimeDrawerOpen}>
                  <button
                    onClick={() => setTimeDrawerOpen(true)}
                    type="button"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-black text-sm text-left flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <span>{form.preferred_time}</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <DrawerContent className="max-h-[60vh]">
                    <DrawerHeader className="sticky top-0 bg-white border-b border-slate-300 z-10">
                      <DrawerTitle>Select Time</DrawerTitle>
                    </DrawerHeader>
                    <div className="px-4 pb-6 space-y-2 overflow-y-auto">
                      {timeOptions.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            set("preferred_time", t);
                            setTimeDrawerOpen(false);
                          }}
                          className={`w-full px-4 py-3 rounded-lg text-left text-sm transition-colors font-medium ${
                            form.preferred_time === t ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-muted"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </DrawerContent>
                </Drawer>
              </div>
            </div>
          </div>

          {/* Photos */}
          <div className="bg-white rounded-2xl border border-slate-300 p-5 space-y-3">
            <h2 className="font-heading font-bold text-sm text-black">Photos</h2>
            <p className="text-xs text-slate-600">Add photos of what needs to be fixed so providers know what to expect.</p>
            <div className="flex flex-wrap gap-3">
              {photos.map((url, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors bg-white">
                {uploadingPhoto ? (
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Camera className="w-5 h-5 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">Add</span>
                  </>
                )}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="submit" className="flex-1 h-12 rounded-2xl font-heading font-bold text-base" disabled={submitting}>
              {submitting ? "Posting..." : "Post Job"}
            </Button>
            <Button type="button" variant="outline" className="flex-1 h-12 rounded-2xl font-heading font-bold" onClick={() => navigate("/bookings")}>
              Cancel
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
