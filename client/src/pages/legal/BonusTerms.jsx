import LegalLayout from './LegalLayout';
import { BONUS_TERMS } from '../../data/legalContent';

export default function BonusTerms() {
  return <LegalLayout {...BONUS_TERMS} />;
}