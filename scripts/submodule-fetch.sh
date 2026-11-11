#!/bin/sh
# Eklenti (premium) alt modüllerini SUBMODULE_PAT ile çeker.
#
# Amaç: "submodule fetch düştü" bilgisini **mekanizma** ve **credential**
# arızası olarak ayırmak. 2026-11-08 ölçümü: gitlink'i yeni bir provider
# commit'ine taşıyan push koşusu `fatal: could not read Username for
# 'https://github.com': No such device or address` ile düştü; aynı tarifle
# gitlink değiştiren 2026-10-23 ve 10-25 koşuları (#200/#201/#207-#210) yeşil
# geçmişti → hata credential düzeyinde, secret son olarak 2026-10-03'te yazılmış.
#
# Kullanım:
#   sh scripts/submodule-fetch.sh                     # tüm alt modüller, PAT yoksa atla
#   sh scripts/submodule-fetch.sh --required          # PAT yoksa iş düşer
#   sh scripts/submodule-fetch.sh --required <yol>    # yalnız o alt modül
#
# Env: PAT — workflow'ta `secrets.SUBMODULE_PAT`'ten verilir.
#
# Çıkış: 0 = çekildi ya da çekmeye gerek yok; 1 = fetch zorunlu ama yetki yok.

set -u

REQUIRED=0
TARGET=""
if [ "${1:-}" = "--required" ]; then
  REQUIRED=1
  shift
fi
TARGET="${1:-}"

# Reddedilen kimlik için prompt'a düşme: asılı kalmak yerine okunabilir hata.
GIT_TERMINAL_PROMPT=0
export GIT_TERMINAL_PROMPT

if [ -z "${PAT:-}" ]; then
  if [ "$REQUIRED" = 1 ]; then
    echo "::error::SUBMODULE_PAT tanımlı değil — alt modül çekilemez; sessiz-atlamaya düşürülmez."
    exit 1
  fi
  echo "SUBMODULE_PAT tanımlı değil — alt modüller çekilmiyor (klasörler boş kalabilir)."
  exit 0
fi

# base64 hali GitHub'ın otomatik maskelemesine takılmaz → elle maskele.
AUTH=$(printf 'x-access-token:%s' "$PAT" | base64 | tr -d '\n')
echo "::add-mask::$AUTH"

# credential.helper'ı kapat (genel VE github'a özgü anahtar): makinede saklı bir
# kişisel token ölü SUBMODULE_PAT'i maskelerdi — denetimsiz başarı. `gh auth
# login` github için `credential.https://github.com.helper` yazar, bu yüzden
# `-c credential.helper=` tek başına yetmez. -c diske yazılmaz.
HDRCFG="http.https://github.com/.extraheader=AUTHORIZATION: basic $AUTH"
gitaux() {
  git -c credential.helper= \
      -c credential.https://github.com.helper= \
      -c "$HDRCFG" "$@"
}

# Bu ağaç gerçekten fetch gerektiriyor mu? `git submodule status` ilk karakteri:
#   ' ' = kayıtlı gitlink çalışma ağacında (fetch gerekmez)
#   '-' = başlatılmamış/boş   '+' = kayıtlı SHA'dan farklı   'U' = birleşme çakışması
if [ -n "$TARGET" ]; then
  STATUS=$(gitaux submodule status -- "$TARGET" 2>/dev/null || true)
else
  STATUS=$(gitaux submodule status 2>/dev/null || true)
fi
NEEDS=$(printf '%s\n' "$STATUS" | grep -c '^[+-U]')
if [ "$NEEDS" -gt 0 ]; then NEED_TXT=EVET; else NEED_TXT=HAYIR; fi
echo "fetch gerekiyor mu: $NEED_TXT  (eksik/sapmış: $NEEDS)"

# Probe edilecek URL(ler): yalnız gereken alt modüller.
urls_for() {
  # $1 = yol filtresi (boşsa tüm alt modüller)
  for sec in $(git config --file .gitmodules --name-only --get-regexp '^submodule\..*\.path$' \
                 | sed -e 's/^submodule\.//' -e 's/\.path$//'); do
    p=$(git config --file .gitmodules --get "submodule.$sec.path")
    if [ -n "$1" ] && [ "$p" != "$1" ]; then
      continue
    fi
    git config --file .gitmodules --get "submodule.$sec.url"
  done
}
URLS=$(urls_for "$TARGET")
if [ -z "$URLS" ]; then
  # Probe çökarsa sessiz yetki hatasına döner; bunu kabul etmiyoruz.
  if [ -n "$TARGET" ]; then
    echo "::error::.gitmodules içinde '$TARGET' yoluna karşılık URL yok — probe edilemiyor."
  else
    echo "::error::.gitmodules okunamadı ya da alt modül kaydı yok — probe edilemiyor."
  fi
  exit 1
fi

DENIED=""
for url in $URLS; do
  if gitaux ls-remote --exit-code "$url" HEAD >/dev/null 2>&1; then
    echo "erişim OK   : $url"
  else
    echo "erişim YOK  : $url"
    DENIED="$DENIED $url"
  fi
done

if [ -n "$DENIED" ]; then
  if [ "$NEEDS" -eq 0 ]; then
    # Kayıtlı gitlink(ler) zaten çalışma ağacında → bu koşu fetch'e muhtaç değil.
    # İş düşürülmez (bugünkü davranış budur), ama uyarı kalıcı olsun: gitlink
    # değiştiren bir sonraki koşu düşecek.
    echo "::warning::SUBMODULE_PAT reddedildi:$DENIED — çalışma ağacı kayıtlı gitlink'lerde, fetch gerekmiyor; iş devam ediyor. Secret'ı DÖNDÜRÜN: fine-grained PAT, Contents: Read, yalnız 3 eklenti repo (son yazılış 2026-10-03). Gitlink değiştiren bir sonraki push düşecek."
    exit 0
  fi
  echo "::error::SUBMODULE_PAT reddedildi ya da bu repoya yetkili değil:$DENIED"
  echo "   Fetch ZORUNLU (alt modül boş ya da kayıtlı gitlink'ten farklı). Mekanizma 2026-10-23/10-25 gitlink bump koşularında bu tarifle yeşil geçti → credential sorunu. PAT'i döndürün ve repo secret'ını güncelleyin."
  exit 1
fi

if [ -n "$TARGET" ]; then
  gitaux submodule update --init --recursive -- "$TARGET"
else
  gitaux submodule update --init --recursive
fi
gitaux submodule status
