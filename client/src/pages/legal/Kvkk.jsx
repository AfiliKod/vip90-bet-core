import LegalLayout from './LegalLayout';
import StaticPageGate from '../../components/StaticPageGate';

export default function Kvkk() {
  return <StaticPageGate slug="legal-kvkk" render={page => <LegalLayout {...page} />} />;
}