// Version-1 legacy catalogue only. The food-ordering catalogue is in food-menu.js.
// Prices are integer paise. Edit the seed before the first run; existing databases
// are deliberately never overwritten on startup. See docs/architecture.md.
export const menuSeed = [
  { id: 'velvet-latte', name: 'Velvet Latte', category: 'coffee', description: 'A double espresso, silky steamed milk, a little everyday magic.', price: 22000, image: 'latte.svg', badge: 'The crowd favourite', dietary: ['Vegetarian'] },
  { id: 'iced-brown-sugar', name: 'Iced Brown Sugar', category: 'coffee', description: 'Slow-sipped espresso, brown sugar, oat milk, and plenty of ice.', price: 26000, image: 'iced-coffee.svg', badge: 'BitesBro signature', dietary: ['Plant based'] },
  { id: 'classic-flat-white', name: 'Classic Flat White', category: 'coffee', description: 'Rich espresso meets a soft, velvety layer of microfoam.', price: 21000, image: 'flat-white.svg', badge: null, dietary: ['Vegetarian'] },
  { id: 'vanilla-matcha', name: 'Vanilla Cloud Matcha', category: 'matcha', description: 'Earthy Japanese matcha, oat milk, and a whisper of vanilla.', price: 28000, image: 'matcha.svg', badge: 'A little zen', dietary: ['Plant based'] },
  { id: 'butter-croissant', name: 'The Butter Croissant', category: 'bakes', description: 'Golden, gloriously flaky layers. Baked for slow mornings.', price: 18000, image: 'croissant.svg', badge: 'Fresh from the oven', dietary: ['Vegetarian', 'Contains gluten'] },
  { id: 'chocolate-cookie', name: 'Chocolate Chunk Cookie', category: 'bakes', description: 'Crisp edges, a soft centre, and generous dark chocolate.', price: 14000, image: 'cookie.svg', badge: null, dietary: ['Vegetarian', 'Contains gluten'] },
  { id: 'avocado-toast', name: 'Green Goodness Toast', category: 'bites', description: 'Smashed avocado, sourdough, cherry tomatoes, and chilli.', price: 34000, image: 'toast.svg', badge: 'A good start', dietary: ['Plant based', 'Contains gluten'] },
  { id: 'pesto-melt', name: 'The Pesto Melt', category: 'bites', description: 'Basil pesto, tomatoes, and melting mozzarella on sourdough.', price: 32000, image: 'sandwich.svg', badge: null, dietary: ['Vegetarian', 'Contains gluten', 'Contains nuts'] }
];
