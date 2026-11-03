// Editable sample food catalogue. All prices and option surcharges use paise.
export const categories = [
  ['south-indian','South Indian'],['north-indian','North Indian'],['biryani','Biryani & rice'],
  ['chinese','Indo-Chinese'],['global','Pizza, burgers & pasta'],['snacks','Street bites'],
  ['desserts','Desserts'],['beverages','Drinks']
].map(([id,name])=>({id,name}));
const rows = [
 ['masala-dosa','Bangalore Masala Dosa','south-indian',120,'Crisp golden dosa, spiced potato masala, sambar and two chutneys.','veg','dosa','Mustard','1 dosa + sides','Rice, urad dal, potato, curry leaves'],
 ['mysore-dosa','Mysore Masala Dosa','south-indian',140,'Red-chutney dosa with potato filling and a proper Mysore kick.','veg','dosa','Mustard','1 dosa + sides','Rice, lentils, potato, red chilli, garlic'],
 ['ghee-roast','Ghee Roast Dosa','south-indian',130,'Thin, lacy and golden with ghee. Simple things, done beautifully.','veg','dosa','Milk','1 dosa + sides','Rice, urad dal, ghee'],
 ['rava-dosa','Onion Rava Dosa','south-indian',140,'A lacy semolina dosa with onions, cumin and green chilli.','vegan','dosa','Gluten','1 dosa + sides','Semolina, rice flour, onion, cumin'],
 ['set-dosa','Soft Set Dosa','south-indian',110,'Three fluffy dosas with vegetable saagu and coconut chutney.','veg','idli','','3 dosas + sides','Rice, lentils, vegetables, coconut'],
 ['cheese-dosa','Cheese Masala Dosa','south-indian',170,'Our crisp masala dosa with a generous, melty layer of cheese.','veg','dosa','Milk','1 dosa + sides','Rice, lentils, potato, cheese'],
 ['podi-idli','Ghee Podi Idli','south-indian',120,'Soft mini idlis tossed in ghee and a nutty, spiced podi.','veg','idli','Milk, Sesame','8 mini idlis','Rice, urad dal, ghee, sesame'],
 ['idli-sambar','Idli Sambar','south-indian',80,'Pillowy steamed idlis, vegetable sambar and fresh coconut chutney.','vegan','idli','Mustard','3 idlis + sides','Rice, urad dal, lentils, vegetables, coconut'],
 ['medu-vada','Crispy Medu Vada','south-indian',90,'Golden lentil vadas with soft centres, curry leaves and sambar.','vegan','vada','','2 vadas + sides','Urad dal, curry leaves, pepper, onion'],
 ['pongal','Ghee Ven Pongal','south-indian',110,'Comforting rice and moong dal, black pepper and toasted cashews.','veg','rice','Milk, Cashews','1 bowl','Rice, moong dal, ghee, pepper, cashews'],
 ['uttapam','Onion Uttapam','south-indian',120,'A thick, soft dosa topped with onion, tomato and green chilli.','vegan','pizza','','1 uttapam + sides','Rice, lentils, onion, tomato'],
 ['appam-stew','Appam & Vegetable Stew','south-indian',170,'Lacy appams with a gentle coconut-milk vegetable stew.','vegan','idli','','2 appams + stew','Rice, coconut milk, carrot, potato'],
 ['puttu-kadala','Puttu & Kadala Curry','south-indian',160,'Steamed rice-and-coconut puttu with spiced black chickpea curry.','vegan','meals','','1 serving','Rice flour, coconut, black chickpeas, spices'],
 ['bisi-bele-bath','Bisi Bele Bath','south-indian',130,'Karnataka’s comforting rice-and-lentil favourite with vegetables.','veg','rice','Milk, Peanuts','1 bowl','Rice, lentils, vegetables, ghee, peanuts'],
 ['south-indian-meals','The South Indian Thali','south-indian',240,'Rice, sambar, rasam, poriyal, kootu, curd, papad and a sweet finish.','veg','meals','Milk, Mustard','1 generous thali','Rice, lentils, seasonal vegetables, yoghurt'],
 ['chicken-chettinad-dosa','Chettinad Chicken Dosa','south-indian',220,'A crisp dosa with peppery Chettinad chicken masala and curry leaves.','non-veg','dosa','','1 dosa + sides','Rice, lentils, chicken, pepper, curry leaves'],
 ['paneer-butter-masala','Paneer Butter Masala','north-indian',230,'Soft paneer in a silky tomato, butter and cream gravy.','veg','curry','Milk, Cashews','1 bowl','Paneer, tomato, butter, cream, cashews'],
 ['dal-tadka','Homestyle Dal Tadka','north-indian',160,'Yellow lentils with a fragrant garlic-and-cumin tempering.','vegan','curry','','1 bowl','Lentils, garlic, cumin, tomato'],
 ['chole-bhature','Chole Bhature','north-indian',190,'Fluffy bhature with tangy chickpea curry, onions and pickle.','veg','meals','Gluten, Milk','2 bhature + chole','Wheat, chickpeas, yoghurt, spices'],
 ['butter-chicken','Old Delhi Butter Chicken','north-indian',290,'Tender chicken in a rich tomato-and-butter gravy.','non-veg','curry','Milk, Cashews','1 bowl','Chicken, tomato, butter, cream, cashews'],
 ['garlic-naan','Garlic Butter Naan','north-indian',60,'Soft bread brushed with garlic butter and fresh coriander.','veg','naan','Gluten, Milk','1 naan','Wheat, yoghurt, butter, garlic'],
 ['hyderabadi-biryani','Hyderabadi Chicken Biryani','biryani',280,'Fragrant basmati, chicken and whole spices, slow cooked. Raita included.','non-veg','biryani','Milk','Serves 1','Rice, chicken, yoghurt, mint, whole spices'],
 ['donne-biryani','Bangalore Donne Biryani','biryani',260,'Seeraga samba rice, herby green masala and juicy chicken.','non-veg','biryani','Milk','Serves 1','Seeraga samba rice, chicken, coriander, mint, yoghurt'],
 ['veg-biryani','Vegetable Dum Biryani','biryani',220,'Basmati, colourful vegetables, mint and spices, sealed and slow cooked.','veg','biryani','Milk','Serves 1','Rice, vegetables, yoghurt, mint, spices'],
 ['mutton-biryani','Mutton Dum Biryani','biryani',360,'Slow-cooked mutton and basmati with layers of warming spices.','non-veg','biryani','Milk','Serves 1','Rice, mutton, yoghurt, mint, spices'],
 ['hakka-noodles','Veg Hakka Noodles','chinese',180,'Wok-tossed noodles, crunchy vegetables and smoky goodness.','vegan','noodles','Gluten, Soy','1 bowl','Wheat noodles, vegetables, soy sauce, garlic'],
 ['chicken-fried-rice','Chicken Fried Rice','chinese',220,'Wok-tossed rice with chicken, egg, spring onion and vegetables.','non-veg','rice','Egg, Soy','1 bowl','Rice, chicken, egg, vegetables, soy sauce'],
 ['gobi-manchurian','Gobi Manchurian','chinese',190,'Crispy cauliflower in a tangy, garlicky Indo-Chinese sauce.','vegan','curry','Gluten, Soy','1 serving','Cauliflower, flour, soy sauce, garlic'],
 ['chilli-chicken','Chilli Chicken','chinese',260,'Crisp chicken, peppers and onions in a fiery chilli-garlic sauce.','non-veg','curry','Gluten, Soy, Egg','1 serving','Chicken, pepper, onion, soy sauce, chilli'],
 ['margherita','Margherita Pizza','global',250,'Tomato, fresh mozzarella and basil on a golden pizza base.','veg','pizza','Gluten, Milk','8-inch pizza','Wheat, tomato, mozzarella, basil'],
 ['paneer-pizza','Tandoori Paneer Pizza','global',310,'Smoky paneer, peppers, onions and melting mozzarella.','veg','pizza','Gluten, Milk','8-inch pizza','Wheat, paneer, peppers, mozzarella'],
 ['chicken-burger','Crispy Chicken Burger','global',220,'Crisp chicken, crunchy slaw and mayo in a soft toasted bun.','non-veg','burger','Gluten, Egg, Milk','1 burger','Chicken, bun, cabbage, mayonnaise'],
 ['alfredo-pasta','Creamy Alfredo Pasta','global',260,'Penne in a silky sauce with mushrooms and vegetarian hard cheese.','veg','noodles','Gluten, Milk','1 bowl','Penne, cream, mushrooms, garlic, cheese'],
 ['samosa','Punjabi Samosa','snacks',60,'Crisp pastry pockets with spiced potato, peas and chutneys.','vegan','samosa','Gluten','2 pieces','Wheat, potato, peas, spices'],
 ['pav-bhaji','Mumbai Pav Bhaji','snacks',150,'Butter-toasted pav, hearty spiced vegetable mash, onions and lime.','veg','curry','Gluten, Milk','2 pav + bhaji','Pav, potato, peas, tomato, butter'],
 ['fries','Golden French Fries','snacks',110,'Golden, crisp fries with seasoning and tomato dip.','vegan','fries','','1 portion','Potato, oil, salt'],
 ['gulab-jamun','Warm Gulab Jamun','desserts',90,'Soft golden dumplings in cardamom-and-rose syrup.','veg','sweet','Milk, Gluten','2 pieces','Milk solids, flour, sugar, cardamom'],
 ['payasam','Coconut & Jaggery Payasam','desserts',100,'Coconut-milk payasam with jaggery, cardamom and toasted cashews.','vegan','sweet','Cashews','1 bowl','Rice, coconut milk, jaggery, cashews'],
 ['brownie','Brownie & Ice Cream','desserts',160,'Warm eggless chocolate brownie with vanilla ice cream.','veg','brownie','Gluten, Milk, Soy','1 serving','Flour, cocoa, milk, vanilla ice cream'],
 ['filter-coffee','South Indian Filter Coffee','beverages',70,'Bold decoction, hot milk and a familiar frothy finish.','veg','filter-coffee','Milk','150 ml','Coffee, milk, sugar'],
 ['lime-soda','Fresh Lime Soda','beverages',80,'Fresh lime, chilled soda and a little fizz.','vegan','cooler','','300 ml','Lime, soda, sugar or salt'],
 ['mango-lassi','Creamy Mango Lassi','beverages',110,'Mango, thick yoghurt and a hint of cardamom.','veg','cooler','Milk','300 ml','Mango, yoghurt, cardamom']
];
const option=(id,label,price)=>({id,label,price});
export const foodMenu=rows.map(([id,name,category,price,description,diet,art,allergens,portion,ingredients])=>({
 id,name,category,price:price*100,description,image:'/assets/images/food/'+art+'.svg',
 badge:id==='masala-dosa'?'BitesBro signature':id==='south-indian-meals'?'A whole lot of happy':id==='donne-biryani'?'Bangalore favourite':null,
 dietary:[diet==='non-veg'?'Non-vegetarian':diet==='vegan'?'Plant based':'Vegetarian'],
 details:{diet,cuisine:categories.find(c=>c.id===category).name,portion,ingredients:ingredients.split(', '),
 allergens:allergens?allergens.split(', '):[],prepMinutes:['beverages','desserts'].includes(category)?10:25,
 spice:['beverages','desserts'].includes(category)?'none':/mysore|chilli|chettinad|donne/.test(id)?'hot':'medium',
 variants:category==='biryani'?[option('regular','Serves 1',0),option('large','Serves 2',15000)]:/pizza|margherita/.test(id)?[option('regular','8-inch pizza',0),option('large','12-inch pizza',14000)]:id==='masala-dosa'?[option('regular','Classic dosa',0),option('ghee-roast','Ghee-roasted',2500)]:[option('regular',portion,0)],
 addons:category==='south-indian'?[option('extra-sambar','Extra sambar',1500),option('extra-chutney','Extra chutney',1000)]:category==='biryani'?[option('raita','Extra raita',2000)]:/pizza|margherita|burger/.test(id)?[option('cheese','Extra cheese',3000)]:[]}
}));
export function readMenu(db,category='all') {
 const order=categories.map((c,i)=>"WHEN '"+c.id+"' THEN "+i).join(' ');
 return db.prepare("SELECT * FROM menu_items WHERE available=1 AND (?='all' OR category=?) ORDER BY CASE category "+order+" ELSE 99 END,rowid").all(category,category).map(({details,dietary,available,...item})=>({...item,dietary:JSON.parse(dietary),...JSON.parse(details)}));
}
