export interface Prize { id: string; name: string; description: string; imageUrl: string; isActive: boolean }
export interface Inventory { prizeId: string; total: number; reserved: number; issued: number; weight: number }
export interface EventDay { id: string; label: string; date: string }
export type DrawStatus = 'reserved' | 'issued' | 'cancelled'
export interface Draw { id: string; idempotencyKey: string; dayId: string; prizeId: string; tokens: string[]; status: DrawStatus; createdAt: string; issuedAt?: string }
export interface TokenRules { min: number; max: number; maxLength: number }
export interface DemoState { catalogueVersion?: number; settingsRevision?: number; prizes: Prize[]; days: EventDay[]; inventory: Inventory[]; draws: Draw[]; settings: { telegramUrl: string; activeDayId: string; tokenRules: TokenRules } }
