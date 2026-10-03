import RHFPhoneInput from 'react-phone-number-input';
import tr from 'react-phone-number-input/locale/tr.json';
import en from 'react-phone-number-input/locale/en.json';
import 'react-phone-number-input/style.css';
import './PhoneInput.css';
import { useTranslation } from '../../i18n';

// Ülke kodu seçici + E.164 format/doğrulama içeren kütüphanenin koyu temaya
// uyarlanmış, react-hook-form Controller ile kullanılabilir sarmalayıcısı.
// value/onChange: E.164 string (ör. '+905551234567') ya da undefined.
export default function PhoneInput({ value, onChange, size = 'md', error }) {
  const { locale } = useTranslation();
  const labels = locale === 'tr' ? tr : en;

  return (
    <div>
      <div className={`phone-input-shell ${size === 'sm' ? 'phone-input-shell--sm' : ''}`}>
        <RHFPhoneInput
          international
          defaultCountry="TR"
          labels={labels}
          value={value}
          onChange={onChange}
        />
      </div>
      {error && <p className="text-danger text-xs mt-1">{error}</p>}
    </div>
  );
}
