# Commissary price data (findings from Oct 27, 2026)

The commissary website (shop.commissaries.com, "CLICK2GO") runs on the Freshop grocery platform,
operated by NCR on a government cloud. With a store selected and no sign-in, the weekly flyer's list
view shows structured items: product name and size, sale price with its date range, regular price,
unit, and a product photo.

## What we observed

- Selecting a store: store locator at `/my-store/store-locator`, search "Ramstein", then
  "View Weekly Ad". Ramstein AB is Freshop **store_id 5873** (seen as
  `/wp-json/freshop/v1/content/site-banner?store_id=5873`).
- Vogelweh: not looked up yet. Find its store_id the same way.
- The flyer was the Europe region sales flyer, prices good Oct 19 to Nov 1, 2026. Weekly specials
  run Monday to Sunday.
- The page loads its data from these endpoints (paths only; query parameters were not recorded):

| Endpoint | Likely contents |
| --- | --- |
| `https://api.prd.freshop.retail.ncrgov.com/2/sessions/<id>` | Anonymous session |
| `https://api.prd.freshop.retail.ncrgov.com/1/stores` | Store list and IDs |
| `https://api.prd.freshop.retail.ncrgov.com/1/products` | Product catalog with prices |
| `https://api.prd.freshop.retail.ncrgov.com/1/circulars` | Weekly flyer |
| `https://api.prd.freshop.retail.ncrgov.com/1/circular_pages` | Flyer pages |
| `https://api.prd.freshop.retail.ncrgov.com/2/circular_spots` | Items placed on flyer pages |
| `https://api.prd.freshop.retail.ncrgov.com/1/recipes` | DeCA recipes |
| `https://api.prd.freshop.retail.ncrgov.com/1/offers` | Digital coupons |

## Example flyer items (Ramstein, list view)

| Item | Sale price | Valid | Regular price, unit |
| --- | --- | --- | --- |
| Jimmy Dean Premium Pork Regular Sausage Roll 16 oz | $2.83 | 10/02/26 to 12/02/26 | $4.80, 1 lb |
| Doritos Nacho Cheese Tortilla Chips 11 oz | $3.00 | 10/16/26 to 11/04/26 | $3.58, 11 oz |
| Jif Creamy Peanut Butter 16 oz | $2.17 | 10/16/26 to 11/04/26 | $2.66, 16 oz |
| Red Bull Energy Drink 8.4 fl oz, 12 pack | $19.89 | 10/05/26 to 11/15/26 | $21.79, 12 pack |

## Rules for using it

- This is not a public API. DeCA or NCR can change it without notice.
- Read the site's Terms and Conditions (shop.commissaries.com/terms-and-conditions) before building
  the sync, and tell me if they rule it out.
- One store, once a week, polite request rate. Never try to get around reCAPTCHA or bot checks.
- Inspect the real requests and responses yourself (browser devtools, Network tab, Fetch/XHR) before
  writing the sync. The parameters above were not captured.
- If the endpoints stop working, fall back to last known prices, receipts and manual entry.
