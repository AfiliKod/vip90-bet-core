import LegalLayout from './LegalLayout';
import StaticPageGate from '../../components/StaticPageGate';

export default function BonusTerms() {
  return <StaticPageGate slug="legal-bonus-terms" render={page => <LegalLayout {...page} />} />;
}