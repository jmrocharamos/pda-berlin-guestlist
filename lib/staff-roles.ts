export const staffRoles = {
  admin: { label: 'Admin', credentialRole: 'admin', permissions: ['read', 'check', 'counter', 'import', 'manage'] },
  bouncer: { label: 'Bouncer', credentialRole: 'bouncer', permissions: ['read', 'check', 'counter'] },
  manager: { label: 'Manager', credentialRole: 'admin', permissions: ['read', 'check', 'counter', 'import'] },
  'club-manager': { label: 'Club manager', credentialRole: 'bouncer', permissions: ['read', 'check', 'counter'] },
  kasse: { label: 'Kasse', credentialRole: 'bouncer', permissions: ['read', 'check', 'counter'] },
} as const;
export type StaffRole = keyof typeof staffRoles;
export function isStaffRole(value: string): value is StaffRole { return Object.hasOwn(staffRoles, value); }
