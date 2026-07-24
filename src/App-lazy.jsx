import { lazy, Suspense } from 'react';

// Lazy load all pages for code splitting
const Home = lazy(() => import('./pages/Home'));
const Browse = lazy(() => import('./pages/Browse'));
const ContractorDetail = lazy(() => import('./pages/ContractorDetail'));
const BookContractor = lazy(() => import('./pages/BookContractor'));
const Bookings = lazy(() => import('./pages/Bookings'));
const BookingDetail = lazy(() => import('./pages/BookingDetail'));
const Account = lazy(() => import('./pages/Account'));
const RealtorDashboard = lazy(() => import('./pages/RealtorDashboard'));
const Plans = lazy(() => import('./pages/Plans'));
const ThankYou = lazy(() => import('./pages/ThankYou'));
const JobsMap = lazy(() => import('./pages/JobsMap'));
const PostJob = lazy(() => import('./pages/PostJob'));
const Disclaimer = lazy(() => import('./pages/Disclaimer'));
const PageNotFound = lazy(() => import('./lib/PageNotFound'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Inbox = lazy(() => import('./pages/Inbox'));
const ContractorSetup = lazy(() => import('./pages/ContractorSetup'));

// Loading fallback
function PageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
    </div>
  );
}

// Wrapper to apply suspense to routes
export function withSuspense(Component) {
  return (props) => (
    <Suspense fallback={<PageLoader />}>
      <Component {...props} />
    </Suspense>
  );
}

export {
  Home,
  Browse,
  ContractorDetail,
  BookContractor,
  Bookings,
  BookingDetail,
  Account,
  RealtorDashboard,
  Plans,
  ThankYou,
  JobsMap,
  PostJob,
  Disclaimer,
  PageNotFound,
  Onboarding,
  Inbox,
  ContractorSetup,
  PageLoader,
};