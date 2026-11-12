# Agent Instructions

## Multi-tenancy

- **`2026-11-09`: Çok kiracılı veri yalıtımı (multi-tenant) zorunludur.** Bu karar
  "Multi-brand data isolation is not enforced" kararının yerini alır
  (docs/superpowers/specs/2026-11-09-multi-tenant-design.md). Operatöre ait her koleksiyon
  `tenantId` taşır; operatöre ait modellerde kapsamsız sorgu `tenantScoped` eklentisi
  tarafından reddedilir; kapsam dışı çalışan platform işleri `runAsPlatform(reason, fn)`
  ile açıkça işaretlenir. Kiracı modeli `Tenant`'tır; `Operator` adı in-house
  sağlayıcının B2B müşteri modeline aittir ve kiracı anlamında kullanılmaz. Tek operatörlü
  kurulumlar varsayılan kiracıyla (`TENANCY_MODE=single`) değişmeden çalışır.
  Brand/Jurisdiction sayfaları artık işlevseldir: Brand bir kiracıya aittir, alan adı →
  kiracı çözümlemesi `Domain` koleksiyonundan yapılır. Yalıtım çekirdeği, Platform Sahibi
  paneli, Partner hiyerarşisi, operatör provizyonu ve faturalama public core'dadır ve
  core'da geliştirilir (core upstream'dir, bkz. "Repo dağılımı"). Merkezi çok kiracılı
  kurulum yeni ve temiz bir kurulumdur; app.vip90.bet tek operatörlü demo ortamı olarak
  kalır ve taşınmaz. Multi modda bot, sahte kazanan ve demo depozit çalışmaz; personel
  2FA'sı yalnız multi modda zorunludur. Agent (bayi) ile Partner ayrı kavramlardır;
  birleştirme önerme.
