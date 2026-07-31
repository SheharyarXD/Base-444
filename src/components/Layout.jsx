import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Home, CalendarCheck, User, Menu, X, Building2, Map, MessageCircle } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";

// Contractor browsing is intentionally not in primary nav — the app runs off
// the map/job-request flow instead. The route and page still exist; they're
// just not linked to from anywhere right now.
const allNavItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/bookings", label: "Bookings", icon: CalendarCheck },
  { path: "/inbox", label: "Inbox", icon: MessageCircle },
  { path: "/account", label: "Account", icon: User },
];

const contractorNavItems = [
  { path: "/jobs-map", label: "Jobs Map", icon: Map },
  { path: "/bookings", label: "My Jobs", icon: CalendarCheck },
  { path: "/inbox", label: "Inbox", icon: MessageCircle },
  { path: "/account", label: "Account", icon: User },
];


const rootPaths = ["/", "/browse", "/jobs-map", "/bookings", "/inbox", "/account", "/realtor-dashboard", "/plans"];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isRealtor, setIsRealtor] = useState(false);
  const [userType, setUserType] = useState(null);
  const isContractor = userType === "Contractor" || userType === "Handyman";
  const navItems = isContractor ? contractorNavItems : allNavItems;
  const isRootPath = rootPaths.includes(location.pathname);

  const [tabHistory, setTabHistory] = useState(() => {
    return allNavItems.reduce((acc, item) => {
      acc[item.path] = [item.path];
      return acc;
    }, {});
  });
  const prevPathRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(me => {
      setIsRealtor(me?.user_type === "Realtor");
      setUserType(me?.user_type || null);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const currentTab = navItems.find(item => location.pathname === item.path)?.path || location.pathname;
    const prevPath = prevPathRef.current;
    prevPathRef.current = location.pathname;

    if (currentTab && navItems.some(item => item.path === currentTab)) {
      setTabHistory(prev => {
        const newHistory = { ...prev };
        if (prevPath && navItems.some(item => item.path === prevPath)) {
          const prevTab = navItems.find(item => item.path === prevPath)?.path;
          newHistory[prevTab] = prev[prevTab] || [prevTab];
        }
        if (!newHistory[currentTab]) newHistory[currentTab] = [currentTab];
        if (newHistory[currentTab][newHistory[currentTab].length - 1] !== location.pathname) {
          newHistory[currentTab] = [...newHistory[currentTab], location.pathname];
        }
        return newHistory;
      });
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background mb-20 md:mb-0" style={{
      backgroundImage: 'url(https://media.base44.com/images/public/69f0913914dfde6303da8626/643810e1b_generated_image.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed'
    }}>
      <div className="absolute inset-0 bg-black/40 pointer-events-none fixed z-0" />
      {/* Desktop Header */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            {isRootPath ? (
              <button
                onClick={() => {
                  navigate("/");
                  window.scrollTo(0, 0);
                }}
                className="p-2 rounded-lg hover:bg-secondary transition-colors md:hidden"
                aria-label="Go home"
              >
                <div className="rounded-lg bg-primary w-8 h-8 flex items-center justify-center">
                  <span className="text-primary-foreground font-heading font-bold text-xs">I</span>
                </div>
              </button>
            ) : (
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-lg hover:bg-secondary transition-colors md:hidden"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            )}

            {isRootPath ? (
              <Link to="/" onClick={() => window.scrollTo(0, 0)} className="hidden md:flex items-center gap-2">
                <div className="rounded-xl bg-primary w-16 h-10 flex items-center justify-center">
                  <span className="text-primary-foreground font-heading font-bold text-sm tracking-tight">Linked</span>
                </div>
              </Link>
            ) : (
              <button
                onClick={() => navigate(-1)}
                className="hidden md:flex p-2 rounded-lg hover:bg-secondary transition-colors items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
            )}

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {[...navItems, ...(isRealtor ? [{ path: "/realtor-dashboard", label: "Properties", icon: Building2 }] : [])].filter(Boolean).map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => item.path === '/' && window.scrollTo(0, 0)}
                          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                          }`}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.label}
                        </Link>
                );
              })}
            </nav>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-secondary ml-auto"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden border-t border-border overflow-hidden"
            >
              <nav className="px-4 py-3 space-y-1">
                {[...navItems, ...(isRealtor ? [{ path: "/realtor-dashboard", label: "Properties", icon: Building2 }] : [])].filter(Boolean).map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                       key={item.path}
                       to={item.path}
                       onClick={() => {
                         setMobileMenuOpen(false);
                         if (item.path === '/') window.scrollTo(0, 0);
                       }}
                       className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                         isActive
                           ? "bg-primary text-primary-foreground"
                           : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                       }`}
                     >
                      <item.icon className="w-5 h-5" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content */}
      <main className="relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
       <div className="flex items-center justify-around py-2 px-2">
         {[...navItems, ...(isRealtor ? [{ path: "/realtor-dashboard", label: "Properties", icon: Building2 }] : [])].filter(Boolean).map((item) => {
           const isActive = location.pathname === item.path;
           const handleClick = (e) => {
             e.preventDefault();
             if (isActive) {
               setTabHistory(prev => ({ ...prev, [item.path]: [item.path] }));
               navigate(item.path);
             } else {
               const history = tabHistory[item.path];
               const lastPath = history && history.length > 0 ? history[history.length - 1] : item.path;
               navigate(lastPath);
             }
           };
           return (
             <button
               key={item.path}
               onClick={(e) => {
                 handleClick(e);
                 if (item.path === '/') window.scrollTo(0, 0);
               }}
               className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all touch-target ${
                 isActive ? "text-primary" : "text-muted-foreground"
               }`}
             >
               <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
               <span className="text-[10px] font-medium">{item.label}</span>
             </button>
           );
         })}
       </div>
      </nav>
    </div>
  );
}