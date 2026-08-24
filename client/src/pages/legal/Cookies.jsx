import LegalLayout from './LegalLayout';
import StaticPageGate from '../../components/StaticPageGate';

export default function Cookies() {
  return <StaticPageGate slug="legal-cookies" render={page => <LegalLayout {...page} />} />;
}