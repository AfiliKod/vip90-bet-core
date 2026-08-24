import LegalLayout from './LegalLayout';
import StaticPageGate from '../../components/StaticPageGate';

export default function Terms() {
  return <StaticPageGate slug="legal-terms" render={page => <LegalLayout {...page} />} />;
}
