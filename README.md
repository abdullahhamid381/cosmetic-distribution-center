# HH MEDICS — Cosmetic Distribution Center

**Runnable, full-stack Next.js + Neon PostgreSQL distribution application.**

An operations-first platform for managing cosmetic products, manufacturer/landed/trade/retail prices, multiple warehouse batches, shop-specific discount percentages, dispatches, invoices, credit, payments, customer ledgers, saleable returns, expenses, and staff access.

## Security / important first action

**Rotate the Neon database password shown in your chat before production use.** Treat the old connection string as exposed. Create a new connection string in the Neon console; keep it only in `.env.local` on your computer or in your hosting provider's encrypted environment-variable settings. Never commit the file or use a `NEXT_PUBLIC_` prefix for secrets.

This source archive deliberately **does not include any database URL, password or secret**. No demonstration shop, invoice or manufacturer data is preloaded. Once you connect your own Neon database, pages read and write that live database.

## What is implemented now

- **Protected login** with BCrypt password hashes, secure HTTP-only signed session cookies and permission checks in write actions.
- **Dashboard**: actual database totals for invoicing, collection, open balance, available warehouse stock, low stock alerts, monthly chart, active shops/products.
- **Products**: manufacturer, landed, trade and retail prices, SKU, brand, size, manufacturer and alerts; manager/admin can update prices.
- **Shops & pricing**: contacts, city, area, credit limit, payment terms, default % off retail, different % for individual products, percentage edit history.
- **Warehouse inventory**: warehouse list, manufacturer receipts, production batches, manufacturing/expiry dates, inventory ledger, manager-approved adjustments, inter-warehouse transfers and expiry visibility.
- **Shop distribution**: create multi-line dispatch/invoice from available batches, preview shop price and discount %, prevent dispatch from an incorrect warehouse or expired/insufficient batch, enforce shop credit limits, record historical invoice prices.
- **Invoices**: detailed invoice lines, applied percentage, paid/outstanding/credited amounts, printable invoice page (`Print / Save as PDF` using browser print).
- **Payments**: cash/bank/Easypaisa/JazzCash/cheque receipt, FIFO allocation across open invoices, per-invoice payments, allocation ledger, customer balances.
- **Delivery tracking**: dispatch records, quantities, warehouse, shop, recipient and delivered confirmation.
- **Returns (limited)**: saleable stock return and credit note for unpaid invoice value; historical inventory and receivables are updated together.
- **Finance / reports**: recorded operating expenses, batch-cost-based gross margin and returns, overdue invoices, shop-level and product-level sales. Export inventory, invoices and shops as Excel-compatible CSV files.
- **Staff & audit**: employee creation, page/action role enforcement, business operations audit and shop percentage history.

## Requirements

- Node.js 22+, npm
- A fresh or safely backed-up Neon PostgreSQL database. **Do not run migrations against an existing database containing important tables unless you have reviewed the SQL.**

## Install (Windows PowerShell, macOS, Linux)

```sh
npm install
cp .env.example .env.local
```

For **Windows PowerShell**, copy the env file like this:

```powershell
Copy-Item .env.example .env.local
```

Then edit `.env.local` with a **new, rotated Neon pooled URL** from the Neon console, a cryptographically random `SESSION_SECRET` (32+ characters), a private owner email, and strong initial password (12+ characters). Do not share `.env.local`.

```
DATABASE_URL="<your newly rotated Neon pooled PostgreSQL URL>"
SESSION_SECRET="<a long random secret>"
BOOTSTRAP_ADMIN_EMAIL="owner@yourcompany.com"
BOOTSTRAP_ADMIN_PASSWORD="<a strong unique password>"
BOOTSTRAP_ADMIN_NAME="Business Owner"
BUSINESS_NAME="HH MEDICS"
BUSINESS_ADDRESS="Hashmi Clinic, Mandi Town, Bhakkar"
```

The connection string is read only in server modules. **Never** use it in browser components, public env variables, or client-accessible API responses.

### Set up your real database

```sh
npm run db:migrate
npm run db:admin
```

