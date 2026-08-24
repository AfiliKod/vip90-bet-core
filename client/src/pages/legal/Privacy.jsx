import LegalLayout from './LegalLayout';
import StaticPageGate from '../../components/StaticPageGate';

export default function Privacy() {
  return <StaticPageGate slug="legal-privacy" render={page => <LegalLayout {...page} />} />;
}