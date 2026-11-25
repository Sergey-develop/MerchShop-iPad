import { catalogue, type CatalogueItem } from '../catalogue'
import type { DemoState, Draw, Inventory, Prize, TokenRules } from '../types'

export const STORAGE_KEY = 'magnit-merch-demo-v1'
function createPrize(item: CatalogueItem): Prize {
  return { id: item.id, name: item.name, description: 'Демонстрационный приз', imageUrl: '', isActive: true }
}

function createInventory(item: CatalogueItem): Inventory {
  return { prizeId: item.id, total: item.quantity, reserved: 0, issued: 0, weight: 1 }
}

export function createDemoState(): DemoState {
  const prizes = catalogue.map(createPrize)
  const days = [{ id: 'day-1', label: 'День 1', date: '' }, { id: 'day-2', label: 'День 2', date: '' }]
  const inventory = catalogue.map(createInventory)
  return { catalogueVersion: 3, prizes, days, inventory, draws: [], settings: { telegramUrl: '', activeDayId: 'day-1', tokenRules: { min: 0, max: 9999, maxLength: 4 } } }
}

export function available(item: Inventory): number { return item.total - item.reserved - item.issued }

export function validateTokens(tokens: string[], rules: TokenRules): string | null {
  if (tokens.length !== 4) return 'Введите четыре числа.'
  if (!Number.isSafeInteger(rules.min) || !Number.isSafeInteger(rules.max) || rules.min < 0 || rules.max < rules.min || !Number.isSafeInteger(rules.maxLength) || rules.maxLength < 1) return 'Ошибка настройки диапазона токенов.'
  if (tokens.some(value => !/^\d+$/.test(value) || value.length > rules.maxLength || !Number.isSafeInteger(Number(value)) || Number(value) < rules.min || Number(value) > rules.max)) return `Введите числа от ${rules.min} до ${rules.max}, не более ${rules.maxLength} цифр.`
  return null
}

function assertState(state: DemoState): void {
  if (!state.days.some(day => day.id === state.settings.activeDayId)) throw new Error('Выберите существующий день.')
  const tokenError = validateTokens([String(state.settings.tokenRules.min), String(state.settings.tokenRules.min), String(state.settings.tokenRules.min), String(state.settings.tokenRules.min)], state.settings.tokenRules)
  if (tokenError) throw new Error(tokenError)
  for (const row of state.inventory) {
    if (![row.total, row.reserved, row.issued].every(x => Number.isSafeInteger(x) && x >= 0) || !Number.isFinite(row.weight) || row.weight < 0) throw new Error('Проверьте количества и веса призов.')
    if (available(row) < 0) {
      const name = state.prizes.find(p => p.id === row.prizeId)?.name ?? row.prizeId
      throw new Error(`«${name}»: в резерве и выдано ${row.reserved + row.issued} шт. Укажите общее количество не меньше этого числа.`)
    }
  }
}

