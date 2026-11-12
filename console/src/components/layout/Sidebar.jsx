import React from 'react';
import { NavLink } from 'react-router-dom';
import { usePlatformAuthStore } from '../../store/authStore.js';

export const platformNav = [
  { name: 'Dashboard', path: '/' },
  { name: 'Tenants & Operators', path: '/tenants' },
  { name: 'Partners', path: '/partners' },
  { name: 'Domains', path: '/domains' },
  { name: 'Billing & Fee Plans', path: '/billing' },
  { name: 'Platform Reports', path: '/reports' },
  { name: 'Scope Gates (N6)', path: '/scope-gates' },
];

export const partnerNav = [
  { name: 'Genel Bakış', path: '/partner' },
  { name: 'Operatörlerim', path: '/partner/operators' },
  { name: 'Yeni Operatör Başlat', path: '/partner/operators/new' },
  { name: 'Komisyon & Faturalar', path: '/partner/statements' },
  { name: 'Personel', path: '/partner/staff' },
];

const h = React.createElement;

export default function Sidebar() {
  const staff = usePlatformAuthStore((s) => s.staff);
  const isPartner = staff?.scope === 'partner';
  const items = isPartner ? partnerNav : platformNav;

  return h(
    'aside',
    { className: 'w-64 bg-slate-900 border-r border-slate-800 flex flex-col' },
    h(
      'div',
      { className: 'h-16 flex items-center px-6 border-b border-slate-800' },
      h(
        'span',
        { className: 'text-xl font-bold tracking-tight text-white' },
        isPartner ? 'Partner Portalı' : 'Platform Core'
      )
    ),
    h(
      'nav',
      { className: 'flex-1 px-4 py-4 space-y-1' },
      items.map((item) =>
        h(
          NavLink,
          {
            key: item.path,
            to: item.path,
            end: item.path === '/' || item.path === '/partner',
            className: ({ isActive }) =>
              `flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white border-l-4 border-indigo-500 pl-2'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`,
          },
          item.name
        )
      )
    ),
    h(
      'div',
      { className: 'p-4 border-t border-slate-800 text-xs text-slate-500' },
      isPartner ? 'Partner Yönetim Portalı' : 'Multi-Tenant Platform Console'
    )
  );
}