`db:migrate` creates the PostgreSQL tables and an initial warehouse. `db:admin` creates one initial admin if its email doesn't exist. Both commands require a network connection to Neon. After admin creation, remove `BOOTSTRAP_ADMIN_PASSWORD` from `.env.local` and change it when appropriate. Log in using the credentials you set.

For Neon, a direct (unpooled) URL is generally preferable for migrations. This simple initialization migration uses a single transaction and works with standard PostgreSQL connection strings; consult Neon guidance if your project's pooling mode restricts schema changes.

### Run

```sh
npm run dev
```

Start the app manually and visit **http://localhost:3000**. The server listens on the local loopback address. After setup, **http://localhost:3000/api/health** reports whether the application can query Neon (without returning credentials). To prepare a production build:

```sh
npm run typecheck
npm run build
npm start
```

## Starting workflow

1. Admin login > Products & Prices > create your cosmetic items (e.g., facewash, serum, night cream).
2. Warehouse Stock > receive manufacturer batches with their cost, quantity and expiry date.
3. Shop Directory > create a shop, payment terms and default retail discount percentage.
4. Open the shop profile > assign **different percentages to individual products**, where applicable.
5. New Distribution > select shop, warehouse, batches and quantities > confirm to atomically create dispatch, stock movements and invoice.
6. Deliveries > mark dispatch as received by the shop.
7. Invoice detail > print an invoice or save as PDF using your browser.
8. Payments > record receipts, which auto-allocate FIFO to open invoices. Review customer ledger and reports.

## Accounting behavior

- **Retailer discount** is calculated from *retail price* when a shop-level or product-level percentage exists.
- Priority: **shop+product custom percentage > shop default percentage > product trade price**.
- When fallback trade price is used, the corresponding discount percentage is shown for information only.
- All price and unit-cost information is **snapshotted to invoice lines**. Future pricing changes do not rewrite invoices.
- Dispatch and invoice generation commit together with stock ledger entries in one PostgreSQL transaction.
- Shop credit limits can be enforced; `0` means no set limit.
- Payment receipts are applied to oldest open invoices unless a specific invoice is selected.
- Open receivables = invoice total − allocated payments − approved return credits.
- Supplier purchase costs are included via batch unit cost; **do not record the same inventory purchase as a separate operating expense**, or profits will be understated.
- The reports' indicative contribution is **not a full tax-compliant accounting statement**. Taxes, freight allocation, sales commissions, payroll and recoveries need appropriate policy and configuration.

## Known limitations / next production phase

This is a working application starter, **not a completed enterprise ERP**. Advanced components still to build before high-volume commercial use include:

- Returns/refunds for invoices already paid and tracking unsaleable/quarantined returns.
- Proper purchase order approval and GRN matching, supplier payable ledger and full transfer approval workflow.
- Partial deliveries, mobile proof-of-delivery signatures, route optimization and barcode hardware integrations.
- Tax configuration (including sales tax), statutory documents, PDF engine for automatic server-generated files.
- Customer advances/unallocated cash, bank reconciliation, full general ledger, commission accrual and settlement.
- Search, pagination, CSV/Excel exports, offline mobile mode and notifications.
- Password resets, rate-limited authentication, user disable/edit, recovery, immutable balance/audit reviews and scheduled backups.
- Row-level sales-territory/assigned-shop restrictions, automated end-to-end tests, load tests, monitoring and formal accounting review.

**Before live business use**: run the type checker/build, test on a staging Neon branch with sample transactions, set up Neon backups/point-in-time recovery, do an independent security review, and have your accountant validate trade discount, inventory valuation and receivable processes.

## Hosting

The application uses only server-side PostgreSQL access via `pg` with a small connection pool. You can deploy to Vercel (with suitable Node runtime environment variables) or any Node-capable hosting provider. Configure a secret `DATABASE_URL` and `SESSION_SECRET` in hosting settings; never export them into client-side bundles. Use HTTPS, private backups and restrict access to trusted staff.

## Database schema

Review `database/schema.sql` for all tables, keys and constraints. `scripts/migrate.mjs` is a one-time initial schema setup script, not a versioned schema migration framework. For subsequent changes adopt versioned migrations with explicit schema versions (e.g. node-pg-migrate or Drizzle Kit) and test on staging.
# Customer sales department

## Shop dispatches with private broker splits

