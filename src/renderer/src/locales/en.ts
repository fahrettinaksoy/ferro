export default {
  common: {
    connect: 'Connect',
    disconnect: 'Disconnect',
    cancel: 'Cancel',
    ok: 'OK',
    save: 'Save',
    delete: 'Delete',
    refresh: 'Refresh',
    close: 'Close',
    rename: 'Rename',
    newFolder: 'New folder',
    up: 'Parent directory',
    name: 'Name',
    size: 'Size',
    modified: 'Modified',
    permissions: 'Permissions',
    empty: 'Empty directory'
  },
  connect: {
    server: 'Server',
    port: 'Port',
    user: 'User',
    password: 'Password',
    anonymous: 'Anonymous',
    verifyCert: 'Verify certificate',
    connecting: 'Connecting'
  },
  panes: {
    local: 'Local',
    remote: 'Remote Server',
    uploadToServer: 'Upload to server',
    downloadToLocal: 'Download to local',
    chmod: 'Permissions (chmod)',
    chmodTitle: 'Change permissions (octal)',
    edit: 'Edit (open locally)',
    deleteConfirm: 'Delete {name}. Are you sure?'
  },
  transfer: {
    title: 'Transfers',
    activeCount: '{count} active',
    clearCompleted: 'Clear completed'
  },
  log: {
    title: 'Log',
    clear: 'Clear',
    empty: 'No entries yet'
  },
  sites: {
    title: 'Site Manager',
    newSite: 'New site',
    siteName: 'Site name',
    folder: 'Folder (opt.)',
    protocol: 'Protocol',
    noSites: 'No saved sites',
    encWarning: 'OS encryption unavailable — passwords stored insecurely (base64).',
    savedPassword: '•••••• (saved)'
  },
  hostkey: {
    unknownTitle: 'Unknown Host Key',
    changedTitle: 'Host Key CHANGED',
    changedWarning:
      "This server's key differs from the saved one! It could be a man-in-the-middle (MITM) attack. Reject if unsure.",
    intro: 'Connecting to {host} for the first time. Verify the fingerprint:',
    note: 'If you trust it, the key is saved and you won’t be asked again.',
    trust: 'Trust and Connect',
    reject: 'Reject'
  },
  tls: {
    title: 'Untrusted Certificate',
    intro: 'The TLS certificate of {host} could not be verified:',
    note: 'This is normal for self-signed certificates. If you trust the server you may connect; your choice is saved.',
    trust: 'Trust and Connect',
    reject: 'Reject'
  },
  settings: {
    language: 'Language',
    theme: 'Theme',
    dark: 'Dark',
    light: 'Light',
    siteManager: 'Site Manager',
    bandwidth: 'Speed limit (KB/s, 0=unlimited)'
  },
  sync: {
    title: 'Directory Synchronization',
    button: 'Synchronize',
    directionUpload: 'Local → Server (upload)',
    directionDownload: 'Server → Local (download)',
    onlyLocal: 'Local only',
    onlyRemote: 'Remote only',
    differ: 'Different',
    same: 'Same',
    nothing: 'No differences to transfer',
    transferCount: '{count} item(s) to transfer',
    connectFirst: 'Connect to a server first'
  }
}
