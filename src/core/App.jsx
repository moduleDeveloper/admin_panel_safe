import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';

const LoginPage = lazy(() => import('../features/auth/pages/LoginPage'));
const OtpPage = lazy(() => import('../features/auth/pages/OtpPage'));
const SelectTrustPage = lazy(() => import('../features/company-details/pages/SelectTrustPage'));
const CreateTrustPage = lazy(() => import('../features/company-details/pages/CreateTrustPage'));
const Dashboard = lazy(() => import('../features/dashboard/pages/Dashboard'));
const TrusteesPage = lazy(() => import('../features/company-details/pages/TrusteesPage'));
const TrustDetails = lazy(() => import('../features/company-details/pages/TrustDetails'));
const OtherMembershipPage = lazy(() => import('../features/extra/pages/OtherMembershipPage'));
const MyFamilyPage = lazy(() => import('../features/extra/pages/MyFamilyPage'));
const ThemePage = lazy(() => import('../features/app-design/pages/theme/ThemePage'));
const FeatureControlPage = lazy(() => import('../features/menu/pages/FeatureControlPage'));
const SubFeatureControlPage = lazy(() => import('../features/menu/pages/SubFeatureControlPage'));
const Features20Page = lazy(() => import('../features/menu/pages/Features20Page'));
const UserManagementPage = lazy(() => import('../features/user-management/pages/UserManagementPage'));
const SocialMediaPage = lazy(() => import('../features/social-media/pages/SocialMediaPage'));
const WhatsappPage = lazy(() => import('../features/whatsapp/pages/WhatsappPage'));
const ServiceProviderPage = lazy(() => import('../features/whatsapp/pages/ServiceProviderPage'));
const WhatsappMediaPage = lazy(() => import('../features/whatsapp/pages/WhatsappMediaPage'));
const WhatsappTemplatePage = lazy(() => import('../features/whatsapp/pages/WhatsappTemplatePage'));
const WaCampPage = lazy(() => import('../features/whatsapp/pages/WaCampPage'));
const WaCampAudiencePage = lazy(() => import('../features/whatsapp/pages/WaCampAudiencePage'));
const BankDetailsPage = lazy(() => import('../features/company-details/pages/BankDetailsPage'));
const CreateVideoPage = lazy(() => import('../features/social-media/pages/CreateVideoPage'));
const LinkedTrustsPage = lazy(() => import('../features/company-details/pages/LinkedTrustsPage'));
const NominationsPage = lazy(() => import('../features/extra/pages/NominationsPage'));
const MemberImportPage = lazy(() => import('../features/user-management/components/MemberImport'));
const SalesMarketingPage = lazy(() => import('../features/sales-marketing/pages/SalesMarketingPage'));
const LeadManagementPage = lazy(() => import('../features/sales-marketing/pages/LeadManagementPage'));
const LeadDetailsPage = lazy(() => import('../features/sales-marketing/pages/LeadDetailsPage'));
const CampaignPage = lazy(() => import('../features/sales-marketing/pages/CampaignPage'));
const AddLeadsPage = lazy(() => import('../features/sales-marketing/pages/AddLeadsPage'));

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
