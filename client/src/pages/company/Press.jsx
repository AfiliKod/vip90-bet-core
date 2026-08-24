import CompanyPageLayout from './CompanyPageLayout';
import StaticPageGate from '../../components/StaticPageGate';

export default function Press() {
  return <StaticPageGate slug="press" render={page => <CompanyPageLayout {...page} />} />;
}
