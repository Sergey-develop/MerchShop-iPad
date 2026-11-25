import { catalogue } from '../catalogue'
import type { Prize } from '../types'

const images = import.meta.glob<string>('../assets/products/*.webp', { eager: true, import: 'default' })

function itemFor(prize?: Prize) {
  if (!prize) return undefined
  const name = prize.name.trim().toLocaleLowerCase('ru')
  return catalogue.find(item => item.name.toLocaleLowerCase('ru') === name ||
    item.previousName?.toLocaleLowerCase('ru') === name) ?? catalogue.find(item => item.id === prize.id)
}

export function prizeArtwork(prize?: Prize, portrait = false) {
  if (prize?.imageUrl) return prize.imageUrl
  const item = itemFor(prize)
  if (!item) return ''
  return images[`../assets/products/${item.artwork}${portrait ? '-result' : ''}.webp`] ?? ''
}

export function prizeLabel(prize?: Prize) {
  const item = itemFor(prize)
  return item?.name === prize?.name && item?.label ? item.label : prize?.name ?? ''
}
