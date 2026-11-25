import { beforeEach, describe, expect, it, vi } from 'vitest'
import { available, draw, getDraw, getState, issue, resetDemo, updateState, validateTokens, weightedChoice } from '../src/services/demo'

beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) })
  resetDemo()
})

describe('demo game rules', () => {
  it('upgrades the saved catalogue once and keeps custom prizes, inventory and draws', async () => {
    const drawResult = await draw(['1', '2', '3', '4'], 'before-upgrade')
    const state = getState()
    delete state.catalogueVersion
    state.prizes = state.prizes.filter(p => Number(p.id.split('-')[1]) <= 12 || p.id === drawResult.prizeId)
    state.inventory = state.inventory.filter(row => state.prizes.some(p => p.id === row.prizeId))
    const previousStock = structuredClone(state.inventory)
    const [socks, custom] = state.prizes
    socks!.name = 'Носки MAGNIT TECH'
    custom!.name = 'Особый приз'
    custom!.imageUrl = 'custom.webp'
    state.prizes.push({ ...custom!, id: 'prize-10', name: 'Пижама', imageUrl: '' })
    localStorage.setItem('magnit-merch-demo-v1', JSON.stringify(state))
    const upgraded = getState()
    expect(upgraded.prizes.filter(p => p.isActive)).toHaveLength(16)
    expect(upgraded.inventory).toHaveLength(17)
    expect(upgraded.inventory).toEqual(expect.arrayContaining(previousStock))
    expect(upgraded.prizes).toContainEqual(custom)
    expect(upgraded.prizes.find(p => p.id === socks!.id)?.name).toBe('Носки')
    expect(getDraw(drawResult.id)).toEqual(drawResult)
    expect(getState()).toEqual(upgraded)
  })
  it('starts with 775 items and one equal weight per product', () => {
    const { inventory } = getState()
    expect(inventory).toHaveLength(16)
    expect(inventory.reduce((n, row) => n + row.total, 0)).toBe(775)
    expect(inventory.every(row => row.weight === 1 && available(row) === row.total)).toBe(true)
    expect(inventory.find(row => row.prizeId === 'prize-14')?.total).toBe(1)
  })
  it('migrates both days without refilling reserved and issued stock', () => {
    const state = getState()
    const legacy = ['day-1', 'day-2'].flatMap((dayId, day) => state.inventory.map(row => ({
      ...row, dayId, total: 10, weight: 4,
      reserved: Number(row.prizeId === 'prize-1' && day === 0),
      issued: Number(row.prizeId === 'prize-1' && day === 1),
    })))
    localStorage.setItem('magnit-merch-demo-v1', JSON.stringify({ ...state, catalogueVersion: 2, inventory: legacy }))
    const upgraded = getState()
    expect(upgraded.inventory).toHaveLength(16)
    expect(upgraded.inventory[0]).toEqual({ prizeId: 'prize-1', total: 100, reserved: 1, issued: 1, weight: 1 })
    expect(available(upgraded.inventory[0]!)).toBe(98)
  })
  it('keeps the last copy sold out after a stale admin save, day switch and confirmation', async () => {
    const state = getState()
    for (const row of state.inventory) row.total = Number(row.prizeId === 'prize-14')
    await updateState(state)
    const stale = getState()
    const last = await draw(['1', '2', '3', '4'], 'last')
    stale.settings.activeDayId = 'day-2'
    await updateState(stale)
    await expect(draw(['1', '2', '3', '4'], 'day-two')).rejects.toThrow('закончились')
    const results = await Promise.allSettled([issue(last.id), issue(last.id)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const final = getState()
    expect(final.draws).toHaveLength(1)
    expect(final.inventory.find(row => row.prizeId === last.prizeId)).toMatchObject({total: 1, reserved: 0, issued: 1})
    await expect(draw(['1', '2', '3', '4'], 'after-issue')).rejects.toThrow('закончились')
  })
  it('checks four multi-digit numbers against configurable bounds', () => {
    const rules = { min: 1, max: 999, maxLength: 3 }
    expect(validateTokens(['12', '9', '99', '100'], rules)).toBeNull()
    expect(validateTokens(['12', '9', '99', 'x'], rules)).not.toBeNull()
    expect(validateTokens(['12', '9', '99', '1000'], rules)).not.toBeNull()
  })
  it('uses weights and excludes zero weights', () => {
    const choices = [{ weight: 0, id: 'zero' }, { weight: 1, id: 'a' }, { weight: 3, id: 'b' }]
    expect(weightedChoice(choices, 0)?.id).toBe('a')
    expect(weightedChoice(choices, 0.25)?.id).toBe('b')
    expect(weightedChoice(choices, 0.999)?.id).toBe('b')
    expect(weightedChoice([{ weight: 0 }], 0)).toBeUndefined()
  })
  it('reserves only one item under parallel requests and retries by key safely', async () => {
    const state = getState()
    state.inventory.forEach((row, i) => { row.total = i === 0 ? 1 : 0 })
    await updateState(state)
    const [a, b] = await Promise.allSettled([draw(['1', '2', '3', '4'], 'first'), draw(['1', '2', '3', '4'], 'second')])
    expect([a, b].filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(getState().draws).toHaveLength(1)
    const saved = getState().draws[0]
    expect((await draw(['1', '2', '3', '4'], saved.idempotencyKey)).id).toBe(saved.id)
    expect(getDraw(saved.id)?.id).toBe(saved.id)
    expect(available(getState().inventory.find(row => row.prizeId === saved.prizeId)!)).toBe(0)
  })
  it('shares stock across days and issues without another debit', async () => {
    const first = await draw(['1', '2', '3', '4'], 'one')
    const state = getState(); state.settings.activeDayId = 'day-2'; await updateState(state)
    const second = await draw(['1', '2', '3', '4'], 'two')
    expect(second.dayId).toBe('day-2')
    const before = getState().inventory.find(row => row.prizeId === first.prizeId)!
    await issue(first.id)
    const after = getState().inventory.find(row => row.prizeId === first.prizeId)!
    expect(available(after)).toBe(available(before))
    expect(after.issued).toBe(1)
    await expect(issue(first.id)).rejects.toThrow()
  })
})
