import CompanyPageLayout from './CompanyPageLayout';
import StaticPageGate from '../../components/StaticPageGate';

export default function Contact() {
  return <StaticPageGate slug="contact" render={page => <CompanyPageLayout {...page} />} />;
}
