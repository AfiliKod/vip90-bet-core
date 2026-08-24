import LegalLayout from './LegalLayout';
import StaticPageGate from '../../components/StaticPageGate';

export default function UserAgreement() {
  return <StaticPageGate slug="legal-user-agreement" render={page => <LegalLayout {...page} />} />;
}
