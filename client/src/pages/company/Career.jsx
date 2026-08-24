import CompanyPageLayout from './CompanyPageLayout';
import StaticPageGate from '../../components/StaticPageGate';

export default function Career() {
  return <StaticPageGate slug="career" render={page => <CompanyPageLayout {...page} />} />;
}
