export interface CatalogueItem {
  id: string
  name: string
  quantity: number
  artwork: string
  previousName?: string
  label?: string
}

export const catalogue: CatalogueItem[] = [
  { id: 'prize-1', quantity: 100, name: 'Носки', artwork: 'socks', previousName: 'Носки MAGNIT TECH' },
  { id: 'prize-2', quantity: 100, name: 'Мультитул', artwork: 'multitool' },
  { id: 'prize-3', quantity: 100, name: 'Брелок', artwork: 'keyring', previousName: 'Карабин' },
  { id: 'prize-4', quantity: 100, name: 'Бутылка', artwork: 'bottle', previousName: 'Бутылка для воды' },
  { id: 'prize-5', quantity: 100, name: 'Коврик', artwork: 'mousepad', previousName: 'Коврик для мыши' },
  { id: 'prize-6', quantity: 50, name: 'Футболка с принтом', artwork: 'graphic-shirt', previousName: 'Футболка MAGNIT TECH', label: 'Футболка' },
  { id: 'prize-7', quantity: 5, name: 'Шарфик', artwork: 'scarf', previousName: 'Шарф' },
  { id: 'prize-8', quantity: 5, name: 'Худи на замке', artwork: 'hoodie', previousName: 'Худи' },
  { id: 'prize-9', quantity: 15, name: 'Рюкзак', artwork: 'backpack' },
  { id: 'prize-11', quantity: 2, name: 'Серая футболка', artwork: 'gray-shirt', previousName: 'Новая серая футболка MAGNIT TECH', label: 'Футболка' },
  { id: 'prize-12', quantity: 2, name: 'Лонгслив', artwork: 'longsleeve', previousName: 'Новый белый лонгслив MAGNIT TECH' },
  { id: 'prize-13', quantity: 60, name: 'Магнитный бой', artwork: 'magnetic-game' },
  { id: 'prize-14', quantity: 1, name: 'Чёрная футболка', artwork: 'black-shirt', label: 'Футболка' },
  { id: 'prize-15', quantity: 5, name: 'Шнурок', artwork: 'lanyard' },
  { id: 'prize-16', quantity: 50, name: 'Чехол на чемодан', artwork: 'suitcase' },
  { id: 'prize-17', quantity: 80, name: 'Шнурок для телефона', artwork: 'phone-strap' },
]
