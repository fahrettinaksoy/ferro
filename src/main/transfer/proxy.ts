import { Socket, connect as netConnect } from 'net'
import { SocksClient } from 'socks'
import type { ProxyConfig } from '@shared/transfer'
import { FerroError } from '@shared/errors'

// Vekil sunucu üzerinden hedefe bir TCP soketi kurar. ssh2'nin `sock` seçeneğine
// verilir; böylece SFTP bağlantısı proxy üzerinden akar. SOCKS4/5 `socks` paketiyle,
// HTTP CONNECT elle yapılır.

/** HTTP CONNECT tüneli açar ve kurulan soketi döndürür. */
function httpConnect(proxy: ProxyConfig, destHost: string, destPort: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect(proxy.port, proxy.host)
    const onError = (err: Error): void => {
      socket.destroy()
      reject(new FerroError('CONNECTION_FAILED', 'HTTP proxy bağlantısı başarısız', err.message))
    }
    socket.once('error', onError)
    socket.once('connect', () => {
      const auth =
        proxy.user !== undefined && proxy.user !== ''
          ? `Proxy-Authorization: Basic ${Buffer.from(`${proxy.user}:${proxy.password ?? ''}`).toString('base64')}\r\n`
          : ''
      const req =
        `CONNECT ${destHost}:${destPort} HTTP/1.1\r\n` +
        `Host: ${destHost}:${destPort}\r\n` +
        auth +
        `\r\n`
      socket.write(req)
      socket.once('data', (chunk: Buffer) => {
        const statusLine = chunk.toString('utf8').split('\r\n')[0]
        // "HTTP/1.1 200 Connection established"
        if (/\s2\d\d\s/.test(statusLine)) {
          socket.removeListener('error', onError)
          resolve(socket)
        } else {
          socket.destroy()
          reject(new FerroError('CONNECTION_FAILED', `HTTP proxy reddetti: ${statusLine}`))
        }
      })
    })
  })
}

/** Vekil türüne göre hedefe soket kurar. */
export async function connectViaProxy(
  proxy: ProxyConfig,
  destHost: string,
  destPort: number
): Promise<Socket> {
  if (proxy.type === 'http') {
    return httpConnect(proxy, destHost, destPort)
  }
  if (proxy.type === 'socks4' || proxy.type === 'socks5') {
    const info = await SocksClient.createConnection({
      proxy: {
        host: proxy.host,
        port: proxy.port,
        type: proxy.type === 'socks4' ? 4 : 5,
        userId: proxy.user || undefined,
        password: proxy.password || undefined
      },
      command: 'connect',
      destination: { host: destHost, port: destPort }
    }).catch((err: Error) => {
      throw new FerroError('CONNECTION_FAILED', 'SOCKS proxy bağlantısı başarısız', err.message)
    })
    return info.socket as Socket
  }
  throw new FerroError('VALIDATION', `Desteklenmeyen proxy türü: ${proxy.type}`)
}
