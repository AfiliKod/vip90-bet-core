// client/src/components/admin/adminNav.config.js
//
// Admin sidebar'ının grup + sayfa taksonomisi. Tek yerden yönetim.
//
// 2026-09-30 IA revizyonu (endüstri standardı / en iyi uygulama):
//
// Gruplama kriteri TEKNİK YAPI DEĞİL, OPERATÖRÜN AMACI olmalıdır
// (Nielsen Norman: gruplar kullanıcı hedefine göre kurulur, sistem
// tablolarına göre değil). Eski yapıdaki ihlaller ve düzeltmeleri:
//
// 1) **Tek öğeli grup yok.** "Finance" (yalnız Wallet) ve "Sportsbook"
//    (yalnız Events) grupları dikey alan harcayıp anlam taşımıyordu — tek
//    öğeli bir grup zaten üst düzey bir bağlantı olmalı. Finance, Currencies
//    ile birleşti; Sportsbook, Casino ile "Casino & Sportsbook" oldu.
//    Kural: grup başına 2-7 öğe (taranabilirlik + etiket maliyeti dengesi).
//
// 2) **"Catalog" grubu kaldırıldı.** Marka (white-label), Para Birimi
//    (finans) ve Yargı Bölgesi (regülasyon) üç ayrı iş alanının ayarıydı;
//    veritabanı tipine göre bir araya getirilmişti, görev bazlı değildi.
//    Artık: Currencies → Finance, Jurisdictions → Compliance, Brands →
//    Platform.
//
// 3) **Destek, pazarlamayla aynı sepette değil.** Eski "Engagement"
//    içinde Promotions+VIP (büyüme) ile Tickets+Chat (destek/iletişim)
//    yan yana duruyordu. Tickets → Customers (müşteri yüzeyi), Chat
//    Engagement'de kaldı.
//
// 4) **Grup adı çakışması giderildi.** Sidebar'da "Risk & Compliance" ve
//    sayfa içinde "Compliance" aynı şeyi iki farklı adla söylüyordu.
//
// 5) **Sıralama = kullanım sıklığı.** Yönlenme (Overview) → müşteri →
//    para → risk → ürün → büyüme → yapılandırma → sandbox (Demo &
//    Simulation en altta, kasıtlı olarak "gerçek değil" izlenimi verir).
//
// 2026-10-02 IA revizyonu (docs/admin-redesign/README.md §3.1 yeni karar):
// Currencies/Jurisdictions/Brands menüden çıktı, Settings (/admin/platform)
// sekmelerine taşındı. Finance tek öğeye (Wallet) düştüğü için `topLevel`
// grup: başlıksız, üst düzey link (labelKey breadcrumb/arama için kalır).
// "Casino & Sportsbook" → "Products" (Casino Provider · In-house Games ·
// Sportsbook). Game Tasks menüden çıktı (rota/sayfa duruyor).
//
// icon alanları Material Symbols Outlined glyph adlarıdır; render tarafı
// AdminSidebar.jsx'te .material-symbols-outlined ile çizilir.
export const ADMIN_NAV_GROUPS = [
  {
    // Yönlenme: "şu an durumum ne?" — günün ilk açtığın ekran.
    id: 'overview',
    labelKey: 'admin.nav.groupOverview',
    items: [
      { id: 'dashboard', labelKey: 'admin.nav.dashboard', to: '/admin', icon: 'dashboard' },
      { id: 'analytics', labelKey: 'admin.nav.analytics', to: '/admin/analytics', icon: 'monitoring' },
    ],
  },
  {
    // Günlük operasyonun kalbi: oyuncu + destek kuyruğu.
    id: 'customers',
    labelKey: 'admin.nav.groupCustomers',
    items: [
      { id: 'users', labelKey: 'admin.nav.users', to: '/admin/users', icon: 'group' },
      { id: 'agents', labelKey: 'admin.nav.agents', to: '/admin/agents', icon: 'handshake' },
      { id: 'segments', labelKey: 'admin.nav.segments', to: '/admin/segments', icon: 'person' },
      { id: 'tickets', labelKey: 'admin.nav.tickets', to: '/admin/tickets', icon: 'confirmation_number', badge: 'tickets' },
    ],
  },
  {
    // Para hareketi: yatırım/çekim onayları en sık kullanılan admin işidir.
    id: 'finance',
    labelKey: 'admin.nav.groupFinance',
    topLevel: true,
    items: [
      { id: 'wallet', labelKey: 'admin.nav.wallet', to: '/admin/wallet', icon: 'account_balance_wallet', badge: 'wallet' },
    ],
  },
  {
    // Risk ve regülasyon: KYC/Risk/Recon/RG tek sayfada, yargı bölgesi
    // regülasyon ayarı olduğu için burada, denetim kaydı en sonda.
    id: 'compliance',
    labelKey: 'admin.nav.groupCompliance',
    items: [
      { id: 'compliance', labelKey: 'admin.nav.compliance', to: '/admin/compliance', icon: 'shield', badge: 'compliance' },
      { id: 'audit', labelKey: 'admin.nav.audit', to: '/admin/audit', icon: 'gavel' },
    ],
  },
  {
    // İşletilen ürünler: casino sağlayıcısı, in-house oyunlar, sportsbook.
    id: 'products',
    labelKey: 'admin.nav.groupProducts',
    items: [
      { id: 'igames', labelKey: 'admin.nav.igames', to: '/admin/igames', icon: 'casino' },
      { id: 'game-settings', labelKey: 'admin.nav.gameSettings', to: '/admin/game-settings', icon: 'tune' },
      { id: 'events', labelKey: 'admin.nav.events', to: '/admin/events', icon: 'sports_soccer' },
    ],
  },
  {
    // Büyüme: kampanya, VIP ve canlı sohbet.
    id: 'engagement',
    labelKey: 'admin.nav.groupEngagement',
    items: [
      { id: 'promotions', labelKey: 'admin.nav.promotions', to: '/admin/promotions', icon: 'redeem' },
      { id: 'vip', labelKey: 'admin.nav.vip', to: '/admin/vip', icon: 'workspace_premium' },
      { id: 'sms-templates', labelKey: 'admin.nav.smsTemplates', to: '/admin/sms-templates', icon: 'sms' },
      { id: 'chat', labelKey: 'admin.nav.chat', to: '/admin/chat', icon: 'chat' },
    ],
  },
  {
    // Yapılandırma: nadiren değişir, altta — Settings (General · Modules ·
    // Currencies · Jurisdictions · Brands), kişiselleştirme, roller ve sistem
    // sağlığı. (2026-09-23 denetiminde kaldırılan
    // kyc-settings/games-showcase/health yine de bu grubun alt sayfaları.)
    id: 'platform',
    labelKey: 'admin.nav.groupPlatform',
    items: [
      { id: 'platform', labelKey: 'admin.nav.platform', to: '/admin/platform', icon: 'widgets' },
      { id: 'personalization', labelKey: 'admin.nav.personalization', to: '/admin/personalization', icon: 'palette' },
      { id: 'roles', labelKey: 'admin.nav.roles', to: '/admin/roles', icon: 'key' },
      { id: 'health', labelKey: 'admin.nav.healthLogs', to: '/admin/health', icon: 'monitor_heart' },
    ],
  },
  {
    // Gerçek veri değil: bilinçli olarak en altta ve ayrı tutulur, operatör
    // demo/kozmetik araçlarla gerçek iş akışını karıştırmamalı.
    id: 'demo-simulation',
    labelKey: 'admin.nav.groupDemoSimulation',
    items: [
      { id: 'demo-data', labelKey: 'admin.nav.demoData', to: '/admin/demo-data', icon: 'science' },
      { id: 'bots', labelKey: 'admin.nav.bots', to: '/admin/bots', icon: 'smart_toy' },
    ],
  },
];
