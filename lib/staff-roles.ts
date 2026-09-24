export const staffRoles = {
  admin: { label: 'Admin', credentialRole: 'admin', permissions: ['read', 'check', 'counter', 'import', 'manage'] },
  downstairs: { label: 'Downstairs (Queue)', credentialRole: 'bouncer', permissions: ['read', 'check', 'counter'] },
  picker: { label: 'Picker', credentialRole: 'bouncer', permissions: ['read', 'check', 'counter'] },
  awareness: { label: 'Awareness', credentialRole: 'bouncer', permissions: ['read', 'check', 'counter'] },
  manager: { label: 'Manager', credentialRole: 'admin', permissions: ['read', 'check', 'counter', 'import'] },
  'club-manager': { label: 'Club Manager', credentialRole: 'bouncer', permissions: ['read', 'check', 'counter'] },
  kasse: { label: 'Kasse', credentialRole: 'bouncer', permissions: ['read', 'check', 'counter'] },
} as const;
export type StaffRole = keyof typeof staffRoles;
export function isStaffRole(value: string): value is StaffRole { return Object.hasOwn(staffRoles, value); }
