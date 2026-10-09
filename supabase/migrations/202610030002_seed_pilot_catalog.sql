-- Seed the pilot catalog in its own migration so projects that already applied
-- the initial schema migration still receive the stores and item taxonomy.
insert into public.pilot_areas (name, slug, description)
values (
  'Roosevelt Island + Midtown East',
  'roosevelt-island-midtown-east',
  'Open pilot catchment for shoppers willing to meet at participating stores near the Roosevelt Island tramway.'
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  active = true;

insert into public.stores (pilot_area_id, chain, name, location_label, address)
select area.id, seed.chain, seed.name, seed.location_label, seed.address
from public.pilot_areas area
cross join (values
  ('Trader Joe''s', 'Trader Joe’s — Upper East Side Bridgemarket', '405 E 59th St', '405 E 59th St, New York, NY 10022'),
  ('Whole Foods Market', 'Whole Foods Market — East 57th Street', 'East 57th St', '226 E 57th St, New York, NY 10022'),
  ('Costco', 'Costco — Long Island City', 'Long Island City', null)
) as seed(chain, name, location_label, address)
where area.slug = 'roosevelt-island-midtown-east'
on conflict (pilot_area_id, chain, location_label) do nothing;

with seed(category_name, sort_order, item_names) as (values
  ('Produce', 1, array['Apples','Avocados','Bananas','Berries','Citrus','Grapes','Melons','Peaches & stone fruit','Pears','Tomatoes','Leafy greens','Lettuce','Cabbage','Broccoli','Cauliflower','Carrots','Potatoes','Sweet potatoes','Onions','Garlic','Peppers','Cucumbers','Zucchini & squash','Mushrooms','Fresh herbs','Other fresh produce']),
  ('Meat & poultry', 2, array['Chicken thighs','Chicken breast','Whole chicken','Ground chicken or turkey','Turkey','Ground beef','Beef steak','Beef roast','Pork chops','Ground pork','Pork shoulder','Bacon','Sausage','Lamb','Deli meat','Other meat']),
  ('Seafood', 3, array['Salmon','Tuna','Shrimp','White fish','Shellfish','Smoked fish','Other seafood']),
  ('Dairy & eggs', 4, array['Milk','Cream','Butter','Eggs','Yogurt','Cottage cheese','Cream cheese','Cheddar','Mozzarella','Parmesan','Other cheese','Plant-based milk','Plant-based yogurt','Other dairy']),
  ('Bakery', 5, array['Sandwich bread','Sourdough bread','Bagels','English muffins','Tortillas','Pita & flatbread','Buns & rolls','Pastries','Cookies','Cakes','Other bakery']),
  ('Pantry', 6, array['Rice','Pasta','Beans','Lentils','Flour','Sugar','Oats','Cereal','Cooking oil','Vinegar','Canned tomatoes','Canned vegetables','Canned fruit','Canned fish','Broth & stock','Nut butter','Nuts & seeds','Dried fruit','Spices','Sauces & condiments','Pasta sauce','Baking ingredients','Other pantry item']),
  ('Frozen', 7, array['Frozen vegetables','Frozen fruit','Frozen meat','Frozen seafood','Frozen meals','Frozen pizza','Ice cream','Other frozen item']),
  ('Prepared foods', 8, array['Prepared entrée','Prepared side dish','Prepared salad','Sandwich or wrap','Sushi','Rotisserie chicken','Soup','Hot bar meal','Ready-to-eat snack','Hummus','Prepared dip','Prepared meal kit','Other prepared food']),
  ('Snacks & sweets', 9, array['Chips & crackers','Popcorn','Chocolate','Candy','Granola bars','Snack bars','Dips & spreads','Other snack']),
  ('Beverages', 10, array['Coffee','Tea','Juice','Sparkling water','Still water','Soda','Sports drinks','Other beverage']),
  ('Alcohol', 11, array['Beer','Wine','Spirits','Hard seltzer','Non-alcoholic beer or wine','Other alcoholic beverage']),
  ('Household', 12, array['Dish soap','Laundry detergent','Paper towels','Toilet paper','Trash bags','Food storage bags','Cleaning supplies','Other household item']),
  ('Kitchen & home', 13, array['Food storage container','Cookware','Kitchen utensil','Food wrap & foil','Napkins & tissues','Disposable tableware','Other kitchen or home item']),
  ('Personal care', 14, array['Shampoo & conditioner','Body wash & soap','Toothpaste','Deodorant','Skin care','Other personal care']),
  ('Health & wellness', 15, array['Vitamins & supplements','Pain relief medicine','Allergy medicine','Cold & flu medicine','First aid supplies','Other health item']),
  ('Baby & child', 16, array['Baby formula','Baby food','Diapers','Baby wipes','Baby care','Other baby or child item']),
  ('Pet', 17, array['Dry pet food','Wet pet food','Pet treats','Pet litter','Pet care','Other pet item']),
  ('Flowers & seasonal', 18, array['Flowers','Potted plant','Holiday item','Seasonal decoration','Gift item','Other seasonal item']),
  ('Other grocery', 19, array['Greeting card','Magazine or newspaper','Batteries','Other grocery item'])
)
insert into public.item_categories (name, sort_order, active)
select category_name, sort_order, true
from seed
on conflict (name) do update set
  sort_order = excluded.sort_order,
  active = true;

with seed(category_name, item_names) as (values
  ('Produce', array['Apples','Avocados','Bananas','Berries','Citrus','Grapes','Melons','Peaches & stone fruit','Pears','Tomatoes','Leafy greens','Lettuce','Cabbage','Broccoli','Cauliflower','Carrots','Potatoes','Sweet potatoes','Onions','Garlic','Peppers','Cucumbers','Zucchini & squash','Mushrooms','Fresh herbs','Other fresh produce']),
  ('Meat & poultry', array['Chicken thighs','Chicken breast','Whole chicken','Ground chicken or turkey','Turkey','Ground beef','Beef steak','Beef roast','Pork chops','Ground pork','Pork shoulder','Bacon','Sausage','Lamb','Deli meat','Other meat']),
  ('Seafood', array['Salmon','Tuna','Shrimp','White fish','Shellfish','Smoked fish','Other seafood']),
  ('Dairy & eggs', array['Milk','Cream','Butter','Eggs','Yogurt','Cottage cheese','Cream cheese','Cheddar','Mozzarella','Parmesan','Other cheese','Plant-based milk','Plant-based yogurt','Other dairy']),
  ('Bakery', array['Sandwich bread','Sourdough bread','Bagels','English muffins','Tortillas','Pita & flatbread','Buns & rolls','Pastries','Cookies','Cakes','Other bakery']),
  ('Pantry', array['Rice','Pasta','Beans','Lentils','Flour','Sugar','Oats','Cereal','Cooking oil','Vinegar','Canned tomatoes','Canned vegetables','Canned fruit','Canned fish','Broth & stock','Nut butter','Nuts & seeds','Dried fruit','Spices','Sauces & condiments','Pasta sauce','Baking ingredients','Other pantry item']),
  ('Frozen', array['Frozen vegetables','Frozen fruit','Frozen meat','Frozen seafood','Frozen meals','Frozen pizza','Ice cream','Other frozen item']),
  ('Prepared foods', array['Prepared entrée','Prepared side dish','Prepared salad','Sandwich or wrap','Sushi','Rotisserie chicken','Soup','Hot bar meal','Ready-to-eat snack','Hummus','Prepared dip','Prepared meal kit','Other prepared food']),
  ('Snacks & sweets', array['Chips & crackers','Popcorn','Chocolate','Candy','Granola bars','Snack bars','Dips & spreads','Other snack']),
  ('Beverages', array['Coffee','Tea','Juice','Sparkling water','Still water','Soda','Sports drinks','Other beverage']),
  ('Alcohol', array['Beer','Wine','Spirits','Hard seltzer','Non-alcoholic beer or wine','Other alcoholic beverage']),
  ('Household', array['Dish soap','Laundry detergent','Paper towels','Toilet paper','Trash bags','Food storage bags','Cleaning supplies','Other household item']),
  ('Kitchen & home', array['Food storage container','Cookware','Kitchen utensil','Food wrap & foil','Napkins & tissues','Disposable tableware','Other kitchen or home item']),
  ('Personal care', array['Shampoo & conditioner','Body wash & soap','Toothpaste','Deodorant','Skin care','Other personal care']),
  ('Health & wellness', array['Vitamins & supplements','Pain relief medicine','Allergy medicine','Cold & flu medicine','First aid supplies','Other health item']),
  ('Baby & child', array['Baby formula','Baby food','Diapers','Baby wipes','Baby care','Other baby or child item']),
  ('Pet', array['Dry pet food','Wet pet food','Pet treats','Pet litter','Pet care','Other pet item']),
  ('Flowers & seasonal', array['Flowers','Potted plant','Holiday item','Seasonal decoration','Gift item','Other seasonal item']),
  ('Other grocery', array['Greeting card','Magazine or newspaper','Batteries','Other grocery item'])
)
insert into public.item_types (category_id, name, normalized_name, active)
select category.id, item.name, regexp_replace(lower(item.name), '[^a-z0-9]+', '-', 'g'), true
from seed
join public.item_categories category on category.name = seed.category_name
cross join lateral unnest(seed.item_names) as item(name)
on conflict (normalized_name) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  active = true;