On **New Shop Delivery**, choose an optional broker and a broker percentage before dispatch. Set the shop discount separately for each product. With retail Rs. 1,000, shop 20% and broker 20%, the official shop invoice charges Rs. 800 and prints only the shop's 20%. The private company allocation is Rs. 600 after the combined 40%; the private broker retail allocation is Rs. 200. Each line snapshots the shop percentage, private broker percentage and company unit allocation. Combined percentages cannot exceed 100%.

Broker settlement on shop invoices uses **actual received amount × saved broker percentage − full unpaid shop balance**. For Rs. 500 received and Rs. 300 pending at 20%, earned commission is Rs. 100 and the pre-payout broker balance is **−Rs. 200**. With the full Rs. 800 received, commission is Rs. 160 and pending is zero. This collected-amount rule is distinct from the Rs. 200 retail allocation; the private portal labels both bases explicitly rather than treating planned allocation as cash or realized commission.

The private **Shop broker ledger** and invoice-detail accounting panel show received amounts, pending deductions, earned brokerage and internal allocations. Official shop invoice printing/PDF excludes the broker, broker percentage, combined percentage and company allocation. The private invoice panel is marked `no-print`. Sales portal users cannot access shop invoices or these broker ledgers.

Shop collections, payment reversals and approved return credits update brokerage dynamically through existing invoice balances. Pending shop exposure offsets other earnings in the same broker's account, and payouts are capped at the positive balance after pending deductions and previous payouts. The hold does **not** mark a shop invoice paid, create a second debt, record cash received or apply a second payout expense. Return quantities reduce the private retail/company allocations. Existing invoices without a broker retain their original pricing and collection behavior.

Apply the schema with `npm run db:migrate:sales-team`. The rollback-only integration script `node scripts/check-shop-broker.cjs` verifies shop invoice pricing, private 40% allocations, collections, payment reversals, returns, payout limits and printed-invoice privacy.

## Retail commission rule and per-order brokers

### Returned-package deductions from sales agent earnings

On **RETURNED** orders, the sales agent is charged the recorded **courier cost + additional shipping/packing cost + return cost**. The customer shipping charge is revenue, not another cost, and is not charged again. The original sales and broker commissions are reversed, then the sales agent's fulfilment costs reduce their remaining earned commission. Amounts exceeding earnings carry forward as **agent dues to the business** and offset future delivered commission; expected commission does not settle dues.

Agent portals and administration show gross earned commission, returned-package deductions, net earnings, payouts and amounts owed. Payout validation uses the balance after deductions. The per-order deduction is derived once from the current RETURNED record; saving the same return again does not add a second debit. Updating its costs updates its debit, and the save audit records the old/new return charge adjustment. Broker accounts are not charged the sales agent's return expenses. Cancelled orders retain business expenses without a sales-agent debit.

Department business net includes the receivable from the sales agent to offset the returned-package costs. This is not cash collected: actual customer collections, customer refunds and payout ledgers remain unchanged. For example, Rs. 280 courier + Rs. 20 packing + Rs. 100 return creates a Rs. 400 agent deduction. With Rs. 200 of other earned commission and no prior payout, the agent owes Rs. 200; subsequent delivered commission first clears that due.

New customer orders calculate commission on **retail product total × quantity**, excluding the shipping charge. The default sales agent rate is **20%**. Select a broker separately on each order; the default broker rate is **10%**. With no broker selected, the broker commission is zero. Both percentages are independent portions of retail sales, not portions of each other's earnings or of the margin.

**Owner net profit = retail product sales + customer shipping charge − product cost − courier − additional shipping/packing − return cost − sales agent commission − broker commission.** For retail sales Rs. 1,295, product cost Rs. 430 and courier Rs. 280, the default sales share is Rs. 259, the selected broker share is Rs. 129.50, and owner net is Rs. 196.50. Retail-based commissions can exceed the remaining margin; the owner net then shows a loss.

Admins/managers can enter both percentages and choose the broker in the order form. The live preview follows those fields; saving applies the order-specific snapshots. Combined rates cannot exceed 100%. Sales portal users may select an active broker when submitting an order; their rates come from configured profiles, and posted rate changes are ignored. Commissions are earned only on delivery; returns reverse both shares and keep recorded delivery/return costs as business losses.

