import LegalLayout from './LegalLayout';
import StaticPageGate from '../../components/StaticPageGate';

export default function ResponsibleGaming() {
  return <StaticPageGate slug="legal-responsible-gaming" render={page => <LegalLayout {...page} />} />;
}