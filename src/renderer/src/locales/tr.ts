export default {
  common: {
    connect: 'Bağlan',
    disconnect: 'Bağlantıyı Kes',
    cancel: 'İptal',
    ok: 'Tamam',
    save: 'Kaydet',
    delete: 'Sil',
    refresh: 'Yenile',
    close: 'Kapat',
    rename: 'Yeniden adlandır',
    newFolder: 'Yeni klasör',
    up: 'Üst dizin',
    name: 'Ad',
    size: 'Boyut',
    modified: 'Değişiklik',
    permissions: 'İzinler',
    empty: 'Boş dizin'
  },
  connect: {
    server: 'Sunucu',
    port: 'Port',
    user: 'Kullanıcı',
    password: 'Parola',
    anonymous: 'Anonim',
    verifyCert: 'Sertifika doğrula',
    connecting: 'Bağlanıyor'
  },
  panes: {
    local: 'Yerel',
    remote: 'Uzak Sunucu',
    uploadToServer: 'Sunucuya yükle',
    downloadToLocal: 'Yerele indir',
    chmod: 'İzinler (chmod)',
    chmodTitle: 'İzinleri Değiştir (octal)',
    edit: 'Düzenle (yerelde aç)',
    deleteConfirm: '{name} silinecek. Emin misiniz?'
  },
  transfer: {
    title: 'Transferler',
    activeCount: '{count} aktif',
    clearCompleted: 'Tamamlananları temizle'
  },
  log: {
    title: 'Günlük',
    clear: 'Temizle',
    empty: 'Henüz kayıt yok'
  },
  sites: {
    title: 'Site Yöneticisi',
    newSite: 'Yeni site',
    siteName: 'Site adı',
    folder: 'Klasör (ops.)',
    protocol: 'Protokol',
    noSites: 'Henüz kayıt yok',
    encWarning: 'OS şifreleme kullanılamıyor — parolalar güvensiz (base64) saklanır.',
    savedPassword: '•••••• (kayıtlı)'
  },
  hostkey: {
    unknownTitle: 'Bilinmeyen Host Anahtarı',
    changedTitle: 'Host Anahtarı DEĞİŞTİ',
    changedWarning:
      'Bu sunucunun anahtarı daha önce kaydedilenden farklı! Ortadaki adam (MITM) saldırısı olabilir. Sebebini bilmiyorsanız reddedin.',
    intro: '{host} sunucusuna ilk kez bağlanıyorsunuz. Parmak izini doğrulayın:',
    note: 'Güvenirseniz anahtar kaydedilir; sonraki bağlantılarda tekrar sorulmaz.',
    trust: 'Güven ve Bağlan',
    reject: 'Reddet'
  },
  tls: {
    title: 'Güvenilmeyen Sertifika',
    intro: '{host} sunucusunun TLS sertifikası doğrulanamadı:',
    note: 'Self-signed sertifikalarda bu normaldir. Sunucuya güveniyorsanız bağlanabilirsiniz; onayınız kaydedilir ve tekrar sorulmaz.',
    trust: 'Güven ve Bağlan',
    reject: 'Reddet'
  },
  settings: {
    language: 'Dil',
    theme: 'Tema',
    dark: 'Koyu',
    light: 'Açık',
    siteManager: 'Site Yöneticisi',
    bandwidth: 'Hız sınırı (KB/s, 0=sınırsız)'
  },
  sync: {
    title: 'Dizin Senkronizasyonu',
    button: 'Senkronize Et',
    directionUpload: 'Yerel → Sunucu (yükle)',
    directionDownload: 'Sunucu → Yerel (indir)',
    onlyLocal: 'Yalnızca yerel',
    onlyRemote: 'Yalnızca sunucu',
    differ: 'Farklı',
    same: 'Aynı',
    nothing: 'Aktarılacak fark yok',
    transferCount: '{count} öğe aktarılacak',
    connectFirst: 'Önce bir sunucuya bağlanın'
  }
}
