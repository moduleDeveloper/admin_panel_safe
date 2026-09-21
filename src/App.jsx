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
const OtherMembershipPage = lazy(() => import('./pages/OtherMembershipPage'));
const MyFamilyPage = lazy(() => import('./pages/MyFamilyPage'));
const ThemePage = lazy(() => import('./pages/theme/ThemePage'));
const FeatureControlPage = lazy(() => import('./pages/FeatureControlPage'));
const SubFeatureControlPage = lazy(() => import('./pages/SubFeatureControlPage'));
const Features20Page = lazy(() => import('./pages/Features20Page'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const SocialMediaPage = lazy(() => import('./pages/SocialMediaPage'));
const WhatsappPage = lazy(() => import('./pages/whatsapp/WhatsappPage'));
const ServiceProviderPage = lazy(() => import('./pages/whatsapp/ServiceProviderPage'));
const WhatsappMediaPage = lazy(() => import('./pages/whatsapp/WhatsappMediaPage'));
const WhatsappTemplatePage = lazy(() => import('./pages/whatsapp/WhatsappTemplatePage'));
const WaCampPage = lazy(() => import('./pages/whatsapp/WaCampPage'));
const WaCampAudiencePage = lazy(() => import('./pages/whatsapp/WaCampAudiencePage'));
const BankDetailsPage = lazy(() => import('./pages/BankDetailsPage'));
const CreateVideoPage = lazy(() => import('./pages/CreateVideoPage'));
const LinkedTrustsPage = lazy(() => import('./pages/LinkedTrustsPage'));
const NominationsPage = lazy(() => import('./pages/NominationsPage'));
const MemberImportPage = lazy(() => import('./components/MemberImport'));
const SalesMarketingPage = lazy(() => import('./pages/SalesMarketingPage'));
const LeadManagementPage = lazy(() => import('./pages/LeadManagementPage'));
const LeadDetailsPage = lazy(() => import('./pages/LeadDetailsPage'));
const CampaignPage = lazy(() => import('./pages/CampaignPage'));
const AddLeadsPage = lazy(() => import('./pages/AddLeadsPage'));

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
          <Route path="/members/bulk-upload" element={<MemberImportPage />} />
          <Route path="/my-family" element={<MyFamilyPage />} />
          <Route path="/my-family/create_family_member" element={<MyFamilyPage />} />
          <Route path="/other-membership" element={<OtherMembershipPage />} />
          <Route path="/other-membership/create_other_membership" element={<OtherMembershipPage />} />
          <Route path="/other-sponsorship" element={<OtherMembershipPage />} />
          <Route path="/theme"        element={<ThemePage />} />
          <Route path="/feature-control" element={<FeatureControlPage />} />
          <Route path="/sub-feature-control" element={<SubFeatureControlPage />} />
          <Route path="/features-2-o" element={<Features20Page />} />
          <Route path="/user-management" element={<UserManagementPage />} />
          <Route path="/sales-marketing" element={<SalesMarketingPage />} />
          <Route path="/sales-marketing/campaign" element={<CampaignPage />} />
          <Route path="/sales-marketing/add-leads" element={<AddLeadsPage />} />
          <Route path="/sales-marketing/leads" element={<LeadManagementPage />} />
          <Route path="/sales-marketing/leads/details" element={<LeadDetailsPage />} />
          <Route path="/social-media" element={<SocialMediaPage />} />
          <Route path="/social-media/accounts-details" element={<SocialMediaPage />} />
          <Route path="/social-media/create" element={<SocialMediaPage />} />
          <Route path="/whatsapp" element={<WhatsappPage />} />
          <Route path="/whatsapp/service-provider" element={<ServiceProviderPage />} />
          <Route path="/whatsapp/service-provider/create" element={<ServiceProviderPage />} />
          <Route path="/whatsapp/service-provider/edit" element={<ServiceProviderPage />} />
          <Route path="/whatsapp/media" element={<WhatsappMediaPage />} />
          <Route path="/whatsapp/media/create" element={<WhatsappMediaPage />} />
          <Route path="/whatsapp/media/edit" element={<WhatsappMediaPage />} />
          <Route path="/whatsapp/template" element={<WhatsappTemplatePage />} />
          <Route path="/whatsapp/template/create" element={<WhatsappTemplatePage />} />
          <Route path="/whatsapp/template/edit" element={<WhatsappTemplatePage />} />
          <Route path="/whatsapp/campaign" element={<WaCampPage />} />
          <Route path="/whatsapp/campaign/create" element={<WaCampPage />} />
          <Route path="/whatsapp/campaign/edit" element={<WaCampPage />} />
          <Route path="/whatsapp/audience" element={<WaCampAudiencePage />} />
          <Route path="/company-details/bank-details" element={<BankDetailsPage />} />
          <Route path="/company-details/bank-details/create" element={<BankDetailsPage />} />
          <Route path="/company-details/bank-details/edit" element={<BankDetailsPage />} />
          <Route path="/video/create" element={<CreateVideoPage />} />
          <Route path="/linked-trusts" element={<LinkedTrustsPage />} />
          <Route path="/nominations" element={<NominationsPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
