export interface Session {
  code: string
  nickname: string
}

const STORAGE_KEY = 'scrum-poker.session'

/** Сессия живёт в текущей вкладке: перезагрузка не кидает из комнаты. */
export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'code' in parsed &&
      'nickname' in parsed &&
      typeof parsed.code === 'string' &&
      typeof parsed.nickname === 'string'
    ) {
      return { code: parsed.code, nickname: parsed.nickname }
    }
    return null
  } catch {
    return null
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Приватный режим — работаем без сохранения.
  }
}
