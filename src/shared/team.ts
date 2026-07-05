// Ekip paylaşımı (sunucusuz, uçtan uca şifreli) ortak tipleri.
// ────────────────────────────────────────────────────────────────────────────
// Model: bir "ekip", paylaşılan bir uzak depoda (Gist/WebDAV) duran ŞİFRELİ bir
// kasadır. Kasa, ekibe özel rastgele bir "ekip anahtarı" (TK) ile şifrelenir; TK
// bir paroladan türetilmez, tam entropili 32 baytlık bir anahtardır. TK'yı ve
// depo erişim bilgisini yeni üyelere taşıyan araç, ayrı bir davet-PIN'i ile
// sarılmış "davet kodu"dur.
//
// GÜVENLİK SINIRLARININ DÜRÜST İFADESİ (sunucu yok):
//  • Roller (admin/üye/salt-okunur) İŞBİRLİKÇİDİR — UI düzeyinde uygulanır. TK'ya
//    ve depo jetonuna sahip herkes teknik olarak kasaya yazabilir; sunucu tarafı
//    bir zorlama yoktur. Rol, kötü niyetli bir üyeye karşı kriptografik bir
//    kalkan DEĞİL, işbirliği içindeki bir ekipte yetki düzenidir.
//  • Üyelik iptali kriptografik değildir: bir üyeyi çıkarmak onu listeden siler,
//    ama o üye eski TK'yı hâlâ biliyorsa erişimi teknik olarak sürer. Gerçek
//    iptal için anahtar döndürme (rotateKey) gerekir; bu, TK'yı yeniden üretip
//    kalan üyelere yeni davetle dağıtır (v1'de anahtar döndürme yeniden davet
//    gerektirir — ayrı akış).
//
// Tipler main (motor) ↔ renderer (UI) arasında ortaktır.

import type { SiteExportEntry } from './transfer'

/** Ekip kasasının barındığı uzak depo türü (sync sağlayıcılarıyla aynı küme). */
export type TeamProviderKind = 'gist' | 'webdav'

/** Üye rolü. Bkz. dosya başındaki "işbirlikçi" uyarısı. */
export type TeamRole = 'admin' | 'member' | 'readonly'

/** Paylaşılan kasadaki bir üye kaydı (roster). */
export interface TeamMember {
  /** Üyenin kendine atadığı rastgele kimlik (katılırken üretilir). */
  id: string
  /** Görünen ad (e-posta ya da isim). */
  name: string
  role: TeamRole
  /** ISO tarih — rostere eklenme anı. */
  addedAt: string
  /** Ekleyen üyenin adı (bilgi amaçlı; zorlama değil). */
  addedBy?: string
}

/**
 * Ekip anahtarıyla ŞİFRELENEN düz yük — yalnızca şifreleme sınırının İÇİNDE
 * bulunur. Uzak depo bunu asla düz görmez.
 */
export interface TeamPayload {
  kind: 'ferro-team-payload'
  version: 1
  teamId: string
  name: string
  updatedAt: string
  /**
   * İyimser eşzamanlılık sayacı. Her push'ta artar; çakışma tespiti ve
   * "kimin sürümü daha yeni" kararında kullanılır (son-yazan-kazanır).
   */
  revision: number
  /** Üye listesi (işbirlikçi roster). */
  members: TeamMember[]
  /** Ekiple paylaşılan siteler (parolalar DÜZ METİN — yük bütünüyle şifreli). */
  sites: SiteExportEntry[]
}

/**
 * Uzak depoya yazılan şifreli zarf. Şifreleme dışındaki alanlar sır İÇERMEZ
 * (teamId ve name yalnızca kolaylık içindir). `data`, TK ile şifreli
 * TeamPayload'dır. KDF yoktur: TK zaten tam entropili bir anahtardır.
 */
export interface TeamBlobFile {
  app: 'ferro'
  kind: 'ferro-team'
  version: 1
  teamId: string
  name: string
  updatedAt: string
  revision: number
  cipher: 'aes-256-gcm'
  /** base64 IV (12 bayt). */
  iv: string
  /** base64 şifreli veri + GCM etiketi (son 16 bayt). */
  data: string
}

/** Uzak depodaki ekip kasası dosyasının adı (her iki sağlayıcıda da aynı). */
export const TEAM_FILE_NAME = 'ferro-team.json'

/**
 * Davet kodunun İÇİNDEKİ düz yük — davet-PIN'i ile şifrelenir. Yeni üyenin
 * ekibe katılmak için ihtiyaç duyduğu her şeyi taşır: ekip anahtarı + depo
 * erişimi. Bu yük ASLA düz metin dolaşmaz; yalnızca PIN sınırının içinde.
 */
export interface TeamInvitePayload {
  /** base64 ekip anahtarı (32 bayt). */
  teamKey: string
  provider: TeamProviderKind
  gist?: { gistId: string; token: string }
  webdav?: { url: string; user: string; password: string }
}

/**
 * Davet zarfı (davet kodunun taşıdığı yapı). Şifreleme dışı alanlar sır
 * içermez ama davet kodunu ele geçiren biri teamName/role'ü görebilir — asıl
 * sır (TK, jeton) `data` içinde, PIN olmadan açılamaz.
 */
export interface TeamInviteFile {
  app: 'ferro'
  kind: 'ferro-invite'
  version: 1
  teamId: string
  teamName: string
  /** Davetlinin katılınca alacağı rol. */
  role: TeamRole
  kdf: { algo: 'scrypt'; salt: string; N: number; r: number; p: number }
  cipher: 'aes-256-gcm'
  iv: string
  /** base64 şifreli TeamInvitePayload + GCM etiketi. */
  data: string
}

/** Davet kodu string öneki: `ferro-invite-1.<base64url(JSON)>`. */
export const INVITE_CODE_PREFIX = 'ferro-invite-1.'

/** Renderer'a dönen ekip görünümü — sır İÇERMEZ (yalnızca var/yok). */
export interface TeamPublic {
  teamId: string
  name: string
  /** Bu cihazdaki kullanıcının ekipteki rolü. */
  role: TeamRole
  /** Bu cihazdaki kullanıcının ekipteki görünen adı. */
  memberName: string
  provider: TeamProviderKind
  /** Depo erişim bilgisi (jeton/parola) saklı mı — bağlanabilir mi. */
  hasCredentials: boolean
  /** Son çekilen roster'daki üye sayısı (yerel önbellek; boşsa 0). */
  memberCount: number
  /** Son çekilen kasadaki paylaşılan site sayısı (yerel önbellek; boşsa 0). */
  siteCount: number
  lastSyncAt: string | null
  lastRevision: number | null
}

/** Ekip oluşturma girdisi (renderer → main). */
export interface TeamCreateInput {
  name: string
  memberName: string
  provider: TeamProviderKind
  gist: { gistId: string; token: string }
  webdav: { url: string; user: string; password: string }
}

/** Davet koduyla ekibe katılma girdisi (renderer → main). */
export interface TeamJoinInput {
  code: string
  pin: string
  memberName: string
}

/** Davet oluşturma girdisi (renderer → main). */
export interface TeamInviteInput {
  teamId: string
  role: TeamRole
  pin: string
}
