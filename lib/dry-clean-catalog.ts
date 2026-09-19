export type DryCleanCatalogItem = {
  name: string;
  price: number;
};

/** Flat catalog from the public dry-cleaning page (deduped). */
export const DRY_CLEAN_CATALOG: DryCleanCatalogItem[] = [
  // Tops
  { name: "Blouse", price: 6.55 },
  { name: "Blouse (linen)", price: 7.55 },
  { name: "Coat", price: 12.25 },
  { name: "Jacket (down)", price: 15.0 },
  { name: "Jacket (leather)", price: 75.0 },
  { name: "Jacket (sport/outer)", price: 10.0 },
  { name: "Jacket (womens)", price: 7.5 },
  { name: "Jersey", price: 8.5 },
  { name: "Laundry Shirt", price: 3.95 },
  { name: "Long Heavy Coat", price: 20.0 },
  { name: "Outer Vest", price: 10.0 },
  { name: "Polo/T-shirt", price: 6.55 },
  { name: "Shirt", price: 6.55 },
  { name: "Shirt (linen)", price: 7.55 },
  { name: "Sweater", price: 6.75 },
  { name: "Sweater (fur)", price: 10.0 },
  { name: "Sweatshirt", price: 8.0 },
  { name: "Tommy Bahama Shirt", price: 7.55 },
  { name: "Vest", price: 5.0 },
  { name: "Windbreaker", price: 10.0 },
  // Bottoms
  { name: "Pants", price: 6.55 },
  { name: "Pants (beaded)", price: 14.0 },
  { name: "Pants (leather)", price: 15.0 },
  { name: "Pants (linen)", price: 7.55 },
  { name: "Shorts", price: 6.25 },
  { name: "Shorts (linen)", price: 7.25 },
  { name: "Skirt (short)", price: 9.5 },
  { name: "Skirt (long)", price: 10.0 },
  // Full Body
  { name: "2-piece suit", price: 14.55 },
  { name: "3-piece suit", price: 18.55 },
  { name: "Dress (short)", price: 12.0 },
  { name: "Dress (long)", price: 17.0 },
  { name: "Gown", price: 25.0 },
  { name: "Jumpsuit", price: 16.0 },
  { name: "Romper", price: 12.0 },
  // Accessories
  { name: "Belt", price: 1.5 },
  { name: "Hanky", price: 1.5 },
  { name: "Banquet Tablecloth", price: 25.0 },
  { name: "Large Tablecloth", price: 16.0 },
  { name: "Napkins (each)", price: 3.0 },
  { name: "Placemats (each)", price: 5.0 },
  { name: "Pillowcases (each)", price: 5.0 },
  { name: "Tablecloth", price: 12.0 },
  { name: "Tie", price: 4.5 },
  { name: "Veil", price: 15.0 },
  // Household / Bedding
  { name: "Blanket", price: 25.0 },
  { name: "Comforter", price: 40.0 },
  { name: "Comforter (NS)", price: 60.0 },
  { name: "Curtain Panels", price: 50.0 },
  { name: "Duvet Comforter", price: 25.0 },
  { name: "Down Comforter", price: 45.0 },
  { name: "Pillowcase (each)", price: 5.0 },
  { name: "Top/Bottom Sheet", price: 15.0 },
];