**Brokers** in the department navigation provides broker contact/rate management, earned/paid/due/recovery balances, a separate payout ledger and a broker order register. Broker records are contacts, not staff login accounts. Broker payouts cannot exceed their currently earned balance, and later returns may create recovery balances. Sales agent payouts remain in the sales commission ledger.

The migration moves existing open legacy orders to the retail basis and gives their previously zero sales percentages the 20% default. Existing zero agent profile rates also become 20% once. Delivered/returned/cancelled orders retain their original saved profit basis and percentage. Managers can explicitly switch an existing order's calculation basis and rates; this is audited. Rerunning the migration preserves subsequent custom rates, including zero. New orders always use the retail basis.

## Private sales agent portal

An administrator can create each agent's email/password under **Sales Department → Agents & targets → Create an agent portal login**. The form creates an active SALES staff account and its linked agent profile together. Existing SALES staff accounts can also be enabled as agent profiles. Give each agent their own credentials and the `/agent-login` link. Login takes SALES users directly to `/agent`.

The portal provides **My Portal**, **My Customer Orders**, **Add Customer Order**, **My Commissions**, and **My Profile & Password**. Agents enter customer contacts, address, requirements, retail products and quantities. The server assigns the authenticated agent automatically, selects available stock batches and saves retail prices from the catalogue. Posted agent IDs, prices and payment statuses cannot assign another agent or mark an order paid.

Payment choices are **Cash on delivery**, **Advance payment**, and **Payment pending**. Advance reports capture amount, method, transaction reference and notes. They remain awaiting verification until admin/manager/accounts verifies actual receipt from the order detail screen. Verification creates one confirmed collection; repeated verification is blocked. Agents may report further advances only on their own open orders and within the remaining balance after existing reports. Confirmed balances distinguish unpaid, partial, paid and refund-due states.

SALES accounts cannot open shared shop, distribution, invoice, delivery, payment receipt or department finance screens. Portal lists, direct order/print links, financial details, follow-ups and exports stay scoped to the signed-in user. The agent export excludes product costs, internal business margins and other agents' data. Admins/managers retain department-wide access.

Disable an agent profile to revoke its portal access. An administrator can reset its password on the agent's profile; this invalidates previous sessions. Agents may change their own password after entering the current password, and may update their own phone/address. Commission rates, territory assignment, account creation and password resets for other agents remain controlled by administration.

Run `npm run db:migrate:sales-team` for the portal schema. `node scripts/check-agent-portal.cjs` checks two-agent isolation, trusted pricing, payment reporting and verification against the configured database in a transaction that rolls back all fixture records.

The **Sales Department** workspace supports customer retail orders. Create a SALES staff account, then enable its agent profile under **Agents & targets**. Managers set each agent's percentage of positive profit; new orders snapshot that rate and their retail prices and batch costs.

Agents submit their own customer orders with multiple products, customer phones, address, city and requirements. Admins and managers process orders through Pending → Dispatched → Delivered, or record a cancellation before dispatch / a return after dispatch. Courier name and consignment tracking are required for dispatch. Dispatch checks and deducts stock transactionally; recording a return restores stock to the original batch. Mark Returned only after goods arrive back.

Profit uses retail total plus shipping charged to the customer, less product cost, courier cost, additional shipping/packing cost and return cost. Only delivered orders earn commission on positive profit; returns reverse commission and retain delivery costs as losses. Existing orders retain their original agent percentage when profile rates change.

Department areas:

- **Overview:** monthly delivered retail revenue, delivered profit, order pipeline, customer account balances, open/overdue follow-ups and team target achievement.
- **Orders:** search and filter by agent, status, priority, customer and creation dates; detailed customer contact/address/source/requirements, shipment and expected delivery; managers can revise pending products and quantities. Retail price and cost snapshots on existing product lines are preserved. Cancellations and returns require a reason. Customer invoice printing excludes internal product costs, business margins and agent commission.
- **Agents & targets:** phone, designation, territory, address, joining date, notes, enabled status, rate, individual order history, monthly retail/order targets and historical targets. Monthly achievement counts currently delivered orders by delivery date in Pakistan time.
- **Follow-ups:** schedule order/customer tasks, see overdue/open/completed lists, record outcomes and retain them in order history. Agents can manage only their own customer follow-ups.
- **Commissions:** lifetime earned, paid, due and recovery balances, with an audited payout ledger. Record payments already made; this feature does not transfer money. Payouts cannot exceed available earned commission. Later returns/cost changes can create a recovery balance that offsets future earnings.
- **Reports:** order cohort reporting with date/agent/status/priority/search filters, delivery outcomes, costs, agent contribution, order profit registers, CSV export and browser printing. Report dates select order creation dates; payments and statuses show current lifetime totals for those selected orders.

