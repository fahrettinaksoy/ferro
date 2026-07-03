// ── Taslak (draft): açılışta store'dan kopyalanır, Tamam'da uygulanır. ──
// Alt sayfa bileşenleri bu tipi `draft` prop'u olarak alır ve alanları doğrudan
// değiştirir (reaktif nesne prop üzerinden paylaşıldığı için Vue reaktivitesi
// parent'taki taslağı günceller).
import type {
  LangChoice,
  ConnectionPrefs,
  FtpPrefs,
  TransferPrefs,
  TransferTypesPrefs,
  FileExistsPrefs,
  InterfacePrefs,
  PasswordPrefs,
  AppearancePrefs,
  DateTimePrefs,
  FileSizePrefs,
  FileListsPrefs,
  EditingPrefs,
  FileAssocPrefs,
  UpdatePrefs,
  LoggingPrefs,
  DebugPrefs,
  FtpActivePrefs,
  FtpPassivePrefs,
  FtpProxyPrefs,
  SftpPrefs,
  GenericProxyPrefs
} from '@renderer/stores/ui'

export interface Draft {
  languageChoice: LangChoice
  connection: ConnectionPrefs
  ftp: FtpPrefs
  transfer: TransferPrefs
  transferTypes: TransferTypesPrefs
  fileExists: FileExistsPrefs
  iface: InterfacePrefs
  passwords: PasswordPrefs
  appearance: AppearancePrefs
  dateTime: DateTimePrefs
  fileSize: FileSizePrefs
  fileLists: FileListsPrefs
  editing: EditingPrefs
  fileAssoc: FileAssocPrefs
  updates: UpdatePrefs
  logging: LoggingPrefs
  debug: DebugPrefs
  ftpActive: FtpActivePrefs
  ftpPassive: FtpPassivePrefs
  ftpProxy: FtpProxyPrefs
  sftp: SftpPrefs
  genericProxy: GenericProxyPrefs
}
