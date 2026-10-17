# Dedicated Gmail sender

All outgoing EasyShop mail now passes through `src/mail/store-mailer.js`: account/guest verification,
Google verification, password reset/change, sign-in notifications, contact mail and admin replies.
The sender is always HongKong Supermarket using the authenticated store Gmail address.
Admin login credentials and CONTACT_EMAIL (the support recipient) are independent.

1. Create a separate Gmail account for your store. Choose an available name, for example
   `hongkongsupermarket.noreply@gmail.com`; this example is not an account created by EasyShop.
2. Enable two-step verification for that Google account and create an app password if available.
3. Enter both values locally in `.env`:

```dotenv
STORE_EMAIL=your-actual-store-account@gmail.com
STORE_EMAIL_APP_PASSWORD=your-app-password
```

Do not paste the password into chat or commit `.env`. Existing GMAIL_USER/GMAIL_APP_PASSWORD
are used until STORE_EMAIL is set. Once set, the matching STORE_EMAIL_APP_PASSWORD is required;
the old account password is never reused. MESSAGE_FROM no longer overrides the sender.
Personal administrator account email addresses are blocked as store sending addresses.

4. Restart the running server, then run `npm run email:verify` to check authentication
   without sending mail. Real recipients see the actual dedicated Gmail address, not an
   invented `no-reply@doordash.com` address. New replies remain in the EasyShop message center.

Automated tests mock SMTP and never send email.
