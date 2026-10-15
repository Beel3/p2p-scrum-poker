import fs from 'node:fs'
import path from 'node:path'
import type { FastifyReply } from 'fastify'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

function isFile(target: string): boolean {
  try {
    return fs.statSync(target).isFile()
  } catch {
    return false
  }
}

function mimeOf(target: string): string {
  return MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Отдаёт файл из каталога статики. Любая неизвестная страница ведёт на
 * index.html — SPA-fallback (ТЗ, раздел 8).
 */
export function sendStatic(webDist: string, rawUrl: string, reply: FastifyReply) {
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://internal').pathname)
  } catch {
    return reply.code(400).type('text/plain; charset=utf-8').send('Некорректный URL')
  }

  const indexPath = path.join(webDist, 'index.html')
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, '')
  const target = path.resolve(webDist, relative)

  // Защита от path traversal: файл обязан лежать внутри webDist.
  const inside = target === webDist || target.startsWith(webDist + path.sep)
  if (inside && isFile(target)) {
    return reply.type(mimeOf(target)).send(fs.createReadStream(target))
  }

  if (isFile(indexPath)) {
    return reply.type('text/html; charset=utf-8').send(fs.createReadStream(indexPath))
  }

  return reply
    .code(404)
    .type('text/plain; charset=utf-8')
    .send('Интерфейс не собран. Выполните: npm run build')
}
