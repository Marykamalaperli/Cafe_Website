// Only resize known bundled photographs. Cloud/custom uploads retain their source.
const bundled=new Set(["avocado-toast", "biryani", "brownie", "butter-chicken", "cheese-dosa", "chicken-burger", "chicken-fried-rice", "chilli-chicken", "chocolate-cookie", "chole-bhature", "cold-coffee", "croissant", "dal-tadka", "dosa", "filter-coffee", "flat-white", "fries", "garlic-naan", "gobi-manchurian", "gulab-jamun", "idli", "latte", "mango-lassi", "masala-dosa", "matcha", "mutton-biryani", "mysore-dosa", "nimbu-pani", "noodles", "paneer-curry", "pasta", "pav-bhaji", "payasam", "pizza", "puttu", "samosa", "sandwich", "south-indian-meals", "vada", "veg-biryani"]);
export function responsiveImage(path,markup,asset){
 const name=/^\/assets\/images\/photos\/([a-z0-9-]+)\.jpg$/.exec(path)?.[1];
 if(!bundled.has(name))return markup;
 return `<picture><source type="image/webp" srcset="${asset('/assets/images/optimized/'+name+'-320.webp')} 320w, ${asset('/assets/images/optimized/'+name+'-640.webp')} 640w" sizes="(max-width: 640px) 50vw, 320px">${markup}</picture>`;
}
