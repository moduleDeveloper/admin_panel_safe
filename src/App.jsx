import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const OtpPage = lazy(() => import('./pages/OtpPage'));
const SelectTrustPage = lazy(() => import('./pages/SelectTrustPage'));
const CreateTrustPage = lazy(() => import('./pages/CreateTrustPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TrusteesPage = lazy(() => import('./pages/TrusteesPage'));
const TrustDetails = lazy(() => import('./pages/TrustDetails'));
const SponsorsPage = lazy(() => import('./pages/SponsorsPage'));
const MembersPage = lazy(() => import('./pages/MembersPage'));
const MemberProfilePage = lazy(() => import('./pages/MemberProfilePage'));
const OtherMembershipPage = lazy(() => import('./pages/OtherMembershipPage'));
const MyFamilyPage = lazy(() => import('./pages/MyFamilyPage'));
const ExecutiveBodyPage = lazy(() => import('./pages/ExecutiveBodyPage'));
const GalleryPage = lazy(() => import('./pages/GalleryPage'));
const MarqueePage = lazy(() => import('./pages/MarqueePage'));
const NoticeboardPage = lazy(() => import('./pages/NoticeboardPage'));
const NoticeDetailPage = lazy(() => import('./pages/NoticeDetailPage'));
const NotificationPage = lazy(() => import('./pages/NotificationPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const EventDetailPage = lazy(() => import('./pages/EventDetailPage'));
const FacilitiesPage = lazy(() => import('./pages/FacilitiesPage'));
const ContactUsPage = lazy(() => import('./pages/ContactUsPage'));
const DonationsPage = lazy(() => import('./pages/DonationsPage'));
const ThemePage = lazy(() => import('./pages/ThemePage'));
const FeatureControlPage = lazy(() => import('./pages/FeatureControlPage'));
const SubFeatureControlPage = lazy(() => import('./pages/SubFeatureControlPage'));
const Features20Page = lazy(() => import('./pages/Features20Page'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const SocialMediaPage = lazy(() => import('./pages/SocialMediaPage'));
const ProductPage = lazy(() => import('./pages/ProductPage'));
const CreateVideoPage = lazy(() => import('./pages/CreateVideoPage'));
const ShareAppPage = lazy(() => import('./pages/ShareAppPage'));
const AchievementsPage = lazy(() => import('./pages/AchievementsPage'));
const LinkedTrustsPage = lazy(() => import('./pages/LinkedTrustsPage'));
const NominationsPage = lazy(() => import('./pages/NominationsPage'));
const MemberImportPage = lazy(() => import('./components/MemberImport'));

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense fallback={<div style={{ padding: 16 }}>Loading module...</div>}>
        <Routes>
          <Route path="/"             element={<Navigate to="/login" replace />} />
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/verify-otp"   element={<OtpPage />} />
          <Route path="/select-trust" element={<SelectTrustPage />} />
          <Route path="/create-trust" element={<CreateTrustPage />} />
          <Route path="/dashboard"    element={<Dashboard />} />
          <Route path="/trust-details" element={<TrustDetails />} />
          <Route path="/trustees"     element={<TrusteesPage />} />
          <Route path="/sponsor"      element={<SponsorsPage />} />
          <Route path="/sponsor/create_sponsor" element={<SponsorsPage />} />
          <Route path="/sponsor/edit_sponsor" element={<SponsorsPage />} />
          <Route path="/sponsorts/edit_sponsor" element={<SponsorsPage />} />
          <Route path="/members"      element={<MembersPage />} />
          <Route path="/members/bulk-upload" element={<MemberImportPage />} />
          <Route path="/member"       element={<MembersPage />} />
          <Route path="/member/create_member" element={<MembersPage />} />
          <Route path="/member-profile" element={<MemberProfilePage />} />
          <Route path="/my-family" element={<MyFamilyPage />} />
          <Route path="/my-family/create_family_member" element={<MyFamilyPage />} />
          <Route path="/other-membership" element={<OtherMembershipPage />} />
          <Route path="/other-membership/create_other_membership" element={<OtherMembershipPage />} />
          <Route path="/other-sponsorship" element={<OtherMembershipPage />} />
          <Route path="/executive-body" element={<ExecutiveBodyPage />} />
          <Route path="/gallery"      element={<GalleryPage />} />
          <Route path="/gallery/:folderId" element={<GalleryPage />} />
          <Route path="/marquee"      element={<MarqueePage />} />
          <Route path="/noticeboard"  element={<NoticeboardPage />} />
          <Route path="/noticeboard/create_notice" element={<NoticeboardPage />} />
          <Route path="/noticeboard/edit_details" element={<NoticeboardPage />} />
          <Route path="/noticeboard/:noticeId" element={<NoticeDetailPage />} />
          <Route path="/notification" element={<NotificationPage />} />
          <Route path="/events"       element={<EventsPage />} />
          <Route path="/events/create_event" element={<EventsPage />} />
          <Route path="/events/edit_details" element={<EventsPage />} />
          <Route path="/events/:eventId" element={<EventDetailPage />} />
          <Route path="/facilities" element={<FacilitiesPage />} />
          <Route path="/facilities/create_facility" element={<FacilitiesPage />} />
          <Route path="/facilities/edit_details" element={<FacilitiesPage />} />
          <Route path="/contact-us" element={<ContactUsPage />} />
          <Route path="/contact-us/create_contact" element={<ContactUsPage />} />
          <Route path="/contact-us/edit_details" element={<ContactUsPage />} />
          <Route path="/donations" element={<DonationsPage />} />
          <Route path="/donations/create_donation" element={<DonationsPage />} />
          <Route path="/donations/edit_details" element={<DonationsPage />} />
          <Route path="/theme"        element={<ThemePage />} />
          <Route path="/feature-control" element={<FeatureControlPage />} />
          <Route path="/sub-feature-control" element={<SubFeatureControlPage />} />
          <Route path="/features-2-o" element={<Features20Page />} />
          <Route path="/user-management" element={<UserManagementPage />} />
          <Route path="/social-media" element={<SocialMediaPage />} />
          <Route path="/social-media/accounts-details" element={<SocialMediaPage />} />
          <Route path="/social-media/create" element={<SocialMediaPage />} />
          <Route path="/social-media/product" element={<ProductPage />} />
          <Route path="/video/create" element={<CreateVideoPage />} />
          <Route path="/share-app" element={<ShareAppPage />} />
          <Route path="/achievements" element={<AchievementsPage />} />
          <Route path="/achievements/create_achievement" element={<AchievementsPage />} />
          <Route path="/achievements/edit_details" element={<AchievementsPage />} />
          <Route path="/linked-trusts" element={<LinkedTrustsPage />} />
          <Route path="/nominations" element={<NominationsPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
