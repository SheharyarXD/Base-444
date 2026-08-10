import { useState, useEffect, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { base44 } from '@/api/base44Client';
import Layout from './components/Layout';
import SplashScreen from './components/SplashScreen';
import { withSuspense, Home, ContractorDetail, BookContractor, Bookings, BookingDetail, Account, RealtorDashboard, Plans, ThankYou, JobsMap, PostJob, Disclaimer, PageNotFound, Onboarding, Inbox, ContractorSetup } from './App-lazy';
import { useLocation } from 'react-router-dom';

const AuthenticatedApp = () => {
  const location = useLocation();
  const [splashDone, setSplashDone] = useState(false);
  const { isLoadingAuth, isLoadingPublicSettings, authError, user } = useAuth();
  // Gates new providers into /contractor-setup until they have a real
  // category + rate, instead of dropping them straight onto /jobs-map with
  // an incomplete (or Account.jsx's silent "General Handyman" / $0) profile.
  const [providerProfile, setProviderProfile] = useState({ loading: true, complete: true });

  useEffect(() => {
    if (!user || !["Contractor", "Handyman"].includes(user.user_type)) {
      setProviderProfile({ loading: false, complete: true });
      return;
    }
    let cancelled = false;
    setProviderProfile((prev) => ({ ...prev, loading: true }));
    base44.entities.Contractor.filter({ created_by: user.email }).then((contractors) => {
      if (cancelled) return;
      const c = contractors[0];
      setProviderProfile({ loading: false, complete: !!(c && c.hourly_rate > 0 && c.category) });
    }).catch(() => {
      if (!cancelled) setProviderProfile({ loading: false, complete: true });
    });
    return () => { cancelled = true; };
  }, [user?.id, user?.user_type]);

  useEffect(() => {
    if (user && !splashDone) {
      const timer = setTimeout(() => setSplashDone(true), 4000);
      return () => clearTimeout(timer);
    }
  }, [user, splashDone]);

  if (!user) {
    if (isLoadingPublicSettings || isLoadingAuth) {
      return (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
        </div>
      );
    }
    if (authError?.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return <SplashScreen onDone={() => {}} hasAccount={false} />;
  }

  if (!splashDone) {
    return <SplashScreen onDone={() => setSplashDone(true)} hasAccount={true} />;
  }

  const PageLoader = () => (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
    </div>
  );

  // Onboarding.jsx (the "I am a..." account-type picker) used to be imported
  // but never actually routed to or rendered anywhere in this file — a brand
  // new user's user_type simply stayed unset forever, silently defaulting to
  // Homeowner-shaped behavior in places like PostJob.jsx with no explicit
  // choice ever made. Gated here, ahead of every route, the same way the
  // splash screen already gates the whole app — once user_type is set (via
  // updateUserType, which refuses to run a second time) this never shows
  // again, consistent with "account type is fixed at signup."
  if (!user.user_type) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Onboarding />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={
            <Suspense fallback={<PageLoader />}>
              {["Contractor", "Handyman"].includes(user?.user_type)
                ? (providerProfile.loading
                    ? <PageLoader />
                    : <Navigate to={providerProfile.complete ? "/jobs-map" : "/contractor-setup"} replace />)
                : <Home />}
            </Suspense>
          } />
          <Route path="/contractor-setup" element={
            ["Contractor", "Handyman"].includes(user?.user_type)
              ? <Suspense fallback={<PageLoader />}><ContractorSetup /></Suspense>
              // Contractor.create's RLS only checks created_by, not user_type —
              // a server-side user_type condition wasn't added here since it'd
              // be an untested change to a live RLS rule (see the final audit's
              // RLS review for the reasoning). This client route guard is the
              // enforcement for "only providers can create a provider profile"
              // today; documented as UI-level, not RLS-level, defense.
              : <Navigate to="/" replace />
          } />
          {/* Browse.jsx (a full contractor-browsing directory) retired per
              Phase 2's "map-driven discovery only, no contractor browsing"
              requirement — redirects rather than 404s in case anything still
              links here. */}
          <Route path="/browse" element={<Navigate to="/jobs-map" replace />} />
          <Route path="/contractor/:id" element={<Suspense fallback={<PageLoader />}><ContractorDetail /></Suspense>} />
          <Route path="/book/:id" element={<Suspense fallback={<PageLoader />}><BookContractor /></Suspense>} />
          <Route path="/bookings" element={<Suspense fallback={<PageLoader />}><Bookings /></Suspense>} />
          <Route path="/booking/:id" element={<Suspense fallback={<PageLoader />}><BookingDetail /></Suspense>} />
          <Route path="/account" element={<Suspense fallback={<PageLoader />}><Account /></Suspense>} />
          <Route path="/realtor-dashboard" element={<Suspense fallback={<PageLoader />}><RealtorDashboard /></Suspense>} />
          <Route path="/plans" element={<Suspense fallback={<PageLoader />}><Plans /></Suspense>} />
          <Route path="/thank-you" element={<Suspense fallback={<PageLoader />}><ThankYou /></Suspense>} />
          <Route path="/jobs-map" element={<Suspense fallback={<PageLoader />}><JobsMap /></Suspense>} />
          <Route path="/post-job" element={<Suspense fallback={<PageLoader />}><PostJob /></Suspense>} />
          <Route path="/disclaimer" element={<Suspense fallback={<PageLoader />}><Disclaimer /></Suspense>} />
          <Route path="/inbox" element={<Suspense fallback={<PageLoader />}><Inbox /></Suspense>} />
          <Route path="*" element={<PageNotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

function App() {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    
    if (mediaQuery.matches) {
      document.documentElement.classList.add('dark');
    }
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
  }, []);

  useEffect(() => {
    if (navigator.standalone === true) {
      document.documentElement.classList.add('pwa');
    }
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App