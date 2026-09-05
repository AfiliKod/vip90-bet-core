# Bilinen Kısıtlar

Bu belge, kod tabanında **tanımlı ama uçtan uca bağlı olmayan** ya da
**kısmi çalışan** özellikleri listeler. Amaç, operatörün "panelde bir
alan/servis görüyorum ama davranış beklediğim gibi değil" durumuyla
karşılaşmadan önce bunu bilmesidir. Her madde, ilgili kodun okunmasıyla
doğrulanmıştır.

## KYC belge inceleme akışı uçtan uca bağlı değil

`server/src/services/kyc.js` tam bir servis olarak yazılmış:
`submitKycDocuments`, `approveKyc`, `rejectKyc`, `checkKycRequired`,
`requireKyc`, `expireOldKyc`. Ama bu fonksiyonlar **hiçbir route veya
controller'dan çağrılmıyor**:

```
grep -rn "requireKyc\|submitKycDocuments" server/src/routes server/src/controllers
# (boş sonuç)
```

Kullanıcı tarafında belge yükleme sayfası/route'u yok — bir oyuncu
kimlik belgesi yükleyemez. Admin panelinde gerçekte çalışan tek şey,
`client/src/pages/admin/components/UserSlideOver.jsx` içindeki ham bir
`kycVerified` checkbox'ıdır; bu, `server/src/controllers/admin.js`
içindeki `updateUser`'ın izin verdiği alan listesiyle sınırlıdır:

```js
const allowed = ['isActive', 'kycVerified'];
```

Yani admin bir kullanıcıyı elle "KYC doğrulandı" olarak işaretleyebilir,
ama bunun dayanacağı bir belge inceleme/onay/red iş akışı yoktur.

## Acente (reseller) sistemi yok

`server/src/models/User.js` şemasında acente ilişkisi için iki alan
tanımlı:

```js
agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
isAgent: { type: Boolean, default: false },
```

Ama bu alanları okuyan/yazan hiçbir route, controller ya da admin UI
yok:

```
grep -rln "isAgent\|agentId" server/src/routes server/src/controllers client/src/pages
# (boş sonuç)
```

Ayrıca referans edilen `Agent` modeli de yok. Bu iki alan şemada
bırakılmış bir iskelet; bugün acente/reseller hiyerarşisi, acente
komisyonu ya da acente paneli diye bir şey çalışmıyor.

## Affiliate/referans sistemi tek kademeli

`server/src/services/referralCommission.js` (37 satır) tek bir
fonksiyon içerir: `payReferralCommission(userId, houseProfit)`. Bir
kullanıcı bahis/oyun oynayıp ev kârı ürettiğinde, **yalnızca o
kullanıcıyı doğrudan davet eden kişiye** ev kârının sabit **%10**'u
ödenir:

```js
const commission = parseFloat((houseProfit * 0.10).toFixed(2));
...
const referrer = await User.findByIdAndUpdate(
  bettor.referredBy,
  { $inc: { balance: commission, totalReferralEarnings: commission } },
  ...
);
```

`bettor.referredBy` zincirinde yukarı çıkıp 2. veya 3. kademe
referansçılara da pay veren bir mekanizma yoktur — sistem tek
kademeli düz bir "sen getirdin, sen kazanırsın" modelidir. Çok
kademeli bir affiliate/MLM yapısı arıyorsanız bu, ek geliştirme
gerektirir.

## VIP cashback tanımlı ama hiç ödenmiyor

`server/src/services/vip.js`'deki varsayılan VIP seviyelerinde her
seviye için bir `cashbackPercent` alanı var:

```js
{ level: 2, name: 'Silver',   cashbackPercent: 2,  rewardAmount: 10,  ... },
{ level: 3, name: 'Gold',     cashbackPercent: 5,  rewardAmount: 50,  ... },
{ level: 4, name: 'Platinum', cashbackPercent: 8,  rewardAmount: 200, ... },
{ level: 5, name: 'Diamond',  cashbackPercent: 12, rewardAmount: 500, ... },
```

Ama bu alan yalnızca **tanımlanıyor**, hiçbir yerde **okunup
işlenmiyor**:

```
grep -n "cashbackPercent" server/src/services/vip.js server/src/jobs/*.js
# yalnızca yukarıdaki tanım satırları eşleşir — hesaplama/ödeme yok
```

Gerçekte işleyen tek mekanizma, bir kullanıcı bir üst VIP seviyesine
geçtiğinde **tek seferlik** ödenen `rewardAmount`'tır (`vip.js`
içinde ~102-134. satırlar arası, seviye atlama anında balance'a
ekleniyor). Yani "her ay/hafta kayıptan otomatik geri ödeme" anlamında
bir cashback motoru yoktur — `cashbackPercent` alanı bugün için
kararmış (dead) bir alandır; ileride bir periyodik iş (cron/job) bu
değeri okuyup gerçek cashback hesaplayacak şekilde genişletilebilir
ama bu iş bugün yazılmamıştır.

## Modül sistemiyle ilgili ek not

`live-casino` modül ID'si kayıt defterinde (`server/src/modules/registry.js`)
tanımlı ve panelden aç/kapa yapılabilir, lisans durumu sorgulanabilir —
ama onu API seviyesinde gerçekten kapatacak bir route yok (gerçek
krupiyeli canlı casino entegrasyonu henüz yazılmadı). Ayrıntı için
[03 — Modül Sistemi](03-modul-sistemi.md) içindeki "Bilinen boşluk"
notuna bakın.
