![VIP90.bet](https://img.shields.io/badge/VIP90.bet-iGaming%20Platform-1a2332?style=for-the-badge)
![Version](https://img.shields.io/badge/version-1.0.0-6366f1?style=flat-square)
![Node](https://img.shields.io/badge/node-22-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/mongodb-7%20(replica%20set)-47A248?style=flat-square&logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/license-AGPL--3.0%20%2B%20commercial%20add--ons-blue?style=flat-square)

# VIP90.bet

**Türkçe** · [English](README.md)

<p align="center">
  <img src="assets/readme/hero.jpg" alt="VIP90.bet — admin panel, sportsbook, casino lobby and a provably-fair in-house game in one product" width="100%">
</p>

**Kendi altyapınızda, kendi markanızla çalışan tam yığın bahis ve casino platformu.**

Hesap, cüzdan, bonus/çevrim, KYC, risk, admin paneli çekirdek platformdur ve tek başına çalışır. **In-house Games (13 oyun), Sports Betting ve Casino Content ayrı ücretli eklentilerdir**; çekirdeğe eklenir — tek kod tabanı, tek admin panel. **Live Casino** planlanan gelecek bir güncellemedir, bu sürümde yoktur.

### Testler

Önerilen yol (yalnızca Docker gerekir; yerelde MongoDB kurulumu gerekmez):

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm test
```

Paket genellikle bir dizüstü bilgisayarda birkaç dakika sürer. Alternatif olarak, `localhost:27017` üzerinde çalışan bir MongoDB replica set ile:

```bash
npm test               # birim/entegrasyon testleri (server + client i18n/admin/utils); yerelde MongoDB ister
npm run test:network   # gerçek dış servislere giden testler (Slikair sandbox)
npm run test:e2e       # Playwright uçtan uca testleri
```

## Güvenlik

- HMAC-SHA256 **provably fair** round üretimi, oyuncu tarafında doğrulanabilir.
- JWT tabanlı oturum, gömülü/casino görünümleri için kapsamlı token'lar.
- `helmet`, `express-mongo-sanitize`, katmanlı `express-rate-limit`.

<sub>Node.js · Express · React · MongoDB · Socket.IO ile geliştirildi.</sub>
