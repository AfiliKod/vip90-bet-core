import StaticPage from '../models/StaticPage.js';

/** Herkese açık — footer link listesi (yalnızca etkin sayfalar, sıralı). */
export async function getPublicPageList() {
  return StaticPage.find({ isEnabled: true })
    .select('slug title route footerColumn footerOrder')
    .sort({ footerColumn: 1, footerOrder: 1 });
}

/** Herkese açık — tek sayfa içeriği. Kapalıysa null döner (route 404 gösterir). */
export async function getPublicPage(slug) {
  return StaticPage.findOne({ slug: slug.toLowerCase(), isEnabled: true });
}

/** Admin — tüm sayfalar (kapalılar dahil). */
export async function listAllForAdmin() {
  return StaticPage.find().sort({ footerColumn: 1, footerOrder: 1 });
}

export async function upsertPage(slug, data, adminId) {
  const page = await StaticPage.findOneAndUpdate(
    { slug: slug.toLowerCase() },
    { $set: { ...data, updatedBy: adminId } },
    { new: true, runValidators: true },
  );
  if (!page) throw new Error('Sayfa bulunamadı');
  return page;
}

export async function togglePage(slug, isEnabled, adminId) {
  const page = await StaticPage.findOneAndUpdate(
    { slug: slug.toLowerCase() },
    { $set: { isEnabled, updatedBy: adminId } },
    { new: true },
  );
  if (!page) throw new Error('Sayfa bulunamadı');
  return page;
}

