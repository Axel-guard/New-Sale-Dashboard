# Production Deployment Guide

## Current Deployment

**Production URL**: https://webapp-6dk.pages.dev
**Latest Deployment**: https://1fea59a2.webapp-6dk.pages.dev
**Old Version**: https://55fee99a.webapp-6dk.pages.dev

## Database Setup

### Tables Created in Production:
- `product_categories` - Product categories
- `products` - Products with weight information
- `quotations` - Quotation records
- `quotation_items` - Quotation line items
- `courier_rates` - Courier pricing database

### Sample Data Seeded:
- **Categories**: GPS Devices, Cameras, Accessories
- **Products**: 5 sample products with weights
- **Courier Rates**: DTDC, Blue Dart, Delhivery (Surface & Express)

## Features Added

### Quotation System:
1. Create quotations with multiple items
2. Customer details with GST information
3. Automatic weight calculation from products
4. Dynamic courier partner loading from database
5. Automatic courier charge calculation
6. Theme selector (5 color themes)
7. Multi-currency support (INR, USD, EUR, GBP)
8. PDF generation and WhatsApp sharing
9. Authorized signature in quotation

### Courier Integration:
- Courier partners loaded from database
- Delivery methods based on selected partner
- Auto-calculate package weight: Σ(quantity × product_weight)
- Auto-calculate charges: base_rate + (per_kg_rate × weight)

## Deployment Commands

```bash
# Build the application
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name webapp

# Apply database migrations (if needed)
npx wrangler d1 migrations apply webapp-production --remote

# Add weight column to products (already done)
npx wrangler d1 execute webapp-production --remote --command="ALTER TABLE products ADD COLUMN weight REAL DEFAULT 0"
```

## Testing

```bash
# Test products API
curl https://webapp-6dk.pages.dev/api/products

# Test courier rates
curl https://webapp-6dk.pages.dev/api/courier-rates

# Test categories
curl https://webapp-6dk.pages.dev/api/categories
```

## Login Credentials

- **Admin**: admin / admin123
- **Employee**: akash / akash123

## Next Steps

1. Add more products with proper weights
2. Update courier rates as needed
3. Customize quotation terms and conditions
4. Add company logo to static assets
