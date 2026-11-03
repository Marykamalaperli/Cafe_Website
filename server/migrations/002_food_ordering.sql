CREATE TABLE menu_items_next (
 id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,
 description TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),image TEXT NOT NULL,
 badge TEXT,dietary TEXT NOT NULL DEFAULT '[]',available INTEGER NOT NULL DEFAULT 1 CHECK(available IN(0,1)),
 details TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO menu_items_next(id,name,category,description,price,image,badge,dietary,available)
 SELECT id,name,CASE category WHEN 'coffee' THEN 'beverages' WHEN 'matcha' THEN 'beverages' WHEN 'bakes' THEN 'snacks' WHEN 'bites' THEN 'global' ELSE category END,description,price,image,badge,dietary,available FROM menu_items;
DROP TABLE menu_items;
ALTER TABLE menu_items_next RENAME TO menu_items;
ALTER TABLE orders ADD COLUMN fulfilment TEXT NOT NULL DEFAULT 'pickup' CHECK(fulfilment IN('pickup','delivery'));
ALTER TABLE orders ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN postcode TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN delivery_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN subtotal INTEGER NOT NULL DEFAULT 0;
UPDATE orders SET subtotal=total;
ALTER TABLE order_items ADD COLUMN options TEXT NOT NULL DEFAULT '{}';
INSERT INTO schema_migrations(version) VALUES(2);
