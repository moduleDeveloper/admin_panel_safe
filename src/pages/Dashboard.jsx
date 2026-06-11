import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Dashboard.css';
import { fetchTrustDetails } from '../services/authService';
import { warmupTrustData } from '../services/warmupService';
import { fetchNoticeboardByTrust } from '../services/noticeboardService';
import { fetchEventsByTrust } from '../services/eventsService';
import { fetchNotificationsByTrustId } from '../services/notificationsService';
import { fetchDashboardByTrustId } from '../services/dashboardService';
import Sidebar from '../components/Sidebar';

// ── Export reusable icon renderer component ───────────────────────────────────
export function FeatureIconRenderer({ icon_url, size = 26, className = '' }) {
  const rawIcon = icon_url?.trim() || '';
  const decodedIcon = rawIcon
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

  // 1. emoji or short text stored in icon_url (≤ 4 chars = emoji)
  if (decodedIcon && decodedIcon.length <= 4 && !decodedIcon.startsWith('http') && !decodedIcon.startsWith('/') && !decodedIcon.startsWith('data:')) {
    return (
      <span style={{ fontSize: size, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {decodedIcon}
      </span>
    );
  }

  // 2. Raw SVG markup stored in DB
  if (decodedIcon && decodedIcon.includes('<svg')) {
    // Ensure SVG has white fill and stroke for visibility
    const enhancedSvg = decodedIcon
      .replace(/<svg([^>]*)>/i, `<svg$1 width="${size}" height="${size}" fill="white" stroke="white">`)
      .replace(/stroke="[^"]*"/g, 'stroke="white"')
      .replace(/fill="[^"]*"/g, 'fill="white"');

    return (
      <span
        className={`qp-icon-svg ${className}`}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: enhancedSvg }}
      />
    );
  }

  // 3. Full URL / data URL — render as image
  if (
    decodedIcon &&
    (
      decodedIcon.startsWith('http') ||
      decodedIcon.startsWith('/') ||
      decodedIcon.startsWith('data:image') ||
      decodedIcon.startsWith('blob:')
    )
  ) {
    return (
      <img
        src={decodedIcon}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: 5, objectFit: 'cover' }}
        onError={e => { e.target.style.display = 'none'; }}
      />
    );
  }

  return null;
}

