# Wristband Craft - Migration Testing Report
**Status:** Ready for testing

## Completed migration

- Frontend data/auth flows now use NestJS APIs.
- Admin and supplier dashboard flows are connected to backend roles.
- Design upload now uses backend endpoint: `POST /designs/upload`.
- Order, design, supplier, and auth modules run from NestJS only.
- Supabase runtime code and functions were removed from the app.

## Environment required

Set these variables for local testing:

```
VITE_API_URL=http://localhost:3000
VITE_STRIPE_PUBLISHABLE_KEY=<your-key>
STRIPE_SECRET_KEY=<your-key>
RESEND_API_KEY=<your-key>
```

## Manual test checklist

1. Sign up / login as user.
2. Create a design and save template.
3. Add design to cart and continue checkout.
4. Fill address and place order.
5. Login as supplier/admin and verify dashboard visibility.
6. Update order status from admin dashboard.
7. Confirm order appears in user order history.
