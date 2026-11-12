import test from 'node:test';
import assert from 'node:assert/strict';
import { useBrandingStore } from '../store/brandingStore.js';
import { COMPANY, DEFAULT_LEGAL_ENTITY, getCompanyInfo, getLegalName } from './legalContent.js';

function resetBranding() {
  useBrandingStore.setState({ siteName: null, logo: null, legalEntity: null, loaded: false });
}

test('getCompanyInfo falls back safely for default tenant and returns dynamic legal entity', () => {
  resetBranding();
  assert.deepEqual(getCompanyInfo(), DEFAULT_LEGAL_ENTITY);
  assert.equal(getLegalName(), DEFAULT_LEGAL_ENTITY.name);

  useBrandingStore.getState().setBranding(
    { siteName: 'Custom Operator' },
    {
      legalEntity: {
        name: 'Custom Gaming N.V.',
        registrationNo: '12345/JAZ',
        address: 'Kaya Grandi 24, Bonaire',
      },
    },
  );

  const company = getCompanyInfo();
  assert.equal(company.name, 'Custom Gaming N.V.');
  assert.equal(company.address, 'Kaya Grandi 24, Bonaire');
  assert.equal(company.license, 'Lisans #12345/JAZ');
  assert.equal(company.email, DEFAULT_LEGAL_ENTITY.email);
  assert.equal(getLegalName(), 'Custom Gaming N.V.');
  assert.equal(COMPANY.name, 'Custom Gaming N.V.');
  assert.equal(COMPANY.address, 'Kaya Grandi 24, Bonaire');
});

test('getLegalName and getCompanyInfo derive the legal name from siteName when entity fields are empty', () => {
  resetBranding();
  useBrandingStore.getState().setBranding(
    { siteName: 'Alpha Bet' },
    { legalEntity: { name: null, registrationNo: null, address: null } },
  );

  assert.equal(getLegalName(), 'Alpha Bet International N.V.');
  assert.equal(getLegalName('Explicit Name'), 'Explicit Name International N.V.');
  const company = getCompanyInfo();
  assert.equal(company.name, 'Alpha Bet International N.V.');
  assert.equal(company.address, DEFAULT_LEGAL_ENTITY.address);
  assert.equal(company.license, DEFAULT_LEGAL_ENTITY.license);
});