// ── Module cards ──────────────────────────────────────────────────────────────
const MODULE_CARDS = [
  {
    id: 'card-trust',
    label: 'Trust',
    description: 'Manage trustees & trust details',
    route: '/trustees',
    gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
        <path d="M16 2L29 9V23L16 30L3 23V9L16 2Z" fill="rgba(255,255,255,0.25)" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M16 9L13 17H19L16 23" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'card-logo',
    label: 'Logo',
    description: 'Manage app name, subheading and logo',
    route: '/trustees',
    gradient: 'linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.15)" />
        <circle cx="8.5" cy="8.5" r="1.6" fill="white" />
        <polyline points="21 15 16 10 5 21" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'card-sponsor',
    label: 'Sponsor',
    description: 'Manage sponsors & partnerships',
    route: '/sponsor',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" fill="rgba(255,255,255,0.2)"/>
      </svg>
    ),
  },
  {
    id: 'card-members',
    label: 'Members',
    description: 'Manage trust members & registrations',
    route: '/members',
    temporarilyDeactivated: true,
    deactivationText: 'Temporarily Deactivated',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3.2" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.16)"/>
        <path d="M4 18c0-2.8 2.46-5 5.5-5S15 15.2 15 18" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="17.5" cy="9" r="2.2" stroke="white" strokeWidth="1.8"/>
        <path d="M15.5 17.2c.55-1.62 1.96-2.7 4-2.7" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'card-bulk-members-upload',
    label: 'Bulk Members Upload',
    description: 'Upload members in bulk from file',
    route: '/members/bulk-upload',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <path d="M12 16V5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8.8 8.2L12 5l3.2 3.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="4" y="14.5" width="16" height="5.5" rx="2" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.16)" />
      </svg>
    ),
  },
  {
    id: 'card-gallery',
    label: 'Gallery',
    description: 'Upload & manage photo albums',
    route: '/gallery',
    gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.15)"/>
        <circle cx="8.5" cy="8.5" r="1.8" fill="white"/>
        <polyline points="21 15 16 10 5 21" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'card-marquee',
    label: 'Marquee',
    description: 'Manage scrolling announcements',
    route: '/marquee',
    gradient: 'linear-gradient(135deg, #0891B2 0%, #6366F1 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="7" width="20" height="10" rx="2.5" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.15)"/>
        <line x1="6" y1="12" x2="18" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        <polyline points="14 9 18 12 14 15" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'card-notifications',
    label: 'Notifications',
    description: 'Manage alerts and notifications',
    route: '/notification',
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="18.5" cy="5.5" r="2.2" fill="rgba(255,255,255,0.9)" />
      </svg>
    ),
  },
  {
    id: 'card-user-management',
    label: 'User Management',
    description: 'Create users and assign feature permissions',
    route: '/user-management',
    gradient: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3" stroke="white" strokeWidth="1.8" />
        <path d="M4.2 18c0-2.8 2.25-5 5-5s5 2.2 5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="14.2" y="11" width="6.4" height="8" rx="1.3" stroke="white" strokeWidth="1.8" />
        <line x1="17.4" y1="13" x2="17.4" y2="17" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="15.4" y1="15" x2="19.4" y2="15" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'card-social-media',
    label: 'Social Media',
    description: 'Open social media module',
    route: '/social-media',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #6366F1 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5" width="17" height="14" rx="3" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.16)" />
        <circle cx="8.5" cy="12" r="1.5" fill="white" />
        <circle cx="12" cy="12" r="1.5" fill="white" />
        <circle cx="15.5" cy="12" r="1.5" fill="white" />
        <path d="M8.5 12h7" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'card-social-media-account-details',
    label: 'Social Media Account Details',
    description: 'Manage social media account details',
    route: '/social-media/accounts-details',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #4F46E5 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5" width="17" height="14" rx="3" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.16)" />
        <path d="M7.5 11.5h9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7.5 15h6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16.5" cy="8.5" r="1.5" fill="white" />
      </svg>
    ),
  },
  {
    id: 'card-create-video',
    label: 'Create a Video',
    description: 'Create and manage social media videos',
    route: '/video/create',
    gradient: 'linear-gradient(135deg, #0284C7 0%, #4338CA 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5" width="11.5" height="14" rx="2.2" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.16)" />
        <path d="M9.4 10.2l3.4 1.8-3.4 1.8v-3.6Z" fill="white" />
        <path d="M15.5 9.4l4.6-2.4v10l-4.6-2.4V9.4Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" fill="rgba(255,255,255,0.16)" />
      </svg>
    ),
  },
  {
    id: 'card-noticeboard',
    label: 'Noticeboard',
    description: 'View notices and open individual updates',
    route: '/noticeboard',
    gradient: 'linear-gradient(135deg, #7C3AED 0%, #3B82F6 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="5" width="16" height="12" rx="2" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.16)" />
        <line x1="8" y1="9" x2="16" y2="9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="8" y1="12" x2="14" y2="12" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="10" y1="17" x2="10" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="14" y1="17" x2="14" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'card-events',
    label: 'Events',
    description: 'Manage event updates and detail pages',
    route: '/events',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="17" rx="2.5" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.16)" />
        <line x1="3" y1="9" x2="21" y2="9" stroke="white" strokeWidth="1.8" />
        <line x1="8" y1="2.5" x2="8" y2="6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="16" y1="2.5" x2="16" y2="6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="14" r="1.4" fill="white" />
        <circle cx="12" cy="14" r="1.4" fill="white" />
        <circle cx="16" cy="14" r="1.4" fill="white" />
      </svg>
    ),
  },
  {
    id: 'card-facilities',
    label: 'Facilities',
    description: 'Manage facilities updates and details',
    route: '/facilities',
    gradient: 'linear-gradient(135deg, #14B8A6 0%, #0EA5E9 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.16)" />
        <path d="M8 16v-3h8v3M10 10h4M12 7v6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'card-contact-us',
    label: 'Contact Us',
    description: 'Manage contact details for facilities',
    route: '/contact-us',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <path d="M22 16.92v2a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 3.18 2 2 0 0 1 4.11 1h2a2 2 0 0 1 2 1.72c.12.9.33 1.78.63 2.62a2 2 0 0 1-.45 2.11L7.1 8.9a16 16 0 0 0 8 8l1.45-1.19a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.62.63A2 2 0 0 1 22 16.92Z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'card-share-app',
    label: 'Share App',
    description: 'Open share app module',
    route: '/share-app',
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <circle cx="6" cy="12" r="2.2" stroke="white" strokeWidth="1.8" />
        <circle cx="18" cy="6" r="2.2" stroke="white" strokeWidth="1.8" />
        <circle cx="18" cy="18" r="2.2" stroke="white" strokeWidth="1.8" />
        <path d="M8 11l7.6-4.1M8 13l7.6 4.1" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'card-achievements',
    label: 'Achievements',
    description: 'Open achievements module',
    route: '/achievements',
    gradient: 'linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="9" r="4.2" stroke="white" strokeWidth="1.8" />
        <path d="M8.8 13.4L7 21l5-2.3L17 21l-1.8-7.6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'card-theme',
    label: 'Theme',
    description: 'Preview and manage visual themes',
    route: '/theme',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #f97316 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <path d="M12 3C7.03 3 3 7.03 3 12c0 4.46 3.24 8.16 7.5 8.87.67.12 1.25-.42 1.25-1.1v-1.46c0-.78.63-1.41 1.41-1.41h1.21c3.67 0 6.63-2.96 6.63-6.63C21 6.25 17 3 12 3Z" fill="rgba(255,255,255,0.18)" stroke="white" strokeWidth="1.8"/>
        <circle cx="8" cy="10" r="1.2" fill="white" />
        <circle cx="11.5" cy="7.5" r="1.2" fill="white" />
        <circle cx="15.5" cy="9" r="1.2" fill="white" />
      </svg>
    ),
  },
  {
    id: 'card-feature-control',
    label: 'Feature Control',
    description: 'Manage feature access & visibility',
    route: '/feature-control',
    temporarilyDeactivated: true,
    deactivationText: 'Temporarily Deactivated',
    gradient: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="3" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.18)"/>
        <path d="M8 9h8M8 12h5M8 15h3" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="17.5" cy="15" r="2.2" stroke="white" strokeWidth="1.8"/>
      </svg>
    ),
  },
  {
    id: 'card-sub-feature-control',
    label: 'Sub Feature Control',
    description: 'Manage sub feature labels and visibility',
    route: '/sub-feature-control',
    temporarilyDeactivated: true,
    deactivationText: 'Temporarily Deactivated',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #1D4ED8 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="3" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.18)"/>
        <path d="M8 9h8M8 12h8M8 15h5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="17.5" cy="15" r="1.6" fill="white"/>
      </svg>
    ),
  },
  {
    id: 'card-features-2-o',
    label: 'Features2.O',
    description: 'Merged access for feature and sub feature controls',
    route: '/features-2-o',
    gradient: 'linear-gradient(135deg, #0F766E 0%, #2563EB 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="3" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.18)"/>
        <path d="M8 9h8M8 12h8M8 15h4" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="16.5" cy="15.5" r="2.8" stroke="white" strokeWidth="1.8"/>
      </svg>
    ),
  },
  {
    id: 'card-profile',
    label: 'Profile',
    description: 'View member profile details by member id',
    route: '/member-profile',
    gradient: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.3" stroke="white" strokeWidth="1.8" />
        <path d="M5 19c0-3.2 2.9-5.8 7-5.8s7 2.6 7 5.8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="16.3" y="14.5" width="5.2" height="5.2" rx="1.2" stroke="white" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    id: 'card-donations',
    label: 'Donations',
    description: 'Manage donation forms and entries',
    route: '/donations',
    gradient: 'linear-gradient(135deg, #16A34A 0%, #0EA5E9 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8.5" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.16)" />
        <path d="M12 7v10M9 10.2c0-1.3 1.2-2.2 3-2.2s3 .9 3 2.2c0 1.2-.96 1.8-2.4 2.15l-1.2.3C9.96 13 9 13.6 9 14.8 9 16.1 10.2 17 12 17s3-.9 3-2.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'card-executive-body',
    label: 'Executive Body',
    description: 'View trust executive members by role',
    route: '/executive-body',
    gradient: 'linear-gradient(135deg, #0F766E 0%, #2563EB 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="7.5" r="3" stroke="white" strokeWidth="1.8" />
        <path d="M6 19c0-2.9 2.7-5.2 6-5.2s6 2.3 6 5.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M4.5 9.5h3M16.5 9.5h3" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'card-nominations',
    label: 'Nominations',
    description: 'Manage nomination workflows and review entries',
    route: '/nominations',
    gradient: 'linear-gradient(135deg, #4F46E5 0%, #0EA5E9 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3.5" width="16" height="17" rx="2.6" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.16)" />
        <path d="M8 8.5h8M8 12h8M8 15.5h5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M15.5 5.5v4" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'card-linked-trusts',
    label: 'Linked Trusts',
    description: 'Search a mobile number and view all connected trusts',
    route: '/linked-trusts',
    gradient: 'linear-gradient(135deg, #4338CA 0%, #0EA5E9 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="4" width="7.5" height="16" rx="2" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.14)" />
        <rect x="13" y="4" width="7.5" height="16" rx="2" stroke="white" strokeWidth="1.8" fill="rgba(255,255,255,0.14)" />
        <path d="M11 8h2M11 12h2M11 16h2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

const APP_DESIGN_CARD_IDS = new Set(['card-logo', 'card-theme', 'card-feature-control', 'card-sub-feature-control', 'card-features-2-o']);
const COMPANY_DETAILS_CARD_IDS = new Set(['card-trust', 'card-social-media-account-details', 'card-create-video']);
const DASHBOARD_CARD_IDS = new Set();
const HOME_PAGE_CARD_IDS = new Set(['card-sponsor', 'card-gallery', 'card-marquee']);
const QUICK_ACTION_CARD_IDS = new Set(['card-profile', 'card-executive-body', 'card-noticeboard', 'card-events', 'card-facilities', 'card-donations', 'card-members', 'card-bulk-members-upload', 'card-achievements']);
const EXTRA_CARD_IDS = new Set(['card-linked-trusts', 'card-nominations']);
const MENU_MODULE_CARDS = [
  {
    id: 'card-notifications',
    label: 'Notifications',
    description: 'Manage alerts and notifications',
    route: '/notification',
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="18.5" cy="5.5" r="2.2" fill="rgba(255,255,255,0.9)" />
      </svg>
    ),
  },
  {
    id: 'card-share-app',
    label: 'Share App',
    description: 'Open share app module',
    route: '/share-app',
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <circle cx="6" cy="12" r="2.2" stroke="white" strokeWidth="1.8" />
        <circle cx="18" cy="6" r="2.2" stroke="white" strokeWidth="1.8" />
        <circle cx="18" cy="18" r="2.2" stroke="white" strokeWidth="1.8" />
        <path d="M8 11l7.6-4.1M8 13l7.6 4.1" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'menu-card-product',
    label: 'Product',
    description: 'Open product creation wizard',
    route: '/social-media/product',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <path d="M3 7.5L12 3l9 4.5-9 4.5L3 7.5Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M3 7.5V16.5L12 21l9-4.5V7.5" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 12v9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'menu-card-contact-us',
    label: 'Contact Us',
    description: 'Manage contact details',
    route: '/contact-us',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <path d="M22 16.92v2a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 3.18 2 2 0 0 1 4.11 1h2a2 2 0 0 1 2 1.72c.12.9.33 1.78.63 2.62a2 2 0 0 1-.45 2.11L7.1 8.9a16 16 0 0 0 8 8l1.45-1.19a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.62.63A2 2 0 0 1 22 16.92Z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'menu-card-my-family',
    label: 'My Family',
    description: 'Manage family details',
    route: '/my-family',
    gradient: 'linear-gradient(135deg, #14B8A6 0%, #0EA5E9 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="9" r="2.6" stroke="white" strokeWidth="1.8" />
        <circle cx="16.5" cy="9.5" r="2" stroke="white" strokeWidth="1.8" />
        <path d="M4.5 18c0-2.6 2.3-4.6 5.2-4.6s5.2 2 5.2 4.6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14.4 18c.36-1.46 1.5-2.5 3.2-2.8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'menu-card-other-membership',
    label: 'Other Membership',
    description: 'View other memberships',
    route: '/other-membership',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="5" width="16" height="14" rx="2.3" stroke="white" strokeWidth="1.8" />
        <path d="M8 10h8M8 14h5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

const NAV_SECTION_TITLES = {
  dashboard: 'Dashboard',
  menu: 'Menu',
  'company-details': 'Company Details',
  'app-design': 'App Design',
  'home-page': 'Home Page',
  'quick-actions': 'Quick Actions',
  extra: 'Extra',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const initials = (name = '') =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

const todayStr = new Date().toLocaleDateString('en-IN', {
  weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
});

// �� Feature card icon renderer ������������������������������������������������
// Priority: route-based SVG ? name-based SVG ? generic grid
function FeatureIcon({ flag }) {
  const { route } = flag;
  const label = (flag.display_name || flag.features?.name || '').toLowerCase().trim();

  // Route-based built-in SVGs
  const routeSVGs = {
    '/directory': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <ellipse cx="12" cy="5" rx="9" ry="3" stroke="white" strokeWidth="1.8" />
        <path d="M3 5c0 0 0 5 9 5s9-5 9-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M3 12c0 0 0 5 9 5s9-5 9-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="3" y1="5" x2="3" y2="19" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="21" y1="5" x2="21" y2="19" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    '/appointments': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="18" rx="3" stroke="white" strokeWidth="1.8" />
        <line x1="3" y1="9" x2="21" y2="9" stroke="white" strokeWidth="1.8" />
        <line x1="8" y1="2" x2="8" y2="6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="16" y1="2" x2="16" y2="6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 14l2.5 2.5L16 12" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    '/referrals': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    '/gallery': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="white" strokeWidth="1.8" />
        <circle cx="8.5" cy="8.5" r="1.5" stroke="white" strokeWidth="1.8" />
        <polyline points="21 15 16 10 5 21" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    '/members': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3" stroke="white" strokeWidth="1.8" />
        <path d="M4 19c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="17.5" cy="9" r="2.2" stroke="white" strokeWidth="1.8" />
        <path d="M15.5 18c.41-1.64 1.7-2.83 3.9-3" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    '/profiles': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="white" strokeWidth="1.8" />
        <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    '/messages': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    '/slots': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8" />
        <polyline points="12 6 12 12 16 14" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    '/trustees': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="7" r="4" stroke="white" strokeWidth="1.8" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    '/noticeboard': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    '/facilities': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="white" strokeWidth="1.8" />
        <path d="M8 16v-3h8v3M10 10h4M12 7v6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    '/contact-us': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M22 16.92v2a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 3.18 2 2 0 0 1 4.11 1h2a2 2 0 0 1 2 1.72c.12.9.33 1.78.63 2.62a2 2 0 0 1-.45 2.11L7.1 8.9a16 16 0 0 0 8 8l1.45-1.19a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.62.63A2 2 0 0 1 22 16.92Z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    '/reports': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <line x1="18" y1="20" x2="18" y2="10" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="12" y1="20" x2="12" y2="4" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="6" y1="20" x2="6" y2="14" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  };

  if (route && routeSVGs[route]) return routeSVGs[route];

  // Name-based icons for cards without routes (static, not from DB)
  const nameSVGs = {
    'vip login': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z" stroke="white" strokeWidth="1.8" />
        <path d="M7 10V8a5 5 0 0 1 10 0v2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="15" r="1.5" fill="white" />
        <path d="M10 15h1v2h2v-2h1" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    'opd schedule': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke="white" strokeWidth="1.8" />
        <line x1="3" y1="9" x2="21" y2="9" stroke="white" strokeWidth="1.8" />
        <line x1="9" y1="2" x2="9" y2="6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="15" y1="2" x2="15" y2="6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="9" cy="13" r="1.5" fill="white" />
        <circle cx="15" cy="13" r="1.5" fill="white" />
        <path d="M9 17l2.5 2.5L17 15" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    'appointment': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke="white" strokeWidth="1.8" />
        <line x1="3" y1="9" x2="21" y2="9" stroke="white" strokeWidth="1.8" />
        <line x1="9" y1="2" x2="9" y2="6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="15" y1="2" x2="15" y2="6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 14l2.5 2.5L16 12" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    'medical reports': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <line x1="18" y1="20" x2="18" y2="10" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="12" y1="20" x2="12" y2="4" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="6" y1="20" x2="6" y2="14" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="3" cy="3" r="0.5" fill="white" />
        <circle cx="21" cy="3" r="0.5" fill="white" />
        <path d="M3 20h18" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    'reports': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <line x1="18" y1="20" x2="18" y2="10" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="12" y1="20" x2="12" y2="4" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="6" y1="20" x2="6" y2="14" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M3 20h18" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    'patient referral': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="2.5" fill="white" />
      </svg>
    ),
    'referral': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    'noticeboard': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="5" width="16" height="12" rx="1.5" stroke="white" strokeWidth="1.8" />
        <line x1="8" y1="9" x2="16" y2="9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="8" y1="12" x2="14" y2="12" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="10" y1="17" x2="10" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="14" y1="17" x2="14" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    'directory': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <g stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          <line x1="18" y1="5" x2="22" y2="5" />
          <line x1="20" y1="3" x2="20" y2="7" />
        </g>
      </svg>
    ),
    'birthday wishes': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M9 4c0 1 1 2 1 3M15 4c0 1-1 2-1 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="4" y="9" width="16" height="10" rx="2" stroke="white" strokeWidth="1.8" />
        <path d="M4 12h16" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="15" r="1" fill="white" />
        <circle cx="12" cy="15" r="1" fill="white" />
        <circle cx="16" cy="15" r="1" fill="white" />
      </svg>
    ),
    'notifications': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="19" cy="5" r="3" fill="white" />
      </svg>
    ),
    'profile photo': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="6" width="17" height="12" rx="2.5" stroke="white" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="2.5" stroke="white" strokeWidth="1.8" />
        <path d="M7 6l1.5-2h7L17 6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    'my profile': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="white" strokeWidth="1.8" />
        <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    'gallery': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="white" strokeWidth="1.8" />
        <circle cx="8.5" cy="8.5" r="1.5" fill="white" />
        <polyline points="21 15 16 10 5 21" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    'messages': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="12" r="1.5" fill="white" />
        <circle cx="15" cy="12" r="1.5" fill="white" />
      </svg>
    ),
  };

  if (label && nameSVGs[label]) return nameSVGs[label];

  // Generic fallback — grid icon
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="white" strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="white" strokeWidth="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="white" strokeWidth="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="white" strokeWidth="1.8" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  // Data from SelectTrustPage navigation
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const trustId = trust?.id || null;
  const [latestTrust, setLatestTrust] = useState(null);
  const activeTrust = latestTrust?.id === trustId ? latestTrust : trust;
  const trustName = activeTrust?.name || trust?.name || 'No Trust Selected';

  const [searchFocused, setSearchFocused] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [liveNotices, setLiveNotices] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [dashboardStats, setDashboardStats] = useState({
    totalMembers: 0,
    appDownloads: 0,
    liveEvents: 0,
    panelUsers: 0,
    liveAppUsers: 0,
  });
  const [communityStats, setCommunityStats] = useState({
    postsOnSocialMedia: 0,
    galleryUploads: 0,
    announcementsSent: 0,
    referralActivities: 0,
  });
  const [governanceStats, setGovernanceStats] = useState({
    electedMembers: 0,
    committeeMembers: 0,
    vipPatronMembers: 0,
    total: 0,
  });
  const [memberGrowthSeries, setMemberGrowthSeries] = useState([0, 0, 0, 0, 0, 0]);
  const [activeUsersSeries, setActiveUsersSeries] = useState([0, 0, 0, 0, 0, 0]);
  const [liveFeed, setLiveFeed] = useState([]);

  const userInitials = initials(userName);
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'dashboard';
  const pageTitle = NAV_SECTION_TITLES[currentSidebarNavKey] || 'Dashboard';

  const scopedModules = useMemo(() => {
    if (currentSidebarNavKey === 'dashboard') {
      return MODULE_CARDS.filter((card) => DASHBOARD_CARD_IDS.has(card.id));
    }
    if (currentSidebarNavKey === 'menu') {
      return MENU_MODULE_CARDS;
    }
    if (currentSidebarNavKey === 'app-design') {
      return MODULE_CARDS.filter((card) => APP_DESIGN_CARD_IDS.has(card.id));
    }
    if (currentSidebarNavKey === 'company-details') {
      return MODULE_CARDS.filter((card) => COMPANY_DETAILS_CARD_IDS.has(card.id));
    }
    if (currentSidebarNavKey === 'home-page') {
      return MODULE_CARDS.filter((card) => HOME_PAGE_CARD_IDS.has(card.id));
    }
    if (currentSidebarNavKey === 'quick-actions') {
      return MODULE_CARDS.filter((card) => QUICK_ACTION_CARD_IDS.has(card.id));
    }
    if (currentSidebarNavKey === 'extra') {
      return MODULE_CARDS.filter((card) => EXTRA_CARD_IDS.has(card.id));
    }
    return MODULE_CARDS;
  }, [currentSidebarNavKey]);
  const hideModuleCards = scopedModules.length === 0;

  const filteredModules = useMemo(() => {
    const query = String(searchTerm || '').trim().toLowerCase();
    if (!query) return scopedModules;

    return scopedModules.filter((card) => {
      const label = String(card.label || '').toLowerCase();
      const description = String(card.description || '').toLowerCase();
      return label.includes(query) || description.includes(query);
    });
  }, [searchTerm, scopedModules]);
  const dashboardSummaryCards = [
    { label: 'Total Members', value: String(dashboardStats.totalMembers || 0), note: `${dashboardStats.totalMembers || 0} registered`, tone: 'violet' },
    { label: 'App Downloads', value: String(dashboardStats.appDownloads || 0), note: 'From panel data', tone: 'green' },
    { label: 'Live Events', value: String(dashboardStats.liveEvents || 0), note: 'Upcoming / active', tone: 'orange' },
    { label: 'Panel Users', value: String(dashboardStats.panelUsers || 0), note: 'Active on panel', tone: 'pink' },
    { label: 'Live App Users', value: String(dashboardStats.liveAppUsers || 0), note: 'Estimated', tone: 'cyan' },
  ];
  const formatDayMonth = (input) => {
    if (!input) return '--';
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return '--';
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const formatDisplayTime = (input) => {
    if (!input) return '--';
    if (typeof input === 'string' && input.includes(':')) {
      const [h = '0', m = '0'] = input.split(':');
      const d = new Date();
      d.setHours(Number(h), Number(m), 0, 0);
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return '--';
    return parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    let mounted = true;
    if (!trustId) return undefined;

    (async () => {
      const { data, error } = await fetchTrustDetails(trustId);
      if (!mounted || error || !data) return;
      setLatestTrust(data);
    })();

    return () => {
      mounted = false;
    };
  }, [trustId]);

  useEffect(() => {
    let cancelled = false;
    if (!trustId) return undefined;

    (async () => {
      const [noticesRes, eventsRes] = await Promise.all([
        fetchNoticeboardByTrust(trustId),
        fetchEventsByTrust(trustId),
      ]);
      if (cancelled) return;

      const notices = Array.isArray(noticesRes?.data) ? noticesRes.data : [];
      const events = Array.isArray(eventsRes?.data) ? eventsRes.data : [];

      setLiveNotices(
        notices.slice(0, 3).map((row) => ({
          title: String(row?.name || 'Untitled Notice'),
          priority: String(row?.status || 'normal').toLowerCase() === 'urgent' ? 'Urgent' : String(row?.status || 'Normal'),
          audience: String(row?.type || 'All Members'),
          time: formatDisplayTime(row?.created_at),
          expiry: row?.end_date ? new Date(row.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No expiry',
        }))
      );

      setUpcomingEvents(
        events
          .filter((row) => !row?.startEventDate || new Date(row.startEventDate).getTime() >= new Date().setHours(0, 0, 0, 0))
          .slice(0, 3)
          .map((row) => ({
            date: formatDayMonth(row?.startEventDate),
            name: String(row?.title || 'Untitled Event'),
            venue: String(row?.location || 'Venue not set'),
            status: row?.status ? String(row.status).replace(/_/g, ' ') : 'Upcoming',
          }))
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [trustId]);

  useEffect(() => {
    let cancelled = false;
    if (!trustId) return undefined;

    (async () => {
      const [eventsRes, noticesRes, notificationsRes, dashboardRes] = await Promise.all([
        fetchEventsByTrust(trustId),
        fetchNoticeboardByTrust(trustId),
        fetchNotificationsByTrustId(trustId),
        fetchDashboardByTrustId(trustId),
      ]);
      if (cancelled) return;

      const events = Array.isArray(eventsRes?.data) ? eventsRes.data : [];
      const notices = Array.isArray(noticesRes?.data) ? noticesRes.data : [];
      const notifications = Array.isArray(notificationsRes?.data) ? notificationsRes.data : [];
      const dashboardRow = dashboardRes?.data || null;

      setDashboardStats({
        totalMembers: Number(dashboardRow?.total_members ?? 0),
        appDownloads: Number(dashboardRow?.app_downloads ?? 0),
        liveEvents: Number(dashboardRow?.live_events ?? 0),
        panelUsers: Number(dashboardRow?.panel_users ?? 0),
        liveAppUsers: Number(dashboardRow?.live_app_users ?? 0),
      });
      setGovernanceStats({
        electedMembers: Number(dashboardRow?.elected_members ?? 0),
        committeeMembers: Number(dashboardRow?.committee_members ?? 0),
        vipPatronMembers: Number(dashboardRow?.vip_patron_members ?? 0),
        total: Number(dashboardRow?.total_members ?? 0),
      });
      setCommunityStats({
        postsOnSocialMedia: Number(dashboardRow?.posts_on_social_media ?? 0),
        galleryUploads: Number(dashboardRow?.gallery_uploads ?? 0),
        announcementsSent: Number(dashboardRow?.announcements_sent ?? 0),
        referralActivities: Number(dashboardRow?.referral_activities ?? 0),
      });
      setMemberGrowthSeries(Array(6).fill(Number(dashboardRow?.total_members ?? 0)));
      setActiveUsersSeries(Array(6).fill(Number(dashboardRow?.live_app_users ?? 0)));

      const notificationFeed = notifications.slice(0, 5).map((item) => ({
        title: item?.title ? String(item.title) : 'Notification sent',
        subtitle: item?.message ? String(item.message) : 'Trust notification update',
        time: formatDisplayTime(item?.created_at),
        ts: item?.created_at ? new Date(item.created_at).getTime() : 0,
      }));

      const noticeFeed = notices.slice(0, 5).map((item) => ({
        title: item?.name ? `Notice: ${item.name}` : 'Notice updated',
        subtitle: item?.description ? String(item.description).slice(0, 60) : 'Noticeboard entry updated',
        time: formatDisplayTime(item?.created_at),
        ts: item?.created_at ? new Date(item.created_at).getTime() : 0,
      }));

      const eventsFeed = events.slice(0, 5).map((item) => ({
        title: item?.title ? `Event: ${item.title}` : 'Event updated',
        subtitle: item?.location ? String(item.location) : 'Event details updated',
        time: formatDisplayTime(item?.created_at || item?.startEventDate),
        ts: item?.created_at
          ? new Date(item.created_at).getTime()
          : (item?.startEventDate ? new Date(item.startEventDate).getTime() : 0),
      }));

      const mergedFeed = [...notificationFeed, ...noticeFeed, ...eventsFeed]
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 6)
        .map(({ title, subtitle, time }) => ({ title, subtitle, time }));
      setLiveFeed(mergedFeed);
    })();

    return () => {
      cancelled = true;
    };
  }, [trustId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (trustId) {
      window.sessionStorage.setItem('admin:activeTrustId', String(trustId));
    }
  }, [trustId]);

  useEffect(() => {
    if (!trustId) return undefined;
    let cancelled = false;
    let timeoutId = null;

    const runWarmup = () => {
      if (cancelled) return;
      warmupTrustData(trustId);
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(runWarmup, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    timeoutId = window.setTimeout(runWarmup, 250);
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [trustId]);

  // If no trust is linked, redirect
  useEffect(() => {
    if (!trustId) {
      navigate('/select-trust', { state: location.state, replace: true });
    }
  }, [trustId, navigate, location.state]);

  if (!trustId) return null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="dash-root">
      <Sidebar
        trustName={trustName}
        onDashboard={() =>
          navigate('/dashboard', {
            state: {
              userName,
              trust: activeTrust,
              superuserId,
              sidebarNavKey: 'dashboard',
            },
          })
        }
        onLogout={() => navigate('/login')}
      />

      {/* ═══════════════════════════════════════════
          MAIN CONTENT
      ═══════════════════════════════════════════ */}
      <main className="dash-main">

        {/* Top Bar */}
        <header className="dash-topbar">
          <div className="topbar-left">
            <h1 className="page-title">{pageTitle}</h1>
            <p className="page-subtitle">
              Hi, <strong>{userName}</strong> 👋 &nbsp;·&nbsp; {todayStr}
            </p>
          </div>

          <div className="topbar-right">
            <div className={`search-box ${searchFocused ? 'focused' : ''}`}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                className="search-input"
                id="dash-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
              <span className="search-kbd">⌘K</span>
            </div>

            <button className="topbar-icon-btn" title="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="icon-dot" />
            </button>

            <div className="avatar-wrap">
              <div className="avatar-btn">{userInitials}</div>
              <div className="avatar-online" />
            </div>
          </div>
        </header>

        {/* ─── Page content ─── */}
        <div className="dash-content">

          {/* ──── Trust Badge ──── */}
          <div className="trust-badge-container">
            <div 
              className="trust-badge"
              onClick={() =>
                navigate('/trust-details', {
                  state: {
                    trustId,
                    trustName: activeTrust?.name,
                    userName,
                    trust: activeTrust,
                    superuserId,
                    sidebarNavKey: currentSidebarNavKey,
                    returnTo: '/dashboard',
                  },
                })
              }
              role="button"
              tabIndex={0}
            >
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <path d="M16 2L29 9V23L16 30L3 23V9L16 2Z" fill="url(#trustGradBadge)" />
                <path d="M16 8L12 18H20L16 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <defs>
                  <linearGradient id="trustGradBadge" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6366F1" /><stop offset="1" stopColor="#8B5CF6" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="trust-badge-text">{activeTrust?.name || 'No Trust'}</span>
            </div>
          </div>

          {currentSidebarNavKey === 'dashboard' && (
            <section className="dp-wrap">
              <div className="dp-head">
                <h2>Overview Dashboard</h2>
                <p>Key highlights for {activeTrust?.name || 'your trust'}</p>
              </div>

              <div className="dp-kpis">
                {dashboardSummaryCards.map((item) => (
                  <article key={item.label} className={`dp-kpi dp-${item.tone}`}>
                    <div className="dp-kpi-title">{item.label}</div>
                    <div className="dp-kpi-value">{item.value}</div>
                    <div className="dp-kpi-note">{item.note}</div>
                  </article>
                ))}
              </div>

              <div className="dp-grid">
                <article className="dp-card">
                  <div className="dp-card-head">
                    <h3>Governance Overview</h3>
                    <span>{governanceStats.total} total</span>
                  </div>
                  <div className="dp-donut-row gov">
                    <div className="dp-donut gov">
                      <strong>{governanceStats.total}</strong>
                      <span>Total Members</span>
                    </div>
                    <div className="dp-list gov">
                      <div className="dp-list-row">
                        <div className="dp-list-meta"><span className="dot purple" /> Elected Members</div>
                        <b>{governanceStats.electedMembers}</b>
                      </div>
                      <div className="dp-meter"><span style={{ width: `${governanceStats.total ? (governanceStats.electedMembers / governanceStats.total) * 100 : 0}%` }} className="meter-purple" /></div>

                      <div className="dp-list-row">
                        <div className="dp-list-meta"><span className="dot gold" /> Committee Members</div>
                        <b>{governanceStats.committeeMembers}</b>
                      </div>
                      <div className="dp-meter"><span style={{ width: `${governanceStats.total ? (governanceStats.committeeMembers / governanceStats.total) * 100 : 0}%` }} className="meter-gold" /></div>

                      <div className="dp-list-row">
                        <div className="dp-list-meta"><span className="dot green" /> VIP / Patron Members</div>
                        <b>{governanceStats.vipPatronMembers}</b>
                      </div>
                      <div className="dp-meter"><span style={{ width: `${governanceStats.total ? (governanceStats.vipPatronMembers / governanceStats.total) * 100 : 0}%` }} className="meter-green" /></div>
                    </div>
                  </div>
                </article>

                <article className="dp-card">
                  <div className="dp-card-head">
                    <h3>Community Engagement</h3>
                  </div>
                  <div className="dp-metric-list">
                    <div><span>Posts on Social Media</span><b>{communityStats.postsOnSocialMedia}</b></div>
                    <div><span>Gallery Uploads</span><b>{communityStats.galleryUploads}</b></div>
                    <div><span>Announcements Sent</span><b>{communityStats.announcementsSent}</b></div>
                    <div><span>Referral Activities</span><b>{communityStats.referralActivities}</b></div>
                  </div>
                </article>

                <article className="dp-card">
                  <div className="dp-card-head">
                    <h3>Live Activity Feed</h3>
                    <button type="button">View all</button>
                  </div>
                  <div className="dp-feed">
                    {liveFeed.length === 0 && <div className="dp-empty-note">No live activity found.</div>}
                    {liveFeed.map((item) => (
                      <div key={`${item.title}-${item.time}`} className="dp-feed-item">
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.subtitle}</span>
                        </div>
                        <time>{item.time}</time>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <div className="dp-charts">
                <article className="dp-chart-card">
                  <h3>Member Growth (Last 6 Months)</h3>
                  <div className="dp-line-chart">
                    <svg className="dp-line-svg" viewBox="0 0 520 180" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6f58ff" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#6f58ff" stopOpacity="0.04" />
                        </linearGradient>
                        <linearGradient id="growthBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7c6bff" />
                          <stop offset="100%" stopColor="#a79cff" />
                        </linearGradient>
                      </defs>
                      <rect x="52" y={Math.max(20, 170 - ((memberGrowthSeries[0] || 0) * 2))} width="36" height={Math.min(150, (memberGrowthSeries[0] || 0) * 2)} rx="8" fill="url(#growthBar)" opacity="0.9" />
                      <rect x="126" y={Math.max(20, 170 - ((memberGrowthSeries[1] || 0) * 2))} width="36" height={Math.min(150, (memberGrowthSeries[1] || 0) * 2)} rx="8" fill="url(#growthBar)" opacity="0.9" />
                      <rect x="200" y={Math.max(20, 170 - ((memberGrowthSeries[2] || 0) * 2))} width="36" height={Math.min(150, (memberGrowthSeries[2] || 0) * 2)} rx="8" fill="url(#growthBar)" opacity="0.9" />
                      <rect x="274" y={Math.max(20, 170 - ((memberGrowthSeries[3] || 0) * 2))} width="36" height={Math.min(150, (memberGrowthSeries[3] || 0) * 2)} rx="8" fill="url(#growthBar)" opacity="0.9" />
                      <rect x="348" y={Math.max(20, 170 - ((memberGrowthSeries[4] || 0) * 2))} width="36" height={Math.min(150, (memberGrowthSeries[4] || 0) * 2)} rx="8" fill="url(#growthBar)" opacity="0.9" />
                      <rect x="422" y={Math.max(20, 170 - ((memberGrowthSeries[5] || 0) * 2))} width="36" height={Math.min(150, (memberGrowthSeries[5] || 0) * 2)} rx="8" fill="url(#growthBar)" opacity="0.9" />
                      <path d="M70 128 C108 121, 132 116, 144 114 C182 106, 206 100, 218 96 C256 88, 280 82, 292 78 C330 70, 354 62, 366 58 C404 52, 428 45, 440 42 L440 170 L70 170 Z" fill="url(#growthFill)" />
                      <path d="M70 128 C108 121, 132 116, 144 114 C182 106, 206 100, 218 96 C256 88, 280 82, 292 78 C330 70, 354 62, 366 58 C404 52, 428 45, 440 42" className="dp-line-path growth" />
                      <circle cx="40" cy="130" r="4" className="dp-point growth" />
                      <circle cx="144" cy="114" r="4" className="dp-point growth" />
                      <circle cx="218" cy="96" r="4" className="dp-point growth" />
                      <circle cx="292" cy="78" r="4" className="dp-point growth" />
                      <circle cx="366" cy="58" r="4" className="dp-point growth" />
                      <circle cx="440" cy="42" r="4" className="dp-point growth" />
                    </svg>
                  </div>
                </article>
                <article className="dp-chart-card">
                  <h3>Active Users (Last 30 Days)</h3>
                  <div className="dp-line-chart alt">
                    <svg className="dp-line-svg" viewBox="0 0 520 180" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="activeFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c1c3" stopOpacity="0.26" />
                          <stop offset="100%" stopColor="#22c1c3" stopOpacity="0.03" />
                        </linearGradient>
                      </defs>
                      <rect x="0" y="56" width="520" height="38" fill="#e9f8f8" opacity="0.8" />
                      <path d={`M40 ${Math.max(30, 170 - ((activeUsersSeries[0] || 0) * 3))} C72 ${Math.max(30, 170 - ((activeUsersSeries[0] || 0) * 3) + 4)}, 98 ${Math.max(30, 170 - ((activeUsersSeries[1] || 0) * 3) - 6)}, 130 ${Math.max(30, 170 - ((activeUsersSeries[1] || 0) * 3))} C162 ${Math.max(30, 170 - ((activeUsersSeries[1] || 0) * 3) - 5)}, 186 ${Math.max(30, 170 - ((activeUsersSeries[2] || 0) * 3) + 3)}, 220 ${Math.max(30, 170 - ((activeUsersSeries[2] || 0) * 3))} C252 ${Math.max(30, 170 - ((activeUsersSeries[3] || 0) * 3) - 4)}, 278 ${Math.max(30, 170 - ((activeUsersSeries[3] || 0) * 3) + 2)}, 310 ${Math.max(30, 170 - ((activeUsersSeries[3] || 0) * 3))} C344 ${Math.max(30, 170 - ((activeUsersSeries[4] || 0) * 3) + 2)}, 370 ${Math.max(30, 170 - ((activeUsersSeries[4] || 0) * 3) - 2)}, 400 ${Math.max(30, 170 - ((activeUsersSeries[4] || 0) * 3))} C432 ${Math.max(30, 170 - ((activeUsersSeries[5] || 0) * 3))}, 458 ${Math.max(30, 170 - ((activeUsersSeries[5] || 0) * 3))}, 485 ${Math.max(30, 170 - ((activeUsersSeries[5] || 0) * 3))} L485 170 L40 170 Z`} fill="url(#activeFill)" />
                      <path d={`M40 ${Math.max(30, 170 - ((activeUsersSeries[0] || 0) * 3))} C72 ${Math.max(30, 170 - ((activeUsersSeries[0] || 0) * 3) + 4)}, 98 ${Math.max(30, 170 - ((activeUsersSeries[1] || 0) * 3) - 6)}, 130 ${Math.max(30, 170 - ((activeUsersSeries[1] || 0) * 3))} C162 ${Math.max(30, 170 - ((activeUsersSeries[1] || 0) * 3) - 5)}, 186 ${Math.max(30, 170 - ((activeUsersSeries[2] || 0) * 3) + 3)}, 220 ${Math.max(30, 170 - ((activeUsersSeries[2] || 0) * 3))} C252 ${Math.max(30, 170 - ((activeUsersSeries[3] || 0) * 3) - 4)}, 278 ${Math.max(30, 170 - ((activeUsersSeries[3] || 0) * 3) + 2)}, 310 ${Math.max(30, 170 - ((activeUsersSeries[3] || 0) * 3))} C344 ${Math.max(30, 170 - ((activeUsersSeries[4] || 0) * 3) + 2)}, 370 ${Math.max(30, 170 - ((activeUsersSeries[4] || 0) * 3) - 2)}, 400 ${Math.max(30, 170 - ((activeUsersSeries[4] || 0) * 3))} C432 ${Math.max(30, 170 - ((activeUsersSeries[5] || 0) * 3))}, 458 ${Math.max(30, 170 - ((activeUsersSeries[5] || 0) * 3))}, 485 ${Math.max(30, 170 - ((activeUsersSeries[5] || 0) * 3))}`} className="dp-line-path active" />
                      <circle cx="40" cy={Math.max(30, 170 - ((activeUsersSeries[0] || 0) * 3))} r="4" className="dp-point active" />
                      <circle cx="130" cy={Math.max(30, 170 - ((activeUsersSeries[1] || 0) * 3))} r="4" className="dp-point active" />
                      <circle cx="220" cy={Math.max(30, 170 - ((activeUsersSeries[2] || 0) * 3))} r="4" className="dp-point active" />
                      <circle cx="310" cy={Math.max(30, 170 - ((activeUsersSeries[3] || 0) * 3))} r="4" className="dp-point active" />
                      <circle cx="400" cy={Math.max(30, 170 - ((activeUsersSeries[4] || 0) * 3))} r="4" className="dp-point active" />
                      <circle cx="485" cy={Math.max(30, 170 - ((activeUsersSeries[5] || 0) * 3))} r="4" className="dp-point active" />
                    </svg>
                  </div>
                </article>
              </div>

              <div className="dp-extra-grid">
                <article className="dp-card">
                  <div className="dp-card-head">
                    <h3>Live Notices</h3>
                    <button type="button">Create notice</button>
                  </div>
                  <div className="dp-notices">
                    {liveNotices.length === 0 && <div className="dp-empty-note">No live notices found.</div>}
                    {liveNotices.map((notice) => (
                      <div key={`${notice.title}-${notice.time}`} className="dp-notice-item">
                        <div className="dp-notice-top">
                          <strong>{notice.title}</strong>
                          <span className={`dp-priority ${String(notice.priority || '').toLowerCase()}`}>{notice.priority}</span>
                        </div>
                        <div className="dp-notice-meta">
                          <span>{notice.audience}</span>
                          <span>{notice.time}</span>
                        </div>
                        <div className="dp-notice-expiry">Expiry: {notice.expiry}</div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="dp-card">
                  <div className="dp-card-head">
                    <h3>Upcoming Events Timeline</h3>
                    <button type="button">View calendar</button>
                  </div>
                  <div className="dp-timeline">
                    {upcomingEvents.length === 0 && <div className="dp-empty-note">No upcoming events found.</div>}
                    {upcomingEvents.map((event) => (
                      <div key={`${event.name}-${event.date}`} className="dp-time-item">
                        <div className="dp-time-date">{event.date}</div>
                        <div className="dp-time-body">
                          <strong>{event.name}</strong>
                          <span>{event.venue}</span>
                          <em>{event.status}</em>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </section>
          )}

          {/* ──── Module Cards Heading ──── */}
          {!hideModuleCards && (
          <>
          <div className="features-section-header">
            <h1 className="features-title">Modules</h1>
            <p className="features-subtitle">Select a module to manage</p>
          </div>

          {/* ──── 4 Module Cards ──── */}
          {filteredModules.length ? (
            <div className="modules-grid">
              {filteredModules.map((card, i) => (
                <button
                  key={card.id}
                  id={card.id}
                  className={`module-card ${card.temporarilyDeactivated ? 'is-deactivated' : ''}`}
                  style={{
                    background: card.gradient,
                    animationDelay: `${i * 0.08}s`,
                  }}
                  onClick={() => {
                    if (card.temporarilyDeactivated) return;
                    const nextTrusteesView = card.id === 'card-logo' ? 'logo' : 'default';
                    const targetRoute =
                      card.route === '/trustees'
                        ? `/trustees?view=${encodeURIComponent(nextTrusteesView)}`
                        : card.route;
                    navigate(targetRoute, {
                      state: {
                        userName,
                        trust: activeTrust,
                        trustId,
                        superuserId,
                        sidebarNavKey: currentSidebarNavKey,
                        trusteesView: nextTrusteesView,
                        dashboardCardId: card.id,
                        ...(card.id === 'card-social-media-account-details'
                          ? { socialMediaSection: 'accounts-details' }
                          : {}),
                      },
                    });
                  }}
                  title={card.label}
                  aria-disabled={card.temporarilyDeactivated ? 'true' : 'false'}
                >
                  <div className="module-card-shine" />
                  {card.temporarilyDeactivated && (
                    <div className="module-card-deactivated-text">{card.deactivationText || 'Temporarily Deactivated'}</div>
                  )}
                  <div className="module-icon-wrap">
                    {card.icon}
                  </div>
                  <div className="module-card-body">
                    <span className="module-card-label">{card.label}</span>
                    <span className="module-card-desc">{card.description}</span>
                  </div>
                  <div className="module-card-arrow">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14M12 5l7 7-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="features-empty">No module found for "{searchTerm}".</div>
          )}
          </>
          )}
        </div>
      </main>
    </div>
  );
}
