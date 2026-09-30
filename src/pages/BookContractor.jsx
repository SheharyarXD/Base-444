import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, FileText, User, ImagePlus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import DatePickerInput from "../components/DatePickerInput";
import { ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { geocodeAddress } from "@/lib/geo";

export default function BookContractor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contractor, setContractor] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Stable across retries so a resubmission cannot create two bookings.
  const idempotencyKeyRef = useRef(null);
  const [timeDrawerOpen, setTimeDrawerOpen] = useState(false);

  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    job_title: "",
    job_description: "",
    address: "",
    preferred_date: "",
    preferred_time: "Flexible",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    notes: "",
    photo_urls: [],
  });

  useEffect(() => {
    async function load() {
      const [c, me] = await Promise.all([
        base44.entities.Contractor.get(id),
        base44.auth.me(),
      ]);
      setContractor(c);
      setUser(me);
      setForm((f) => ({
        ...f,
        customer_name: me.full_name || "",
        customer_email: me.email || "",
      }));
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleImageUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const urls = [];
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    const newUrls = [...uploadedImages, ...urls];
    setUploadedImages(newUrls);
    setForm((f) => ({ ...f, photo_urls: newUrls }));
    setUploading(false);
  }

  function removeImage(url) {
    const newUrls = uploadedImages.filter((u) => u !== url);
    setUploadedImages(newUrls);
    setForm((f) => ({ ...f, photo_urls: newUrls }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);

    try {
      // `category` (not just contractor_category) is the field matching,
      // routing, and acceptance now key off of for every booking, direct or
      // open — see acceptJob/entry.ts and notifyContractorsOfNewJob/entry.ts.
      const coords = await geocodeAddress(form.address);
      if (!coords) {
        toast.error("We couldn't locate that address on the map — you can still send the request.");
      }

      // Same gated path as the open-job form: a direct booking is still a
      // job post and costs the same credit. Creating the record here
      // directly would sidestep the entitlement check entirely. The priority
      // add-on is applied server-side there too.
      const key = idempotencyKeyRef.current || crypto.randomUUID();
      idempotencyKeyRef.current = key;

      const res = await base44.functions.invoke("createJobPost", {
        idempotencyKey: key,
        job: {
          ...form,
          contractor_id: contractor.id,
          contractor_name: contractor.name,
          contractor_category: contractor.category,
          category: contractor.category,
          ...(coords ? { job_lat: coords.lat, job_lng: coords.lng } : {}),
        },
      });

      if (res?.data?.error) {
        if (res.data.code === "no_entitlement") {
          toast.error("You need a post credit to send this request.");
          navigate("/plans?need=post");
          return;
        }
        toast.error(res.data.error);
        return;
      }

      toast.success("Booking request sent!");
      navigate("/bookings");
    } catch (err) {
      console.error('Error creating booking:', err);
      if (err?.response?.data?.code === "no_entitlement") {
        toast.error("You need a post credit to send this request.");
        navigate("/plans?need=post");
        return;
      }
      toast.error(err?.response?.data?.error || "Failed to send booking request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/2 bg-muted rounded" />
          <div className="h-64 bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12">
      <Link to={`/contractor/${id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back to {contractor?.name}
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-foreground mb-2">
          Book {contractor?.name}
        </h1>
        <p className="text-muted-foreground text-sm mb-8">
          {contractor?.category} · ${contractor?.hourly_rate}/hr
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Job Details */}
          <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <h2 className="font-heading font-bold text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Job Details
            </h2>

            <div>
              <Label className="text-xs font-semibold">Job Title *</Label>
              <Input
                placeholder="e.g. Fix leaky kitchen faucet"
                value={form.job_title}
                onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                className="mt-1.5 rounded-xl"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea
                placeholder="Describe what needs to be done..."
                value={form.job_description}
                onChange={(e) => setForm({ ...form, job_description: e.target.value })}
                className="mt-1.5 rounded-xl min-h-[100px]"
              />
            </div>

            {/* Photo Upload */}
            <div>
              <Label className="text-xs font-semibold">Photos of the Job</Label>
              <p className="text-xs text-muted-foreground mb-2">Help the contractor understand the scope of work</p>
              <div className="flex flex-wrap gap-3">
                {uploadedImages.map((url) => (
                  <div key={url} className="relative w-24 h-24 rounded-xl overflow-hidden border border-border group">
                    <img src={url} alt="Job photo" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(url)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <label className={`w-24 h-24 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary hover:bg-secondary/50 transition-all ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                  {uploading ? (
                    <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="w-5 h-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Add photo</span>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <h2 className="font-heading font-bold text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Schedule
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Preferred Date *</Label>
                <DatePickerInput
                  value={form.preferred_date}
                  onChange={(val) => setForm({ ...form, preferred_date: val })}
                  min={new Date().toISOString().split("T")[0]}
                  className="mt-1.5 rounded-xl h-10 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Preferred Time</Label>
                <Drawer open={timeDrawerOpen} onOpenChange={setTimeDrawerOpen}>
                  <button
                    type="button"
                    onClick={() => setTimeDrawerOpen(true)}
                    className="mt-1.5 w-full px-4 py-3 rounded-xl border border-input bg-background text-sm text-left flex items-center justify-between hover:bg-secondary/50 transition-colors"
                  >
                    <span>{form.preferred_time}</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <DrawerContent className="max-h-[60vh]">
                    <DrawerHeader className="sticky top-0 bg-background border-b border-border z-10">
                      <DrawerTitle>Select Time</DrawerTitle>
                    </DrawerHeader>
                    <div className="px-4 pb-8 space-y-2 overflow-y-auto" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
                      {["Morning (8am-12pm)", "Afternoon (12pm-4pm)", "Evening (4pm-8pm)", "Flexible"].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setForm({ ...form, preferred_time: t }); setTimeDrawerOpen(false); }}
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

          {/* Location */}
          <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <h2 className="font-heading font-bold text-base flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Location
            </h2>
            <div>
              <Label className="text-xs font-semibold">Address *</Label>
              <Input
                placeholder="123 Main St, City, State"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="mt-1.5 rounded-xl"
                required
              />
            </div>
          </div>

          {/* Contact */}
          <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <h2 className="font-heading font-bold text-base flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Your Info
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Name</Label>
                <Input
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  className="mt-1.5 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Phone</Label>
                <Input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={form.customer_phone}
                  onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                  className="mt-1.5 rounded-xl"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Additional Notes</Label>
              <Textarea
                placeholder="Any special instructions..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="mt-1.5 rounded-xl"
              />
            </div>
          </div>



          <Button
            type="submit"
            className="w-full rounded-2xl h-14 font-heading font-bold text-base"
            disabled={submitting}
          >
            {submitting ? "Sending Request..." : "Confirm Booking"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}