import CompanyPageLayout from './CompanyPageLayout';
import StaticPageGate from '../../components/StaticPageGate';

export default function About() {
  return <StaticPageGate slug="about" render={page => <CompanyPageLayout {...page} />} />;
}
