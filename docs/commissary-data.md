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

## Findings from Oct 28, 2026 (phase 2a, from normal browsing only)

- **Stores:** Ramstein AB is store_id **5873**; Vogelweh (Pulaski Barracks) is store_id **5921**.
- **Terms:** the site requires accepting its Terms and Conditions. They forbid using "any automatic
  device to monitor or copy" the site. See the decision at the end: no automated
  access; we upload the flyer PDF ourselves.
- **Price comparison (13 everyday items):** most packaged prices and the Europe flyer match between
  the two stores. Store-packed meat (ground sirloin $7.46 vs $8.79/lb) and some store markdowns
  differ, and stock differs. The app tracks both and shows one "Commissary" label.
- **How the shop page loads data** (requests the page itself made, seen in the browser's resource
  list; response bodies were not inspected):
  - Script: `asset.prd.freshop.retail.ncrgov.com/freshop.js?app_key=deca&...` loads the shop.
  - Session: `api.prd.freshop.retail.ncrgov.com/2/sessions/<token>?app_key=deca`; every later
    request carries `app_key=deca` and `token=<session token>`.
  - Product search: `/1/products?app_key=deca&q=<text>&store_id=5873&limit=24&sort=relevance&fields=...`
    where `fields` includes `id, identifier, upc, name, size, price, sale_price, sale_start_date,
    sale_finish_date, unit_price, quantity_size_ratio_description, status`.
  - Search suggestions: `/1/product_search_suggestions?app_key=deca&q=<text>&store_id=5873`.
  - Also seen: `/1/stores`, `/1/tags`, `/2/shopping_lists`, `/1/products/ads`, `/1/store_slots`.
- **Not yet known:** the response format, whether products can be fetched by a list of ids
  (needed for a light weekly refresh), and how the flyer (`/1/circulars`) is requested.
- **Blocked:** calling these endpoints directly (outside the page's own browsing) was refused by
  Claude Code's safety check as circumventing the site's access controls.

## Decision (Oct 28, 2026): no automated access

We don't call the Freshop API or scrape the site, not even for sale items only: the flyer comes
from the same service and the terms forbid any automatic monitoring or copying. Instead:

- Each new flyer, we open the weekly ad on shop.commissaries.com (Ramstein selected), download the
  PDF ourselves, and upload it in the app.
- An edge function sends the PDF to Claude, which returns each item (name, size, sale price,
  regular price, valid dates). We review and confirm before anything is saved, as source "flyer".
- The Europe flyer is shared, so confirmed flyer prices apply to both Ramstein and Vogelweh unless
  we mark an item as one store only.
- Shelf (non-sale) prices come from manual entry now and receipt scanning later.