Admins, managers and accounts staff may record customer collections/COD remittances and refunds in each order account. Collections cannot exceed the outstanding bill, and refunds cannot exceed the refundable balance. Payout and collection limits are checked inside database transactions. Sales staff can see only their own orders, profile, commissions, follow-ups and reports; they cannot dispatch orders, change agent percentages or record financial transactions.

Customer order payments and commission payouts belong to the department's own ledgers and do not alter shop invoice collections, shop closing reports or the global distribution cash balance. Department reports distinguish profit from actual customer cash received. Delivery status never automatically records a collection.

For an existing installation, run `npm run db:migrate:sales-team` to add/update the department tables. This migration is safe to rerun and preserves orders and history; it backfills delivery timestamps from existing status history. The full `npm run db:migrate` also includes them for new installations. Validate with `node --test tests/*.test.cjs` and `npm run build`.


## Mobile app and Hostinger updates

The mobile app is the same Next.js workspace installed from the browser. Open `https://YOUR-DOMAIN/install` on a phone and follow the instructions for Safari or Chrome. Open it from the home screen and sign in with the usual staff or agent account.

Both clients send requests to the same hosted application and Neon PostgreSQL database. Saved records become available to both immediately. The dashboard, Operations Center, reports, finance balance, sales overview, and agent summaries refresh while open and connected, approximately every 30 seconds. Editing screens retain their normal save and reload behavior. An internet connection is required.

### Enable automatic deployments

1. Push the project to the GitHub repository that will deploy the portal. Keep `.env.local` and server secrets outside Git.
2. In Hostinger, create or select a **Node.js Web App** on a plan that supports Next.js server apps. Import the GitHub repository, select the deployment branch, and select the project directory if it is a subfolder.
3. Choose **Next.js** and npm. Use `npm run build` for the build and `npm start` if Hostinger asks for a start command. Keep the app running as a Node.js server for login, database access, and server actions.
4. Set `DATABASE_URL` to the intended Neon database and set `SESSION_SECRET` in Hostinger environment variables. Preserve the existing session secret when redeploying an existing installation. Keep any configured `BUSINESS_*` environment variables.
5. Deploy over HTTPS and enable automatic deployment for the selected branch. Check the deployment log, then open `/api/health` and confirm it reports a connected database. Verify `/install` on the hosted domain and test the portal on a phone with your existing account.

Successful pushes to the connected branch trigger Hostinger builds. Both the browser portal and the installed app load the deployed release from that same domain on a fresh open or reload. See [Hostinger's Node.js Web App setup](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/).

## Field sales

Run `npm run db:migrate -- --field-sales-only` against the deployment database before releasing the Field Sales module. The migration creates the stock-booking table and indexes and adds a nullable payment submission ID to prevent duplicate collections on retry.

Create a **Field Sales** account in **Staff & Roles**, and use **Sales & Distribution → Field Sales Shop Access** to assign it to individual shops. Administrators and managers can grant, reassign, or revoke access. A shop registered by a Field Sales user awaits assignment. Existing Sales Agent accounts continue to use their assigned shops and keep their separate agent portal. Booking quantities go into the pending queue and are deducted from inventory only when a manager dispatches the booking and issues its invoice. Approved shop pricing and inventory checks use the existing dispatch workflow.

Collections are applied to the selected invoice, and the collector is recorded from the current session. Field activity stores the server date and time and the device coordinates only when the user attaches a location. HTTPS and browser location permission are required on phones. The PDF button opens the device share sheet on browsers that support file sharing. Choose WhatsApp there, or download the PDF and attach it manually.
