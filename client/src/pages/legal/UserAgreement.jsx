import LegalLayout from './LegalLayout';
import { USER_AGREEMENT } from '../../data/legalContent';

export default function UserAgreement() {
  return <LegalLayout {...USER_AGREEMENT} />;
}
