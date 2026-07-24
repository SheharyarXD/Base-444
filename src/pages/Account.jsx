import { useState, useEffect } from "react";
import { Mail, LogOut, Shield, CalendarCheck, Star, Home, Briefcase, Building2, Bell, Moon, Lock, Camera, DollarSign, Share2, Copy, Check, FileText, X, ExternalLink, ChevronDown } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";

export default function Account() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ bookings: 0, reviews: 0 });
  const [loading, setLoading] = useState(true);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [contactInfo, setContactInfo] = useState({ business_name: "", contact_phone: "", contact_email: "" });
  const [savingContact, setSavingContact] = useState(false);
  const [contractor, setContractor] = useState(null);
  const [savingContractor, setSavingContractor] = useState(false);
  const [businessOwner, setBusinessOwner] = useState(null);
  const [savingBusinessOwner, setSavingBusinessOwner] = useState(false);
  const [address, setAddress] = useState(null);
  const [savingAddress, setSavingAddress] = useState(false);
  const [settings, setSettings] = useState({
    emailNotifications: true,
    smsNotifications: false,
    darkMode: false,
    twoFactor: false,
  });
  const [copied, setCopied] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [selectedUserType, setSelectedUserType] = useState("");
  const [userTypeDrawerOpen, setUserTypeDrawerOpen] = useState(false);

  const [ein, setEin] = useState("");
  const [savingEin, setSavingEin] = useState(false);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const shareableLink = `${appUrl}?ref=${user?.id}`;

  useEffect(() => {
    async function load() {
      try {
        const me = await base44.auth.me();
        setUser(me);
        if (me?.user_type) {
          setSelectedUserType(me.user_type);
        }

        try {
          const [bookings, reviews] = await Promise.all([
            base44.entities.Booking.filter({ created_by: me.email }, "-created_date", 100),
            base44.entities.Review.filter({ created_by: me.email }, "-created_date", 100),
          ]);
          setStats({ bookings: bookings.length, reviews: reviews.length });
        } catch (err) {
          console.error('Failed to load stats:', err);
          setStats({ bookings: 0, reviews: 0 });
        }
        
        // Load contractor profile if user is a contractor
        try {
          const contractors = await base44.entities.Contractor.filter({ created_by: me.email });
          if (contractors.length > 0) {
            setContractor(contractors[0]);
          }
          setEin(me.ein || "");
          setContactInfo({
            business_name: me.business_name || "",
            contact_phone: me.contact_phone || "",
            contact_email: me.contact_email || me.email || "",
          });
        } catch (err) {
          console.error('Failed to load contractor:', err);
        }
        
        // Load business owner zip code if user is business owner
        if (me.user_type === "Business Owner") {
          setBusinessOwner({ zip_code: me.business_zip_code || "" });
        }
        
        // Load address for homeowner or business owner
        if (["Homeowner", "Business Owner"].includes(me.user_type)) {
          setAddress({
            street: me.address_street || "",
            city: me.address_city || "",
            state: me.address_state || "",
            zip: me.address_zip || "",
          });
        }
      } catch (err) {
        console.error('Error loading account:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.auth.updateMe({ photo: file_url });
    setUser(prev => ({ ...prev, photo: file_url }));
    setUploadingPhoto(false);
  }



  function toggleSetting(key) {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function saveContractorPreferences() {
    if (!contractor?.id) {
      // No real category/rate on file yet — send them through the proper
      // setup flow instead of silently fabricating a "General Handyman"/$0
      // profile, which used to happen here.
      toast.error("Please complete your category & rate first.");
      navigate("/contractor-setup");
      return;
    }
    setSavingContractor(true);
    await base44.entities.Contractor.update(contractor.id, {
      preferred_zip_code: contractor?.preferred_zip_code || "",
      preferred_miles_distance: contractor?.preferred_miles_distance || null,
    });
    toast.success("Preferences saved!");
    setSavingContractor(false);
  }

  async function saveContactInfo() {
    setSavingContact(true);
    await base44.auth.updateMe({
      business_name: contactInfo.business_name,
      contact_phone: contactInfo.contact_phone,
      contact_email: contactInfo.contact_email,
    });
    setUser(prev => ({ ...prev, ...contactInfo }));
    toast.success("Contact info saved!");
    setSavingContact(false);
  }

  async function saveEin() {
    if (!ein.trim()) {
      toast.error("Please enter an EIN");
      return;
    }
    setSavingEin(true);
    try {
      await base44.auth.updateMe({ ein: ein.trim() });
      setUser(prev => ({ ...prev, ein: ein.trim() }));
      toast.success("EIN saved! You can now verify with DPOR.");
    } catch (err) {
      console.error('Failed to save EIN:', err);
      toast.error("Failed to save EIN. Please try again.");
    } finally {
      setSavingEin(false);
    }
  }

  function openDporVerification() {
    if (!ein.trim()) {
      toast.error("Please save your EIN first");
      return;
    }
    // Open DPOR verification link (placeholder - update with actual DPOR URL)
    window.open(`https://dpor.maryland.gov`, "_blank");
  }

  async function saveBusinessOwnerZip() {
    if (!businessOwner) return;
    setSavingBusinessOwner(true);
    await base44.auth.updateMe({ business_zip_code: businessOwner.zip_code });
    setUser(prev => ({ ...prev, business_zip_code: businessOwner.zip_code }));
    toast.success("Zip code saved!");
    setSavingBusinessOwner(false);
  }

  async function saveAddress() {
    if (!address) return;
    setSavingAddress(true);
    await base44.auth.updateMe({
      address_street: address.street,
      address_city: address.city,
      address_state: address.state,
      address_zip: address.zip,
    });
    setUser(prev => ({
      ...prev,
      address_street: address.street,
      address_city: address.city,
      address_state: address.state,
      address_zip: address.zip,
    }));
    toast.success("Address saved!");
    setSavingAddress(false);
  }

  function copyShareLink() {
    navigator.clipboard.writeText(shareableLink);
    setCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-20 w-20 rounded-full bg-muted mx-auto" />
          <div className="h-6 w-1/3 bg-muted rounded mx-auto" />
          <div className="h-32 bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-12">

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-secondary rounded-2xl p-1">
          {(["Contractor", "Handyman"].includes(user?.user_type)
            ? ["profile", "contact", "share", "settings"]
            : ["profile", "share", "settings"]
          ).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-heading font-semibold capitalize transition-all ${
                activeTab === tab ? "bg-card shadow-sm text-foreground" : "bg-secondary text-foreground/60 hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "profile" && (
          <>
            {/* Profile Card */}
            <div className="bg-card rounded-2xl border border-border p-8 text-center">
              <div className="relative w-20 h-20 mx-auto mb-4">
                {user?.photo ? (
                  <img src={user.photo} alt="Profile" className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="font-heading font-bold text-3xl text-primary">
                      {user?.full_name?.charAt(0) || "?"}
                    </span>
                  </div>
                )}
                {user?.user_type === "Realtor" && (
                  <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-heading font-bold flex items-center justify-center border-2 border-background">
                    R
                  </span>
                )}
                <label className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card border-2 border-border flex items-center justify-center cursor-pointer hover:bg-secondary transition-colors">
                  {uploadingPhoto ? (
                    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                </label>
              </div>
              <h1 className="font-heading font-bold text-xl text-foreground">{user?.full_name || "User"}</h1>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
                <Mail className="w-3.5 h-3.5" />
                {user?.email}
              </p>
              {user?.role && (
                <div className="mt-3">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold bg-primary/10 text-primary px-3 py-1 rounded-full">
                    <Shield className="w-3 h-3" />
                    {user.role}
                  </span>
                </div>
              )}
            </div>

            {/* Stats */}
             <div className="grid grid-cols-2 gap-4">
               <div className="bg-card rounded-2xl border border-border p-5 text-center">
                 <CalendarCheck className="w-6 h-6 text-primary mx-auto mb-2" />
                 <p className="font-heading font-bold text-2xl text-foreground">{stats.bookings}</p>
                 <p className="text-xs text-muted-foreground">Bookings</p>
               </div>
               <div className="bg-card rounded-2xl border border-border p-5 text-center">
                 <Star className="w-6 h-6 text-primary mx-auto mb-2" />
                 <p className="font-heading font-bold text-2xl text-foreground">{stats.reviews}</p>
                 <p className="text-xs text-muted-foreground">Reviews</p>
               </div>
             </div>

            {/* User Type Display */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h2 className="font-heading font-bold text-sm text-foreground mb-2">User Type</h2>
              <p className="text-xs text-muted-foreground mb-3">Select your account type</p>
              <button
                onClick={() => setUserTypeDrawerOpen(true)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <span className={selectedUserType ? "text-foreground" : "text-muted-foreground"}>
                  {selectedUserType || "Select type"}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
              <Drawer open={userTypeDrawerOpen} onOpenChange={setUserTypeDrawerOpen}>
                <DrawerContent>
                  <DrawerHeader>
                    <DrawerTitle className="font-heading">Select User Type</DrawerTitle>
                  </DrawerHeader>
                  <div className="px-4 pb-8 space-y-2">
                    {["Homeowner", "Realtor", "Business Owner", "Contractor", "Handyman"].map((type) => (
                      <button
                        key={type}
                        onClick={async () => {
                          setUserTypeDrawerOpen(false);
                          setSelectedUserType(type);
                          try {
                            await base44.functions.invoke('updateUserType', { user_type: type });
                            toast.success("User type updated to " + type + "!");
                            setTimeout(() => window.location.reload(), 1000);
                          } catch (err) {
                            console.error('Failed to update user type:', err);
                            toast.error("Failed to update user type: " + (err.message || "Please try again"));
                            setSelectedUserType(user?.user_type || "");
                          }
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-sm font-semibold transition-colors ${
                          selectedUserType === type
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {type}
                        {selectedUserType === type && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </DrawerContent>
              </Drawer>
            </div>

             {/* Contractor & Handyman Preferences */}
            {["Contractor", "Handyman"].includes(user?.user_type) && (
              <>
                <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-heading font-bold text-sm text-foreground">{user?.user_type === "Handyman" ? "Service Preferences" : "Work Preferences"}</h2>
                    <Link to="/contractor-setup" className="text-xs font-semibold text-primary hover:underline shrink-0">
                      Edit category &amp; rate →
                    </Link>
                  </div>
                  {contractor?.category && (
                    <p className="text-xs text-muted-foreground">
                      Currently listed as <strong className="text-foreground">{contractor.category}</strong>
                      {contractor.hourly_rate > 0 && <> · ${contractor.hourly_rate}/hr</>}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">Set your preferred service area</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Preferred Zip Code</label>
                      <input
                        type="text"
                        value={contractor?.preferred_zip_code || ""}
                        onChange={(e) => setContractor({ ...contractor, preferred_zip_code: e.target.value })}
                        placeholder="e.g. 10001"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Willing to Travel (miles)</label>
                      <input
                        type="number"
                        value={contractor?.preferred_miles_distance || ""}
                        onChange={(e) => setContractor({ ...contractor, preferred_miles_distance: e.target.value ? parseFloat(e.target.value) : "" })}
                        placeholder="e.g. 10"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <Button
                      onClick={saveContractorPreferences}
                      disabled={savingContractor}
                      className="w-full rounded-xl"
                    >
                      {savingContractor ? "Saving..." : "Save Preferences"}
                    </Button>
                  </div>
                </div>

                {/* EIN & DPOR Verification */}
                <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
                  <h2 className="font-heading font-bold text-sm text-foreground">Professional Verification</h2>
                  <p className="text-xs text-muted-foreground">Link your license number for DPOR verification</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">{user?.user_type === "Handyman" ? "Entity ID" : "License Number"}</label>
                      <input
                        type="text"
                        value={ein}
                        onChange={(e) => setEin(e.target.value.slice(0, 30))}
                        placeholder={user?.user_type === "Handyman" ? "e.g. EIN123456" : "e.g. 2705123456"}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      {user?.user_type === "Handyman" && user?.ein ? (
                        <p className="text-xs mt-1">
                          Saved:{" "}
                          <a
                            href="https://cis.scc.virginia.gov/EntitySearch/Index"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary font-semibold underline hover:opacity-80"
                          >
                            {user.ein}
                          </a>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">{user?.user_type === "Handyman" ? "Your entity ID is used for verification" : "Your license number is used for contractor verification only"}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={saveEin}
                        disabled={savingEin}
                        className="flex-1 rounded-xl"
                      >
                        {savingEin ? "Saving..." : "Save License"}
                      </Button>
                      <Button
                       onClick={() => {
                         if (user?.user_type === "Handyman") {
                           if (!ein.trim() && !user?.ein) {
                             toast.error("Please enter and save your Entity ID first");
                             return;
                           }
                           const entityId = user?.ein || ein.trim();
                           navigator.clipboard.writeText(entityId).catch(() => {});
                           toast.success(`Entity ID "${entityId}" copied — paste it in the search box`, { duration: 6000 });
                           window.open("https://cis.scc.virginia.gov/EntitySearch/Index", "_blank", "noopener,noreferrer");
                         } else {
                           openDporVerification();
                         }
                       }}
                       variant="outline"
                       className="flex-1 rounded-xl gap-2"
                      >
                       <ExternalLink className="w-4 h-4" />
                       Verify
                      </Button>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                      <p className="text-xs text-blue-900 dark:text-blue-100">
                        💡 <strong>Tip:</strong> Verification helps build trust with customers and increases your booking rate.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Address for Homeowner and Business Owner */}
            {["Homeowner", "Business Owner"].includes(user?.user_type) && (
             <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
               <h2 className="font-heading font-bold text-sm text-foreground">Address</h2>
               <p className="text-xs text-muted-foreground">Your home or business location</p>
               <div className="space-y-3">
                 <div>
                   <label className="text-xs font-semibold text-muted-foreground mb-1 block">Street Address</label>
                   <input
                     type="text"
                     value={address?.street || ""}
                     onChange={(e) => setAddress({ ...address, street: e.target.value })}
                     placeholder="e.g. 123 Main St"
                     className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                   />
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                   <div>
                     <label className="text-xs font-semibold text-muted-foreground mb-1 block">City</label>
                     <input
                       type="text"
                       value={address?.city || ""}
                       onChange={(e) => setAddress({ ...address, city: e.target.value })}
                       placeholder="e.g. New York"
                       className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                     />
                   </div>
                   <div>
                     <label className="text-xs font-semibold text-muted-foreground mb-1 block">State</label>
                     <input
                       type="text"
                       value={address?.state || ""}
                       onChange={(e) => setAddress({ ...address, state: e.target.value })}
                       placeholder="e.g. NY"
                       className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                     />
                   </div>
                 </div>
                 <div>
                   <label className="text-xs font-semibold text-muted-foreground mb-1 block">Zip Code</label>
                   <input
                     type="text"
                     value={address?.zip || ""}
                     onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                     placeholder="e.g. 10001"
                     className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                   />
                 </div>
                 <Button
                   onClick={saveAddress}
                   disabled={savingAddress}
                   className="w-full rounded-xl"
                 >
                   {savingAddress ? "Saving..." : "Save Address"}
                 </Button>
               </div>
             </div>
            )}
          </>
        )}

        {activeTab === "contact" && (
          <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <h2 className="font-heading font-bold text-sm text-foreground">Contact Information</h2>
            <p className="text-xs text-muted-foreground">This info may be shared with customers when you accept a job</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Business Name</label>
                <input
                  type="text"
                  value={contactInfo.business_name}
                  onChange={(e) => setContactInfo(prev => ({ ...prev, business_name: e.target.value }))}
                  placeholder="e.g. Smith's Plumbing LLC"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Contact Phone</label>
                <input
                  type="tel"
                  value={contactInfo.contact_phone}
                  onChange={(e) => setContactInfo(prev => ({ ...prev, contact_phone: e.target.value }))}
                  placeholder="e.g. (555) 123-4567"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Contact Email</label>
                <input
                  type="email"
                  value={contactInfo.contact_email}
                  onChange={(e) => setContactInfo(prev => ({ ...prev, contact_email: e.target.value }))}
                  placeholder="e.g. contact@mycompany.com"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <Button onClick={saveContactInfo} disabled={savingContact} className="w-full rounded-xl">
                {savingContact ? "Saving..." : "Save Contact Info"}
              </Button>
            </div>
          </div>
        )}

        {activeTab === "share" && (
          <div className="space-y-4">
            {/* Import Contacts */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Share2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-heading font-bold text-base">Share via Contacts</h2>
                  <p className="text-xs text-muted-foreground">Send your Linked link to phone contacts</p>
                </div>
              </div>

              <button
                onClick={async () => {
                  if (!navigator.contacts) {
                    toast.error("Contacts API not supported on this device");
                    return;
                  }
                  try {
                    const contacts = await navigator.contacts.select(
                      ['name', 'tel', 'email'],
                      { multiple: true }
                    );
                    if (contacts.length > 0) {
                      toast.success(`Selected ${contacts.length} contact${contacts.length !== 1 ? 's' : ''} to share with`);
                    }
                  } catch (err) {
                    if (err.name !== 'AbortError') {
                      toast.error("Could not access contacts");
                    }
                  }
                }}
                className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-heading font-bold text-sm hover:bg-primary/90 transition-colors"
              >
                <Share2 className="w-4 h-4 inline mr-2" />
                Choose Contacts to Share
              </button>
              <p className="text-xs text-muted-foreground mt-3">Your app will request permission to access your device contacts. You can choose which contacts to share your link with.</p>
            </div>

            {/* Shareable Link */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Share2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-heading font-bold text-base">Share Linked</h2>
                  <p className="text-xs text-muted-foreground">Invite others to use the platform</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-2 block">Your Shareable Link</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shareableLink}
                      readOnly
                      className="flex-1 px-3 py-2.5 rounded-lg border border-border bg-secondary text-sm focus:outline-none"
                    />
                    <button
                      onClick={copyShareLink}
                      className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-heading font-bold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Share this link with others to invite them to join Linked</p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    💡 <strong>Tip:</strong> Share your link on social media, with colleagues, or directly via email to grow your network on Linked.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-4">
            <div className="bg-card rounded-2xl border border-border divide-y divide-border">
              {[
                { key: "emailNotifications", icon: Bell, label: "Email Notifications", desc: "Receive booking updates via email" },
                { key: "smsNotifications", icon: Bell, label: "SMS Notifications", desc: "Receive booking updates via text" },
                { key: "darkMode", icon: Moon, label: "Dark Mode", desc: "Use dark theme across the app" },
                { key: "twoFactor", icon: Lock, label: "Two-Factor Auth", desc: "Extra security for your account" },
              ].map(({ key, icon: Icon, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                  <Switch checked={settings[key]} onCheckedChange={() => toggleSetting(key)} className="touch-target" />
                </div>
              ))}
            </div>

            {/* Danger Zone */}
            <div className="bg-card rounded-2xl border border-destructive/20 divide-y divide-border">
              <div className="p-4">
                <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-1">Danger Zone</p>
              </div>
              <div className="flex items-center justify-between p-5">
                <div>
                  <p className="font-semibold text-sm text-foreground">Cancel Subscription</p>
                  <p className="text-xs text-muted-foreground">End your active plan at the next billing cycle</p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/5 min-h-[44px]">
                      Cancel Plan
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="font-heading">Cancel Subscription?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">Your plan will remain active until the end of the current billing period, then it will not renew.</p>
                    <div className="flex gap-3 pt-2">
                      <Button variant="outline" className="flex-1" disabled={cancellingSubscription} onClick={async () => {
                        setCancellingSubscription(true);
                        try {
                          await base44.functions.invoke('cancelSubscription', {});
                          toast.success('Subscription cancelled successfully!');
                          setUser(prev => ({ ...prev, realtor_pro: null }));
                        } catch (error) {
                          toast.error('Failed to cancel subscription');
                        } finally {
                          setCancellingSubscription(false);
                        }
                      }}>{cancellingSubscription ? 'Cancelling...' : 'Confirm Cancel'}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="flex items-center justify-between p-5">
                <div>
                  <p className="font-semibold text-sm text-foreground">Delete Account</p>
                  <p className="text-xs text-muted-foreground">Permanently remove your account and all data</p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/5 min-h-[44px]">
                      Delete
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="font-heading">Delete Account?</DialogTitle>
                    </DialogHeader>
                    <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-2">
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">⚠️ Cancel your subscription first</p>
                      <p className="text-xs text-amber-700 dark:text-amber-300">If you have an active plan, please cancel it first to avoid future charges. Use the "Cancel Subscription" option above.</p>
                    </div>
                    <p className="text-sm text-muted-foreground">This action is <strong>permanent</strong> and cannot be undone. All your bookings, reviews, messages, and data will be deleted immediately.</p>
                    <div className="flex gap-3 pt-2">
                      <Button variant="outline" className="flex-1" onClick={() => {}}>Cancel</Button>
                      <Button variant="destructive" className="flex-1" disabled={deletingAccount} onClick={async () => {
                        setDeletingAccount(true);
                        try {
                          await base44.functions.invoke('deleteUserAccount', {});
                          toast.success('Account deleted successfully');
                          setTimeout(() => base44.auth.logout(), 1500);
                        } catch (error) {
                          toast.error('Failed to delete account');
                        } finally {
                          setDeletingAccount(false);
                        }
                      }}>{deletingAccount ? 'Deleting...' : 'Yes, Delete My Account'}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <Link to="/disclaimer" className="block">
          <div className="bg-card rounded-2xl border border-border p-5 flex items-center gap-3 hover:border-primary/30 transition-colors">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Terms and Disclaimer</p>
              <p className="text-xs text-muted-foreground">View legal terms and platform policies</p>
            </div>
          </div>
        </Link>

        {/* Logout */}
        <Button
          variant="outline"
          className="w-full rounded-2xl h-12 font-heading font-semibold"
          onClick={() => base44.auth.logout()}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </motion.div>
    </div>
  );
}