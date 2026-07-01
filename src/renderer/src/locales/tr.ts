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
    deleteConfirm: '{name} silinecek. Emin misiniz?',
    colName: 'Dosya adı',
    colSize: 'Boyut',
    colType: 'Dosya türü',
    colModified: 'Son değişiklik',
    colOwner: 'Sahip/Grup',
    typeFolder: 'Klasör',
    typeFile: 'Dosya',
    typeSymlink: 'Bağlantı',
    fileTypeExt: '{ext} dosyası',
    summary: '{files} dosya ve {folders} klasör. Toplam boyut: {bytes} bayt',
    notConnected: 'Bağlantı kurulmamış.',
    noConnection: 'Herhangi bir sunucu ile bağlantı kurulmamış'
  },
  transfer: {
    title: 'Transferler',
    activeCount: '{count} aktif',
    clearCompleted: 'Tamamlananları temizle',
    queued: 'Kuyruktakiler',
    completed: 'Aktarılanlar',
    failed: 'Aktarılmayanlar',
    empty: 'Öğe yok',
    cancel: 'İptal'
  },
  log: {
    title: 'Günlük',
    clear: 'Temizle',
    empty: 'Henüz kayıt yok'
  },
  toast: {
    connecting: 'Bağlanıyor…',
    connected: '{name} bağlandı',
    connectFailed: 'Bağlanılamadı: {msg}',
    disconnecting: 'Bağlantı kesiliyor…',
    disconnected: 'Bağlantı kesildi',
    siteSaving: 'Kaydediliyor…',
    siteSaved: 'Site kaydedildi',
    siteDeleting: 'Siliniyor…',
    siteDeleted: 'Site silindi',
    folderCreated: 'Klasör oluşturuldu',
    renamed: 'Yeniden adlandırıldı',
    deleted: 'Silindi',
    permsUpdated: 'İzinler güncellendi',
    transferDone: '{name} aktarıldı',
    transferFailed: '{name} aktarılamadı',
    error: 'Hata: {msg}'
  },
  hotkeys: {
    title: 'Klavye Kısayolları',
    refresh: 'Yenile',
    hint: 'Kısayollar bir metin alanına yazarken çalışmaz.'
  },
  sites: {
    title: 'Site Yöneticisi',
    newSite: 'Yeni site',
    siteName: 'Site adı',
    folder: 'Klasör (ops.)',
    group: 'Grup (ops.)',
    ungrouped: 'Gruplandırılmamış',
    protocol: 'Protokol',
    noSites: 'Henüz kayıt yok',
    encWarning: 'OS şifreleme kullanılamıyor — parolalar güvensiz (base64) saklanır.',
    savedPassword: '•••••• (kayıtlı)',
    servers: 'Sunucular',
    addServer: 'Sunucu Ekle',
    edit: 'Düzenle',
    disconnect: 'Bağlantıyı kes',
    tabs: {
      general: 'Genel',
      advanced: 'Gelişmiş',
      transfer: 'Aktarım ayarları',
      charset: 'Karakter kümesi'
    },
    protocolLabel: 'İletişim kuralı',
    encryption: 'Şifreleme',
    enc: {
      plain: 'Düz FTP kullan (güvensiz)',
      explicit: 'Olabiliyorsa TLS üzerinden açıkta FTP kullanılsın',
      implicit: 'Örtük TLS üzerinden FTP gerektir'
    },
    logonType: 'Oturum açma türü',
    logon: { anonymous: 'Anonim', normal: 'Normal' },
    bgColor: 'Arka plan rengi',
    notes: 'Notlar',
    color: {
      none: 'Yok',
      red: 'Kırmızı',
      green: 'Yeşil',
      blue: 'Mavi',
      yellow: 'Sarı',
      cyan: 'Camgöbeği',
      orange: 'Turuncu',
      purple: 'Mor'
    },
    serverType: 'Sunucu türü',
    srv: { auto: 'Otomatik algıla', unix: 'Unix', windows: 'Windows' },
    bypassProxy: 'Vekil sunucu atlansın',
    localDir: 'Varsayılan yerel klasör',
    remoteDir: 'Varsayılan uzak klasör',
    browse: 'Göz at…',
    syncBrowsing: 'Eş zamanlı tarama kullanılsın',
    dirComparison: 'Klasör karşılaştırma kullanılsın',
    timezone: 'Sunucu saat dilimi farkı',
    hours: 'Saat',
    minutes: 'Dakika',
    transferMode: 'Aktarım yöntemi',
    mode: { default: 'Varsayılan', active: 'Aktif', passive: 'Pasif' },
    limitConnections: 'Eş zamanlı bağlantı sayısı sınırlansın',
    maxConnections: 'En fazla bağlantı sayısı',
    charsetIntro: 'Sunucu dosya adlarında kullanılacak karakter kümesi:',
    charsetUtf8: 'UTF-8',
    charsetCustom: 'Özel karakter kümesi kullanılsın',
    encodingLabel: 'Kodlama',
    charsetNote: 'Yanlış karakter kümesi seçilirse dosya adları düzgün görüntülenmeyebilir.'
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
    title: 'Ayarlar',
    selectPage: 'Sayfa seçin:',
    language: 'Dil',
    theme: 'Tema',
    dark: 'Koyu',
    light: 'Açık',
    siteManager: 'Site Yöneticisi',
    bandwidth: 'Hız sınırı (KB/s, 0=sınırsız)',
    placeholder: 'Bu sayfanın içeriği bir sonraki adımda eklenecek.',
    // Ağaç sayfa adları
    pages: {
      connection: 'Bağlantı',
      ftp: 'FTP',
      ftpActive: 'Aktif kip',
      ftpPassive: 'Pasif kip',
      ftpProxy: 'FTP vekil sunucusu',
      sftp: 'SFTP',
      genericProxy: 'Genel vekil sunucu',
      transfer: 'Aktarım',
      transferTypes: 'FTP: Dosya türleri',
      transferExists: 'Dosya var işlemi',
      interface: 'Arayüz',
      passwords: 'Parolalar',
      themes: 'Temalar',
      dateTime: 'Tarih/saat biçimi',
      fileSize: 'Dosya boyutu biçimi',
      fileLists: 'Dosya listeleri',
      lang: 'Dil',
      editing: 'Dosya düzenleme',
      fileAssoc: 'Dosya türü ilişkileri',
      updates: 'Güncelleme',
      logging: 'Günlük',
      debug: 'Hata ayıklama'
    },
    // Bağlantı sayfası
    connection: {
      timeoutTitle: 'Zaman aşımı',
      timeoutLabel: 'Zaman aşımı (saniye):',
      timeoutHint:
        'Bir işlem sırasında, belirtilen sürede hiç veri gönderilip alınamazsa, bağlantı kapatılır ve Ferro yeniden bağlanmayı dener.',
      timeoutRange: '(10-9999, kapatmak için 0)',
      reconnectTitle: 'Yeniden bağlantı kurma ayarları',
      maxRetries: 'En fazla bağlanma denemesi:',
      maxRetriesRange: '(0-99)',
      retryDelay: 'Başarısız bağlantılar arası bekleme süresi:',
      retryDelayRange: '(0-999 saniye)',
      reconnectHint:
        'Kısa aralıklarla üst üste bağlanmaya çalışacağınız bazı sunucuların sizi yasaklayabileceğini unutmayın.',
      tlsTitle: 'TLS seçenekleri',
      tlsMinVersion: 'Kullanılabilecek en düşük TLS sürümü:',
      tlsSystemTrust: 'TLS sertifikaları için sistem güvenliği kullanılsın'
    },
    // FTP sayfası
    ftp: {
      generalTitle: 'Genel açıklama',
      generalHint:
        'Bu seçeneklerin ne işe yaradığını daha iyi anlamak için ağ yapılandırma yardımcısını çalıştırın.',
      wizardBtn: 'Ağ ayar yardımcısını başlat...',
      modeTitle: 'Aktarım kipi',
      passive: 'Pasif (önerilen)',
      active: 'Aktif',
      fallback: 'Hata durumunda diğer aktarım yöntemi kullanılsın',
      modeHint:
        'Klasörleri listelemekte ya da dosya aktarımında sorun yaşıyorsanız, varsayılan aktarım kipini değiştirmeyi deneyin.',
      keepAliveTitle: 'FTP canlı tutma',
      keepAlive: 'FTP canlı tutma komutları gönderilsin',
      keepAliveHint:
        'Normal bir sunucu için gerekmez. Kullanmanız gerekiyorsa sunucu yöneticisi ile görüşün.'
    },
    // Aktarım sayfası
    transferOpts: {
      concurrentTitle: 'Eşzamanlı aktarım',
      concurrent: 'Eşzamanlı aktarım:',
      concurrentRange: '(En çok: 1-10)',
      concurrentDownload: 'Eşzamanlı indirme:',
      concurrentUpload: 'Eşzamanlı yükleme:',
      unlimitedZero: '(Sınırsız için 0)',
      speedTitle: 'Hız sınırlaması',
      enableSpeed: 'Hız sınırlaması yapılsın',
      downloadLimit: 'İndirme sınırı:',
      uploadLimit: 'Yükleme sınırı:',
      kibs: '(KiB/s)',
      tolerance: 'Hoşgörü:',
      tolLow: 'Düşük',
      tolNormal: 'Normal',
      tolHigh: 'Yüksek',
      invalidTitle: 'Dosya adlarındaki geçersiz karakterler',
      invalidHint:
        'Yerel işletim sisteminin dosya adlarında desteklemediği karakterler, böyle bir dosya indirilirken değiştirilir.',
      replaceWith: 'Geçersiz karakterler şununla değiştirilsin:',
      charToReplace: 'Şu karakter değiştirilecek: /',
      preallocTitle: 'Yer ayırma',
      prealloc: 'İndirmeden önce yer ayrılsın'
    },
    // Aktarım → FTP: Dosya türleri sayfası
    transferTypes: {
      defaultTitle: 'Varsayılan aktarım türü:',
      auto: 'Otomatik',
      ascii: 'ASCII',
      binary: 'Binary',
      autoTitle: 'Otomatik dosya türü sınıflandırması',
      asciiListLabel: 'ASCII olarak algılanacak dosya türleri:',
      add: 'Ekle',
      remove: 'Sil',
      malformedHint: 'Hatalı yazılan türler aktarım sırasında bozulabilir.',
      noExt: 'Uzantısı olmayan dosyalar ASCII olarak kabul edilsin',
      dotfiles: 'Noktalı dosyalar ASCII olarak kabul edilsin',
      dotfilesNote: '*Noktalı dosyalar: .htaccess gibi adı nokta ile başlayan dosyalar'
    },
    // Aktarım → Dosya var işlemi sayfası
    fileExists: {
      intro: 'Aktarılan hedef dosya zaten var ise yapılmasını istediğiniz işlemi seçin.',
      defaultTitle: 'Varsayılan dosya var işlemi',
      download: 'İndirme:',
      upload: 'Yükleme:',
      timeHint:
        "'Daha yeni ise üzerine yazılsın' seçeneğinin kullanılabilmesi için sistem saati sunucu saati ile aynı olmalıdır. Sistem ile sunucunun saatleri farklı ise (farklı saat dilimlerinde olmaları gibi), site yöneticisi bölümünden saat farkını ayarlayın.",
      asciiResume: 'ASCII dosyalar sürdürülebilsin',
      asciiResumeHint: 'Sunucu ile istemcinin satır sonu karakteri farklı ise sorunlara yol açabilir.',
      actAsk: 'Ne yapılacağı sorulsun',
      actOverwrite: 'Üzerine yazılsın',
      actOverwriteNewer: 'Daha yeni ise üzerine yazılsın',
      actOverwriteSize: 'Boyut farklı ise üzerine yazılsın',
      actResume: 'Sürdürülsün',
      actRename: 'Yeniden adlandırılsın',
      actSkip: 'Atlansın'
    },
    // Arayüz sayfası
    iface: {
      layoutTitle: 'Yerleşim',
      layoutLabel: 'Dosya ve klasör pencerelerinin yerleşimi:',
      layoutClassic: 'Klasik',
      layoutExplorer: 'Gezgin',
      layoutSideBySide: 'Yan yana iki taraflı',
      layoutTopBottom: 'Üst alt iki taraflı',
      msgLogLabel: 'İleti günlüğün konumu:',
      msgLogAbove: 'Yerel ve uzak dosya gezginlerinin üzerinde',
      msgLogTab: 'Dosya panolarında sekme olarak',
      msgLogHidden: 'Gizli',
      swapPanes: 'Yerel ve uzak panoların yeri değiştirilsin',
      behaviourTitle: 'Davranış',
      preventSleep: 'Sistem, aktarım ve diğer işlemler sırasında askıya alınmasın',
      startupLabel: 'Ferro başlatılırken:',
      startupNormal: 'Normal olarak başlatılsın',
      startupSiteManager: 'Açılışta site yöneticisi görüntülensin',
      startupRestore: 'Sekmeler geri yüklensin ve yeniden bağlantı kurulsun',
      newConnLabel: 'Zaten bağlıyken yeni bir bağlantı başlatıldığında:',
      newConnAsk: 'Ne yapılacağı sorulsun',
      newConnNewTab: 'Yeni sekmede başlatılsın',
      newConnCurrentTab: 'Mevcut sekmede başlatılsın',
      forceRefresh:
        'Uzak alt klasör işlemleri sırasında klasör listelerinin yenilenmesi dayatılsın',
      queueTitle: 'Aktarım kuyruğu',
      showInstantRate: 'Ortalama aktarım hızı yerine anlık aktarım hızı görüntülensin'
    },
    // Parolalar sayfası
    passwords: {
      save: 'Parolalar kaydedilsin',
      dontSave: 'Parolalar kaydedilmesin',
      master: 'Parolalar bir ana parola ile korunarak kaydedilsin',
      masterPw: 'Ana parola:',
      masterPwConfirm: 'Parola onayı:',
      masterWarning: 'Ana parola kaybedilirse kurtarılamaz! Lütfen parolanızı iyi saklayın.'
    },
    // Dil sayfası
    langPage: {
      selectLabel: 'Dil seçimi:',
      systemDefault: 'Varsayılan sistem dili',
      instantNote: 'Dil değişikliği anında uygulanır.',
      previewLabel: 'Önizleme (seçilen dil):'
    },
    // Temalar sayfası
    themesPage: {
      selectionTitle: 'Tema seçimi',
      themeLabel: 'Tema:',
      scaleLabel: 'Ölçek çarpanı:',
      note: 'Ferro koyu/açık tema kullanır; ayrı bir ikon teması yoktur.',
      previewLabel: 'Önizleme (aktif tema)',
      previewSample: 'Örnek metin ve renkler',
      colorsTitle: 'Renkler',
      primaryLabel: 'Ana renk (seed)',
      schemeTitle: 'Şema ve Karıştırıcı',
      schemeLabel: 'Şema',
      variantTitle: 'Varyant ve Kontrast',
      contrastLabel: 'Kontrast',
      contrastStandard: 'Standart',
      contrastMedium: 'Orta',
      contrastHigh: 'Yüksek',
      fontsTitle: 'Yazı Tipleri',
      headingFont: 'Başlıklar',
      bodyFont: 'Gövde',
      fontSizeRoot: 'Kök yazı boyutu'
    },
    // Tarih/saat biçimi sayfası
    dateTime: {
      dateTitle: 'Tarih biçimi',
      timeTitle: 'Saat biçimi',
      systemDefault: 'Geçerli dilin sistem varsayılanları kullanılsın',
      isoDate: 'ISO 8601 (örnek: 2007-09-15)',
      isoTime: 'ISO 8601 (örnek: 15:47)',
      custom: 'Özel biçim',
      dateExample: '(örnek: %Y-%m-%d)',
      timeExample: '(örnek: %H-%M-%S)',
      moreInfo: 'Özel tarih ve saat biçimleri hakkında ayrıntılı bilgi'
    },
    // Dosya boyutu biçimi sayfası
    fileSize: {
      title: 'Boyut biçimi',
      bytes: 'Boyut bayt olarak görüntülensin',
      iec: 'IEC ikili sistem ön ekleri (örnek 1KiB = 1024 bayt)',
      siBinary: 'SI sembollerini kullanan ikili sistem ön ekleri. (örnek: 1 KB = 1024 bayt)',
      siDecimal: 'Ondalık ön ekleri kullanan SI sembolleri (örnek: 1 KB = 1000 bayt)',
      thousandsSep: 'Binlik basamak ayracı kullanılsın',
      decimals: 'Ondalık basamak sayısı:',
      examplesTitle: 'Örnekler'
    },
    // Dosya listeleri sayfası
    fileLists: {
      sortTitle: 'Sıralama',
      sortMode: 'Sıralama kipi:',
      sortDirsFirst: 'Klasörler öncelikli (varsayılan)',
      sortFilesFirst: 'Dosyalar öncelikli',
      sortMixed: 'Karışık',
      nameSort: 'Ad sıralama kipi:',
      nameCaseSensitive: 'Büyük küçük harfe duyarlı (varsayılan)',
      nameCaseInsensitive: 'Büyük küçük harfe duyarsız',
      nameNatural: 'Doğal sıralama',
      compareTitle: 'Klasör karşılaştırma kullanılsın',
      compareHint:
        'Zamana göre karşılaştırma yapılırken, aradaki fark burada belirtilen eşik değerini aşmıyorsa, farklı zamana sahip dosyalar aynı kabul edilir.',
      compareThreshold: 'Karşılaştırma eşiği (dakika cinsinden):',
      dblTitle: 'Çift tıklama eylemleri',
      dblFile: 'Çift tıklanan dosyalara yapılacak işlem:',
      dblDir: 'Çift tıklanan klasörlere yapılacak işlem:',
      dblTransfer: 'Aktarılsın',
      dblViewEdit: 'Görüntülensin/Düzenlensin',
      dblNone: 'Hiçbir şey',
      dblOpen: 'Açılsın'
    },
    // Dosya düzenleme sayfası
    editing: {
      defaultTitle: 'Varsayılan düzenleyici:',
      none: 'Varsayılan düzenleyici kullanılmasın',
      system: 'Metin dosyaları için varsayılan sistem düzenleyicisi kullanılsın',
      custom: 'Şu özel düzenleyici kullanılsın:',
      browse: 'Göz at...',
      quoteHint: 'Komut ve parametreleri doğru şekilde tırnak içinde yazılmalıdır.',
      quoteRules: 'Tırnak arasına alma kuralları',
      useAssoc: 'Varsa dosya ilişkilendirmeleri kullanılsın',
      alwaysDefault: 'Her zaman varsayılan düzenleyici kullanılsın',
      watchChanges: 'Yerel olarak düzenlenen dosyalar izlenerek değişikliklerin kaydedilmesi sorulsun'
    },
    // Dosya türü ilişkileri sayfası
    fileAssoc: {
      label: 'Özel dosya türü ilişkileri:',
      formatHint: 'Biçim: Dosya türünü izleyecek şekilde tırnak içine komutu ve ardına parametreleri yazın.',
      example: 'Örnek: png "c:\\program files\\viewer\\viewer.exe" -open',
      quoteRules: 'Tırnak arasına alma kuralları'
    },
    // Güncelleme sayfası
    updates: {
      title: 'Ferro güncellemeleri',
      frequency: 'Güncelleme denetimi sıklığı:',
      freqDaily: 'Günde bir',
      freqWeekly: 'Haftada bir',
      freqNever: 'Hiçbir zaman',
      channel: 'Denetlenecek güncelleme sürümleri:',
      chStable: 'Yalnızca kararlı sürümler',
      chBeta: 'Kararlı ve deneme sürümleri',
      chNightly: 'Kararlı, deneme ve gecelik sürümler',
      recommendation:
        'Öneri: Yeni özellikleri denemek istediğiniz durumların dışında, kararlı sürümleri kullanın. Deneme sürümleri ve gecelik yapımlar, deneme amacıyla kullanılabilecek geliştirme sürümleridir. Gecelik yapımlar beklendiği gibi çalışmayarak sisteminize zarar verebilir. Deneme sürümleri ve gecelik yapımları kullanmaktan doğabilecek zararları üstlenme riski size aittir.',
      checkNow: 'Güncellemeleri denetle...',
      privacyHint:
        'Güncellemeleri denetlemek için Ferro sürümü, işletim sisteminiz ve işlemci mimariniz gibi bilgilerin gönderilmesi gerekir. Yalnızca gerekli veriler gönderilir. Gönderilen veriler anonimleştirilip derlenmiştir.',
      privacyPolicy: 'Gizlilik ilkesi'
    },
    // Günlük sayfası
    logging: {
      timestamps: 'Günlük kayıtlarına zaman eklensin',
      toFile: 'Günlük kayıtları dosyalansın',
      fileName: 'Dosya adı:',
      browse: 'Göz at',
      limitSize: 'Günlük dosyası boyutunun sınırı',
      limit: 'Sınır:',
      mib: 'MiB',
      rotateHint:
        'Günlük dosyasının boyutu belirtilen sınıra gelirse dosya adının sonuna ".1" eklenerek (daha eski günlük dosyalarının üzerine yazılabilir) yeniden adlandırılır ve yeni bir dosya oluşturulur.'
    },
    // Hata ayıklama sayfası
    debug: {
      title: 'Hata ayıklama ayarları',
      showMenu: 'Hata ayıklama menüsü görüntülensin',
      level: 'Hata ayıklama günlüğünün düzeyi:',
      lvl0: '0 - Yok',
      lvl1: '1 - Uyarı',
      lvl2: '2 - Bilgi',
      lvl3: '3 - Ayrıntılı',
      lvl4: '4 - Hata ayıklama',
      levelHint:
        'Hata ayıklama düzeyi yükseldikçe ileti günlüğüne daha fazla bilgi yazılır. Hata ayıklama bilgilerinin görüntülenmesi başarımı düşürür.',
      reportHint: 'Bir hata bildirirken günlükleri "Ayrıntılı" günlükleme düzeyinde gönderin.',
      rawListing: 'Ham klasör listesi görüntülensin'
    },
    // Aktif kip sayfası
    ftpActive: {
      portTitle: 'Yerel bağlantı noktası sınırlaması',
      limitPorts: 'Ferro tarafından kullanılabilecek yerel bağlantı noktaları sınırlansın',
      limitHint:
        'Varsayılan olarak, Ferro aktif kipte aktarım için var olan herhangi bir yerel bağlantı noktasını kullanabilir. Yalnızca belli bir aralıktaki bağlantı noktalarının kullanılmasını istiyorsanız bu aralığı aşağıya yazın.',
      portMin: 'Kullanılabilecek en küçük bağlantı noktası:',
      portMax: 'Kullanılabilecek en büyük bağlantı noktası:',
      ipTitle: 'Aktif kip IP adresi',
      ipHint: 'Aktif kipi kullanabilmek için, Ferro, dış IP adresinizi bilmelidir.',
      ipAskOs: 'Dış IP adresi işletim sistemine sorulsun',
      ipFixed: 'Şu IP adresi kullanılsın:',
      ipFixedHint:
        'Bir yönlendiricinin arkasındaysanız ve sabit bir dış IP adresiniz varsa bu seçeneği işaretleyin.',
      ipUrl: 'Dış IP adresi şu adresten alınsın:',
      ipUrlDefault: 'Varsayılan: http://ip.filezilla-project.org/ip.php',
      noExternalForLocal: 'Yerel bağlantılar için dış IP adresi kullanılmasın.'
    },
    // Pasif kip sayfası
    ftpPassive: {
      title: 'Pasif kip',
      hint: 'Yönlendiricilerin arkasında çalışan, bazı hatalı ayarlanmış sunucular kendi yerel IP adresleri ile yanıt verebilir.',
      useServerIp: 'Yerine sunucunun dış IP adresi kullanılsın',
      fallbackActive: 'Aktif kipe geçilsin'
    },
    // FTP vekil sunucusu sayfası
    ftpProxy: {
      title: 'FTP vekil sunucusu',
      typeLabel: 'FTP vekil sunucu türü:',
      none: 'Yok',
      custom: 'Özel biçim',
      specifiers: 'Biçim özellikleri:',
      spec1: '%h - Sunucu    %u - Kullanıcı adı    %p - Parola',
      spec2: '%a - Hesap (Hesap giriş türü kullanılmıyorsa bunu içeren satırlar dikkate alınmaz)',
      spec3: '%s - Vekil sunucu kullanıcı adı    %w - Vekil sunucu parolası',
      host: 'Vekil sunucu:',
      user: 'Vekil sunucu kullanıcı adı:',
      password: 'Vekil sunucu parolası:',
      note: 'Not: Bu özellik yalnızca düz ve şifrelenmemiş bir FTP bağlantısı ile çalışır.'
    },
    // SFTP sayfası
    sftp: {
      title: 'Herkese açık anahtar kimlik doğrulaması',
      hint: 'Ferro herkese açık anahtar yetkilendirmesini kullanabilmek için kişisel anahtarınızı bilmek zorundadır.',
      keysLabel: 'Kişisel anahtarlar:',
      colFile: 'Dosya adı',
      colComment: 'Not',
      colType: 'Tür',
      colFingerprint: 'Fingerprint',
      addKey: 'Anahtar dosyası ekle...',
      removeKey: 'Anahtarı sil',
      empty: 'Henüz anahtar eklenmedi',
      sshAgentHint:
        'Alternatif olarak sisteminizdeki SSH programını kullanabilirsiniz. Bunu yapmak için SSH_AUTH_SOCK değişkeninin ayarlandığından emin olun.'
    },
    // Genel vekil sunucu sayfası
    genericProxy: {
      title: 'Genel vekil sunucu',
      typeLabel: 'Genel vekil sunucu türü:',
      none: 'Yok',
      http: 'CONNECT yöntemi kullanılarak HTTP/1.1',
      socks4: 'SOCKS 4',
      socks5: 'SOCKS 5',
      host: 'Vekil sunucu:',
      port: 'Vekil sunucu bağlantı noktası:',
      user: 'Vekil sunucu kullanıcı adı:',
      password: 'Vekil sunucu parolası:',
      note: 'Not: Genel bir vekil sunucu yalnızca pasif kip FTP bağlantılarının kurulmasına izin verir.'
    }
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