// ─── Varsayılan sayfalar (idempotent seed) ──────────────────────────
// legalContent.js'teki mevcut 7 yasal/sorumlu-oyun metni + 4 yeni kurumsal
// sayfa (Hakkımızda/Kariyer/Basın/İletişim, placeholder metin — admin
// panelinden doldurulur). legalContent.js'teki iki fonksiyon-içerikli madde
// (dinamik formatMoney() çağrısı) Mongo'da saklanamadığı için o anki
// hesaplanmış değerle düz metne "baked" edildi — artık admin'den
// düzenlenebilir ama otomatik para birimi hesaplaması yapmıyor.
const DEFAULT_PAGES = [
  {
    slug: 'about', category: 'company', route: '/about', footerColumn: 'brand', footerOrder: 1,
    title: 'Hakkımızda', intro: '',
    sections: [{ title: 'Biz kimiz', content: ['Bu sayfa henüz düzenlenmedi. Admin panelinden Statik Sayfalar bölümünden içerik ekleyebilirsiniz.'] }],
  },
  {
    slug: 'career', category: 'company', route: '/career', footerColumn: 'brand', footerOrder: 2,
    title: 'Kariyer', intro: '',
    sections: [{ title: 'Açık pozisyonlar', content: ['Bu sayfa henüz düzenlenmedi. Admin panelinden Statik Sayfalar bölümünden içerik ekleyebilirsiniz.'] }],
  },
  {
    slug: 'press', category: 'company', route: '/press', footerColumn: 'brand', footerOrder: 3,
    title: 'Basın', intro: '',
    sections: [{ title: 'Basın kiti', content: ['Bu sayfa henüz düzenlenmedi. Admin panelinden Statik Sayfalar bölümünden içerik ekleyebilirsiniz.'] }],
  },
  {
    slug: 'contact', category: 'company', route: '/contact', footerColumn: 'brand', footerOrder: 4,
    title: 'İletişim', intro: '',
    sections: [{ title: 'Bize ulaşın', content: ['Bu sayfa henüz düzenlenmedi. Admin panelinden Statik Sayfalar bölümünden içerik ekleyebilirsiniz.'] }],
  },
  {
    slug: 'legal-terms', category: 'legal', route: '/legal/terms', footerColumn: 'legal', footerOrder: 1,
    title: 'Kullanım Koşulları',
    intro: 'Bu kullanım koşulları, Bet Platform ile kullanıcı arasındaki hukuki ilişkiyi düzenler. Platformu kullanarak bu koşulları kabul etmiş sayılırsınız.',
    sections: [
      { title: '1. Genel Hükümler', content: [
        'Bet Platform, Curacao Gaming Control Board tarafından lisanslanmış çevrimiçi bahis ve casino hizmeti sunar.',
        'Platform, 18 yaşından büyük ve yargı alanında online bahis hizmetlerinin yasal olduğu kullanıcılara hizmet verir.',
        'Hesap açmak ve platformu kullanmak için yürürlükteki yasalara uygun şekilde hareket etmek kullanıcının sorumluluğundadır.',
        'Türkiye Cumhuriyeti sınırları içinde online bahis ve casino hizmetleri yasal düzenlemeye tabi değildir; kullanıcı kendi yargı alanının yasalarına uyacağını taahhüt eder.',
      ] },
      { title: '2. Hesap Açma ve Yönetimi', content: [
        'Hesap açmak için en az 18 yaşında olmak, doğru ve güncel bilgi vermek gerekir.',
        'Bir kullanıcı en fazla bir hesap açabilir. Mükerrer hesap açmak hesap kapatma ve bakiye iptaline yol açar.',
        'Kullanıcı adı, e-posta ve şifre güvenliği kullanıcının sorumluluğundadır.',
        'Şüpheli hesap aktivitesi tespit edilirse hesap geçici olarak dondurulabilir.',
      ] },
      { title: '3. Para Yatırma ve Çekme', content: [
        'Minimum para yatırma: ₺50,00 · Minimum çekim: ₺100,00 · Maksimum çekim: KYC seviyesine göre değişir.',
        'Çekim talepleri 24 saat içinde işleme alınır; banka transferi 1-3 iş günü sürebilir.',
        'Aktif bonus çevrim şartı tamamlanmadan yapılan çekimlerde bonus bakiyesi iptal edilir.',
        'Şüpheli işlem tespit edilirse ek doğrulama (kimlik, adres, kaynak) talep edilebilir.',
      ] },
      { title: '4. Bonus ve Promosyonlar', content: [
        'Her bonus için ayrı çevrim şartı, oyun ağırlığı ve süresi tanımlıdır.',
        'Bonus kötüye kullanımı (örn. karşıt bahis, risk-free oyun) tespit edilirse bonus ve kazançlar iptal edilir.',
        'Detaylı bonus şartları için Bonus Kullanım Koşulları sayfasını ziyaret edin.',
      ] },
      { title: '5. Sorumlu Oyun', content: [
        'Platform, kumar bağımlılığını ciddiye alır ve sorumlu oyun araçları sunar.',
        'Deposit limiti, oturum süresi sınırı ve self-exclusion talepleri için Hesap > Sorumlu Oyun sayfasını kullanabilirsiniz.',
        'Kumar bağımlılığı yardım hatları: YEDAM (Yeme Bozukluğu ve Kumar Bağımlılığı Tedavi Merkezi), GamCare, Gambling Therapy.',
      ] },
      { title: '6. Hesap Kapatma', content: [
        'Kullanıcı istediği zaman hesabını kapatabilir. Kapatma talebi 24 saat içinde işleme alınır.',
        'Kapatılmış hesap bakiyesi, doğrulama sonrası belirtilen banka hesabına iade edilir.',
        'Kapatılmış hesap tekrar açılamaz; yeni hesap açılabilir ancak self-exclusion süresi varsa yeni hesap açılamaz.',
      ] },
      { title: '7. Sorumluluk Sınırı', content: [
        'Platform, teknik arıza, bakım veya mücbir sebepler nedeniyle oluşabilecek kayıplardan sorumlu tutulamaz.',
        'Bahis ve casino oyunları şansa dayalıdır; kayıplar kullanıcının sorumluluğundadır.',
        'Platform, kullanıcının yargı alanındaki yasal kısıtlamalardan sorumlu değildir.',
      ] },
      { title: '8. Uyuşmazlık Çözümü', content: [
        'Bu koşullar Curacao yasalarına göre yorumlanır.',
        'Uyuşmazlık durumunda öncelikle support@vip90.bet üzerinden iletişime geçilir.',
        'Çözülmeyen uyuşmazlıklar Curacao Gaming Control Board tahkimine götürülebilir.',
      ] },
    ],
  },
  {
    slug: 'legal-user-agreement', category: 'legal', route: '/legal/user-agreement', footerColumn: 'legal', footerOrder: 2,
    title: 'Kullanıcı Sözleşmesi',
    intro: 'Bu sözleşme, Bet Platform ile üye arasındaki üyelik ilişkisinin şartlarını düzenler. Platforma kayıt olarak bu sözleşmeyi okuduğunuzu ve kabul ettiğinizi beyan edersiniz.',
    sections: [
      { title: '1. Taraflar ve Tanımlar', content: [
        '"Platform", VIP90.bet International N.V. tarafından işletilen Bet Platform çevrimiçi bahis ve casino hizmetini ifade eder.',
        '"Üye", platforma kayıt olarak bu sözleşmeyi kabul eden gerçek kişiyi ifade eder.',
        'Bu sözleşme, üyelik süresince geçerli olan Kullanım Koşulları, Gizlilik Politikası ve KVKK Aydınlatma Metni ile birlikte bir bütün oluşturur; çelişki halinde bu sözleşme öncelikli uygulanır.',
      ] },
      { title: '2. Sözleşmenin Konusu ve Kapsamı', content: [
        'Sözleşmenin konusu, üyenin platform üzerinden sunulan spor bahis ve casino hizmetlerinden yararlanma şartlarının belirlenmesidir.',
        'Üyelik, kayıt formunun eksiksiz doldurulup bu sözleşmenin onaylanmasıyla kurulur ve platform tarafından hesabın aktifleştirilmesiyle yürürlüğe girer.',
      ] },
      { title: '3. Üyelik ve Hesap Sahipliği', content: [
        'Her üye yalnızca kendi adına, tek bir hesap açabilir. Mükerrer hesap tespit edilirse ilgili hesaplar dondurulabilir.',
        'Hesap bilgileri (kullanıcı adı, email, şifre) münhasıran üyeye aittir; üçüncü kişilerle paylaşılamaz. Hesap üzerinden gerçekleştirilen tüm işlemlerden üye sorumludur.',
        'Üye, kayıt sırasında verdiği bilgilerin doğru, güncel ve eksiksiz olduğunu taahhüt eder. Yanlış/yanıltıcı bilgi verildiğinin tespiti halinde platform hesabı askıya alma hakkına sahiptir.',
      ] },
      { title: '4. Üyenin Yükümlülükleri', content: [
        'Üye, platformu yalnızca yasal amaçlarla ve bulunduğu yargı alanının yasalarına uygun şekilde kullanacağını kabul eder.',
        'Üye, 18 yaşından küçük olmadığını ve bahis/casino hizmetlerinden yararlanma ehliyetine sahip olduğunu beyan eder.',
        'Üye, hesap güvenliğini (şifre, iki faktörlü doğrulama vb.) sağlamakla ve şüpheli aktiviteyi derhal platforma bildirmekle yükümlüdür.',
      ] },
      { title: '5. Platformun Hak ve Yükümlülükleri', content: [
        'Platform, hizmetlerini Curacao Gaming Control Board lisansı kapsamında sunar ve teknik altyapının sürekliliği için makul özeni gösterir.',
        'Platform, sözleşme şartlarının ihlali, sahtecilik şüphesi veya yasal zorunluluk halinde üyelik hesabını geçici olarak dondurma veya kalıcı olarak kapatma hakkını saklı tutar.',
        'Platform, bu sözleşmeyi ve eklerini önceden bildirimde bulunarak güncelleyebilir; güncel sürüm her zaman platformun ilgili sayfasında yayınlanır.',
      ] },
      { title: '6. Sözleşmenin Feshi ve Hesap Kapatma', content: [
        'Üye, dilediği zaman hesabını kapatma talebinde bulunabilir; bekleyen bakiye ve yükümlülükler tasfiye edildikten sonra hesap kapatılır.',
        'Platform, bu sözleşmenin ihlali halinde üyelik ilişkisini tek taraflı olarak feshedebilir. Fesih, üyenin o ana kadar doğmuş hak ve yükümlülüklerini ortadan kaldırmaz.',
      ] },
      { title: '7. Uyuşmazlıkların Çözümü ve Uygulanacak Hukuk', content: [
        'Bu sözleşmeden doğan uyuşmazlıklarda, platformun lisans aldığı Curacao mevzuatı ve platform lisans koşulları esas alınır.',
        'Türkiye Cumhuriyeti sınırları içinde online bahis ve casino hizmetleri yasal düzenlemeye tabi değildir; üye kendi yargı alanının yasalarına uyacağını taahhüt eder.',
      ] },
    ],
  },
  {
    slug: 'legal-privacy', category: 'legal', route: '/legal/privacy', footerColumn: 'legal', footerOrder: 3,
    title: 'Gizlilik Politikası',
    intro: 'Bu gizlilik politikası, Bet Platform\'un kişisel verilerinizi nasıl topladığını, kullandığını ve koruduğunu açıklar. 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında hazırlanmıştır.',
    sections: [
      { title: '1. Toplanan Kişisel Veriler', content: [
        'Kimlik bilgileri: kullanıcı adı, e-posta, doğum tarihi (yaş doğrulama için)',
        'İletişim bilgileri: e-posta adresi',
        'Finansal bilgiler: para yatırma/çekme işlemleri (ödeme sağlayıcı tarafından işlenir)',
        'İşlem geçmişi: bahis, casino, bonus kullanımı, IP, cihaz bilgisi',
        'Çerezler: oturum, tercih, dil, güvenlik amaçlı teknik çerezler',
      ] },
      { title: '2. Verilerin Kullanım Amaçları', content: [
        'Hesap yönetimi ve kimlik doğrulama',
        'Para yatırma, çekme ve ödeme işlemleri',
        'Bonus ve promosyon yönetimi',
        'Sorumlu oyun kontrolleri (yaş, deposit limiti)',
        'Dolandırıcılık önleme ve güvenlik',
        'Yasal yükümlülükler (AML, lisans raporlama)',
      ] },
      { title: '3. Verilerin Paylaşımı', content: [
        'Casino sağlayıcısı (Palace Casino) ile oyun oturumu için gerekli bilgiler',
        'Ödeme sağlayıcıları ile para yatırma/çekme işlemleri için',
        'Lisans otoritesi ile yasal raporlama yükümlülükleri kapsamında',
        'Yasal merciler ile yasal talepler halinde',
        'Üçüncü taraflarla pazarlama verisi paylaşılmaz.',
      ] },
      { title: '4. Verilerin Saklanması', content: [
        'Aktif hesaplar: hesap aktif olduğu sürece',
        'Kapatılmış hesaplar: 5 yıl (yasal raporlama yükümlülüğü)',
        'İşlem kayıtları: 10 yıl (mali yükümlülük)',
        'Çerezler: teknik çerezler oturum süresince, analitik çerezler consent süresince',
      ] },
      { title: '5. KVKK Madde 11 — Veri Sahibinin Hakları', content: [
        'Kişisel verilerinizin işlenip işlenmediğini öğrenme',
        'İşlenmişse buna ilişkin bilgi talep etme',
        'Verilerin işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme',
        'Yurt içinde/dışında aktarıldığı üçüncü kişileri öğrenme',
        'Eksik/yanlış işlenen verilerin düzeltilmesini isteme',
        'Şartlar oluştuğunda silinmesini/yok edilmesini isteme',
        'Otomatik sistemlerle aleyhine sonuç doğan analizlere itiraz etme',
      ] },
      { title: '6. Çerezler (Cookies)', content: [
        'Teknik çerezler: oturum yönetimi, güvenlik — zorunlu',
        'Analitik çerezler: kullanım istatistikleri — opsiyonel',
        'Pazarlama çerezleri: hedefli reklam — opsiyonel',
        'Çerez tercihleri için çerez banner\'ını kullanabilirsiniz.',
      ] },
      { title: '7. İletişim', content: [
        'KVKK talepleri için: kvkk@vip90.bet',
        'Genel gizlilik soruları için: support@vip90.bet',
        'Yanıt süresi: en geç 30 gün (KVKK md.13)',
      ] },
    ],
  },
  {
    slug: 'legal-kvkk', category: 'legal', route: '/legal/kvkk', footerColumn: 'legal', footerOrder: 4,
    title: 'KVKK Aydınlatma Metni',
    intro: '6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) madde 10 kapsamında, kişisel verilerinizin işlenmesi hakkında aydınlatma metnini sunarız.',
    sections: [
      { title: '1. Veri Sorumlusu', content: [
        'Unvan: VIP90.bet International N.V.',
        'Adres: Heelsumstraat 51, E-Commerce Park, Curaçao',
        'Vergi/Şirket No: 142.888.0 (Curacao)',
        'E-posta: kvkk@vip90.bet',
      ] },
      { title: '2. İşlenen Kişisel Veriler', content: [
        'Kimlik: kullanıcı adı, e-posta adresi, doğum tarihi',
        'İletişim: e-posta, telefon (opsiyonel)',
        'Finansal: ödeme yöntemi, işlem geçmişi, bakiye',
        'Davranış: bahis geçmişi, casino oyun geçmişi, bonus kullanımı',
        'Teknik: IP adresi, cihaz bilgisi, oturum log\'ları',
      ] },
      { title: '3. İşleme Amaçları', content: [
        'Hesap açma ve yönetimi',
        'Yaş ve kimlik doğrulama (lisans yükümlülüğü)',
        'Bahis ve casino hizmetlerinin sunumu',
        'Bonus ve promosyon yönetimi',
        'Para yatırma ve çekme',
        'Dolandırıcılık ve suistimal önleme',
        'Yasal raporlama ve denetim (AML, lisans otoritesi)',
      ] },
      { title: '4. Toplama Yöntemi', content: [
        'Platform kullanımı sırasında otomatik toplama (formlar, çerezler)',
        'Ödeme işlemleri sırasında ödeme sağlayıcısından',
        'Casino sağlayıcısından (Palace Casino) oyun oturumu için',
        'Müşteri destek iletişimi sırasında (e-posta, canlı yardım)',
      ] },
      { title: '5. Verilerin Aktarımı', content: [
        'Yurt içi: ödeme sağlayıcıları, casino sağlayıcısı, hosting',
        'Yurt dışı: lisans otoritesi, denetim firmaları (Curacao, Malta)',
        'Yasal merciler: yargı kararı veya yasal talep halinde',
      ] },
      { title: '6. Saklama Süresi', content: [
        'Aktif hesap verileri: hesap aktif olduğu sürece',
        'İşlem kayıtları: 10 yıl (mali yükümlülük)',
        'Kapatılmış hesap verileri: 5 yıl sonra silinir',
      ] },
      { title: '7. KVKK Madde 11 Hakları', content: [
        'a) Kişisel verilerinizin işlenip işlenmediğini öğrenme',
        'b) İşlenmişse buna ilişkin bilgi talep etme',
        'c) İşleme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme',
        'd) Yurt içinde/dışında aktarıldığı üçüncü kişileri öğrenme',
        'e) Eksik/yanlış işlenen verilerin düzeltilmesini isteme',
        'f) Şartlar oluştuğunda silinmesini/yok edilmesini isteme',
        'g) Otomatik sistemlerle aleyhine sonuç doğan analizlere itiraz etme',
      ] },
      { title: '8. Başvuru Yöntemi', content: [
        'E-posta: kvkk@vip90.bet',
        'Konu: "KVKK Veri Sahibi Başvurusu"',
        'İçerik: talep edilen hak, kimlik doğrulama bilgisi, iletişim adresi',
        'Yanıt süresi: en geç 30 gün (KVKK md.13)',
        'Ücretsizdir; ek belge gerekirse bilgi verilir.',
      ] },
    ],
  },
  {
    slug: 'legal-cookies', category: 'legal', route: '/legal/cookies', footerColumn: 'legal', footerOrder: 5,
    title: 'Çerez Politikası',
    intro: 'Bu sayfa, Bet Platform\'un kullandığı çerezleri ve nasıl yönetileceğini açıklar.',
    sections: [
      { title: '1. Çerez Nedir?', content: [
        'Çerez (cookie), web sitelerinin tarayıcınızda sakladığı küçük metin dosyalarıdır.',
        'Çerezler oturum yönetimi, tercih hatırlama, güvenlik ve analitik için kullanılır.',
      ] },
      { title: '2. Kullandığımız Çerez Türleri', content: [
        'Teknik (zorunlu): oturum, kimlik doğrulama, güvenlik — kapatılamaz',
        'Tercih: dil, tema, görüntüleme ayarları',
        'Analitik: kullanım istatistikleri (anonim)',
        'Pazarlama: hedefli reklam ve promosyonlar',
      ] },
      { title: '3. Üçüncü Taraf Çerezleri', content: [
        'Ödeme sağlayıcıları: ödeme işlemleri için',
        'Casino sağlayıcısı (Palace): oyun oturumu için',
        'Analitik sağlayıcıları: kullanım istatistikleri için (consent sonrası)',
      ] },
      { title: '4. Çerez Yönetimi', content: [
        'Çerez banner\'ından tercihleri yönetebilirsiniz',
        'Tarayıcı ayarlarından çerezleri engelleyebilirsiniz (teknik çerezler hariç)',
        'Mevcut çerezleri tarayıcıdan silebilirsiniz',
      ] },
      { title: '5. Saklama Süreleri', content: [
        'Oturum çerezleri: tarayıcı kapanana kadar',
        'Kalıcı çerezler: 1 gün — 1 yıl arası (amaçına göre)',
        'Consent kaydı: 1 yıl',
      ] },
    ],
  },
  {
    slug: 'legal-bonus-terms', category: 'legal', route: '/legal/bonus-terms', footerColumn: 'legal', footerOrder: 6,
    title: 'Bonus Kullanım Koşulları',
    intro: 'Bu koşullar tüm bonuslar için geçerlidir. Belirli bir bonus için ek şartlar bonus açıklamasında belirtilir.',
    sections: [
      { title: '1. Çevrim Şartı (Wagering)', content: [
        'Her bonus, bonus tutarı + (yatırım tutarı) üzerinden belirli bir çevrim şartına tabidir (örn. 35x).',
        'Çevrim, gerçek parayla yapılan bahislerden sayılır. Bonus parayla yapılan bahisler çevrime sayılmaz.',
        'Çevrim tamamlanmadan bonus cash\'e çevrilemez ve çekilemez.',
      ] },
      { title: '2. Oyun Ağırlıkları', content: [
        'Spor bahisleri: 1.0 (100%)',
        'Casino slot: 0.5 (50%) — örn. ₺100,00 bahis = ₺50,00 çevrim',
        'Casino canlı: 0.7 (70%)',
        'In-house oyunlar (Crash, Mines vb.): 0.5 (50%)',
        'Bonus kötüye kullanımına izin veren oyunlar (düşük RTP slot): 0.0',
      ] },
      { title: '3. Maksimum Bahis', content: [
        'Bonus aktifken maksimum bahis: ₺50,00 (slot) / ₺100,00 (spor)',
        'Maksimum bahis aşılırsa bonus ve kazançlar iptal edilir.',
      ] },
      { title: '4. Süre', content: [
        'Her bonus için geçerlilik süresi tanımlıdır (varsayılan 30 gün).',
        'Süre içinde çevrim tamamlanmazsa bonus ve kazançlar iptal edilir.',
      ] },
      { title: '5. Kötüye Kullanım', content: [
        'Karşıt bahis (aynı etkinliğe iki zıt bahis) ile çevrim sayılmaz.',
        'Risk-free oyun (düşük riskli bahislerle çevrim) bonus iptaline yol açar.',
        'Multi-account ile bonus kötüye kullanımı tespit edilirse tüm kazançlar iptal edilir.',
      ] },
      { title: '6. Bonus Çevirme (Conversion)', content: [
        'Çevrim tamamlandığında bonus "cash\'e çevrilebilir" duruma geçer.',
        'Cash\'e çevirmek için Profil > Bonus > Çevir butonuna basılır.',
        'Çevrilmemiş bonuslar otomatik olarak hesapta kalır.',
      ] },
      { title: '7. Çekim ve Bonus', content: [
        'Aktif bonus varken çekim talebi verilirse bonus iptal edilir.',
        'Bonus cash\'e çevrilmeden çekim yapılırsa bonus tutarı bakiyeden düşülür.',
      ] },
    ],
  },
  {
    slug: 'legal-responsible-gaming', category: 'legal', route: '/legal/responsible-gaming', footerColumn: 'support', footerOrder: 1,
    title: 'Sorumlu Oyun',
    intro: 'Kumar bağımlılığı ciddi bir sağlık sorunudur. Platform, sorumlu oyun araçları ve destek hatları sunar.',
    sections: [
      { title: '1. Kendinizi Test Edin', content: [
        'Aşağıdaki sorulardan 7+ tanesine "evet" diyorsanız, profesyonel yardım almanız önerilir:',
        '• Kayıp telafi etmek için daha fazla mı oynuyorsunuz?',
        '• Kumar oynamak için iş/okul hayatınızı aksatıyor musunuz?',
        '• Aileniz kumar alışkanlığınızdan şikayetçi mi?',
        '• Borçlanmak zorunda kalıyor musunuz?',
        '• Kumar oynamadığınızda huzursuz/huzursuzluk hissediyor musunuz?',
        '• Kötü hissettiğinizde kumar oynamak kaçış mı?',
        '• Kaybettiğinizde tekrar oynama isteği duyuyor musunuz?',
        '• Kumar için ayırdığınız süre artıyor mu?',
        '• Kumar yüzünden suçluluk/utanç duyuyor musunuz?',
      ] },
      { title: '2. Sorumlu Oyun Araçları', content: [
        'Deposit limiti: günlük / haftalık / aylık limit belirleyin',
        'Oturum süresi: belirli süre sonra otomatik uyarı veya çıkış',
        'Self-exclusion: 1 hafta — 6 ay arası hesap dondurma',
        'Reality check: 60 dakikada bir harcama özeti',
        'Hesap kapatma: kalıcı hesap kapatma talebi',
      ] },
      { title: '3. Yardım Kuruluşları', content: [
        'Türkiye — YEDAM: 0 (312) 580 80 80 — yedam.saglik.gov.tr',
        'Uluslararası — GamCare: gamcare.org.uk',
        'Uluslararası — Gambling Therapy: gamblingtherapy.org',
        'Anonim Kumarbazlar (Gamblers Anonymous): gamblersanonymous.org',
      ] },
      { title: '4. Reşit Olmayanlar', content: [
        'Platform 18 yaşından küçüklere hizmet vermez.',
        'Hesap açılırken yaş doğrulaması zorunludur.',
        'Reşit olmayan birinin hesap açtığını tespit ederseniz: responsible@vip90.bet',
      ] },
    ],
  },
];

/** Server açılışında bir kez çağrılır (idempotent) — koleksiyon boşsa tohumlar. */
export async function seedDefaultPages() {
  const count = await StaticPage.countDocuments();
  if (count > 0) return;
  await StaticPage.insertMany(DEFAULT_PAGES);
}
