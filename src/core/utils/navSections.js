// Sidebar sections that are rendered by the Dashboard page. Each one has its own route.
export const NAV_SECTION_PATHS = {
  dashboard: '/dashboard',
  menu: '/menu',
  'company-details': '/company-details',
  'app-design': '/app-design',
  extra: '/extra',
};

/** Section key for a pathname ('/extra' -> 'extra'), or null when the path is not a section. */
export function sectionKeyFromPath(pathname) {
  const entry = Object.entries(NAV_SECTION_PATHS).find(([, path]) => path === pathname);
  return entry ? entry[0] : null;
}