export function getState(): DemoState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return createDemoState()
  const state = JSON.parse(raw) as DemoState
  if (state.catalogueVersion === undefined) {
    for (const item of catalogue) {
      const existing = state.prizes.find(p => p.id === item.id)
      if (existing) {
        if (existing.name === item.previousName) existing.name = item.name
      } else {
        state.prizes.push(createPrize(item))
      }
    }
    const retired = state.prizes.find(p => p.id === 'prize-10')
    if (retired?.name === 'Пижама' && !retired.imageUrl) retired.isActive = false
    state.catalogueVersion = 2
  }
  if (state.catalogueVersion === 2) {
    // Old installations had one inventory row per day. Keep every committed unit.
    state.inventory = state.prizes.map(prize => {
      const rows = state.inventory.filter(row => row.prizeId === prize.id)
      const reserved = rows.reduce((n, row) => n + row.reserved, 0)
      const issued = rows.reduce((n, row) => n + row.issued, 0)
      const quantity = catalogue.find(item => item.id === prize.id)?.quantity ?? rows.reduce((n, row) => n + row.total, 0)
      return { prizeId: prize.id, total: Math.max(quantity, reserved + issued), reserved, issued, weight: 1 }
    })
    state.catalogueVersion = 3
  }
  return state
}
function persist(state: DemoState): void {
  assertState(state)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function updateState(draft: DemoState): Promise<void> {
  return withLock(() => {
    const current = getState()
    if (draft.settingsRevision !== current.settingsRevision) throw new Error('Настройки изменились в другой вкладке. Откройте админку заново.')
    for (const row of current.inventory) {
      const edit = draft.inventory.find(item => item.prizeId === row.prizeId)
      if (edit) { row.total = edit.total; row.weight = edit.weight }
    }
    current.prizes = draft.prizes
    current.settings = draft.settings
    current.days = draft.days
    current.settingsRevision = (current.settingsRevision ?? 0) + 1
    persist(current)
  })
}

// Bootstrap and upgrades take the same lock as every inventory mutation.
export function initializeDemo(): Promise<void> {
  return withLock(() => {
    const state = getState()
    const data = JSON.stringify(state)
    if (localStorage.getItem(STORAGE_KEY) !== data) localStorage.setItem(STORAGE_KEY, data)
  })
}

export function resetDemo(): DemoState { const state = createDemoState(); persist(state); return state }
export function getDraw(keyOrId: string): Draw | undefined { return getState().draws.find(item => item.id === keyOrId || item.idempotencyKey === keyOrId) }

/** randomUnit must be in [0,1); injected for deterministic tests. */
export function weightedChoice<T extends { weight: number }>(items: T[], randomUnit: number): T | undefined {
  const eligible = items.filter(item => Number.isFinite(item.weight) && item.weight > 0)
  const total = eligible.reduce((sum, item) => sum + item.weight, 0)
  if (!(total > 0) || !Number.isFinite(total) || randomUnit < 0 || randomUnit >= 1) return undefined
  let value = randomUnit * total
  for (const item of eligible) { value -= item.weight; if (value < 0) return item }
  return eligible.at(-1)
}
function randomUnit(): number { const numbers = new Uint32Array(2); crypto.getRandomValues(numbers); return ((numbers[0] >>> 5) * 67108864 + (numbers[1] >>> 6)) / 9007199254740992 }
export function newDrawId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // WebKit's local app origin can expose getRandomValues without randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}
let pending: Promise<unknown> = Promise.resolve()
function withLock<T>(work: () => T): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(STORAGE_KEY, work)
  if (typeof window !== 'undefined') {
    // Overlapping read/write transactions on the same object store run serially across tabs.
    return new Promise<T>((resolve, reject) => {
      const open = indexedDB.open(STORAGE_KEY + '-lock', 1)
      open.onupgradeneeded = () => open.result.createObjectStore('inventory')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const transaction = db.transaction('inventory', 'readwrite')
        let result: T
        transaction.objectStore('inventory').get(0).onsuccess = () => {
          try { result = work() } catch (error) { transaction.abort(); reject(error) }
        }
        transaction.oncomplete = () => { db.close(); resolve(result) }
        transaction.onabort = () => { db.close(); reject(transaction.error) }
      }
    })
  }
  const next = pending.then(work, work); pending = next.catch(() => undefined); return next
}
export async function draw(tokens: string[], key: string): Promise<Draw> {
  if (!key) throw new Error('Отсутствует идентификатор запроса.')
  return withLock(() => {
    const state = getState()
    const existing = state.draws.find(item => item.idempotencyKey === key)
    if (existing) return existing
    const tokenError = validateTokens(tokens, state.settings.tokenRules)
    if (tokenError) throw new Error(tokenError)
    const eligible = state.inventory.filter(item => available(item) > 0 && state.prizes.some(prize => prize.id === item.prizeId && prize.isActive))
    const selected = weightedChoice(eligible, randomUnit())
    if (!selected) throw new Error('Доступные призы закончились. Обратитесь к организатору.')
    selected.reserved += 1
    const result: Draw = { id: newDrawId(), idempotencyKey: key, dayId: state.settings.activeDayId, prizeId: selected.prizeId, tokens: [...tokens], status: 'reserved', createdAt: new Date().toISOString() }
    state.draws.push(result)
    persist(state)
    return result
  })
}
export function issue(id: string): Promise<Draw> {
  return withLock(() => {
    const state = getState()
    const result = state.draws.find(item => item.id === id)
    if (!result) throw new Error('Выигрыш не найден.')
    if (result.status !== 'reserved') throw new Error('Этот выигрыш уже обработан.')
    const row = state.inventory.find(item => item.prizeId === result.prizeId)
    if (!row || row.reserved < 1) throw new Error('Резерв не найден.')
    row.reserved -= 1
    row.issued += 1
    result.status = 'issued'
    result.issuedAt = new Date().toISOString()
    persist(state)
    return result
  })
}
