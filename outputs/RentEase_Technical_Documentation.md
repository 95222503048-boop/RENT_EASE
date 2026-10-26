# RentEase – Furniture & Appliance Rental Platform

**Technical Documentation and Project Requirements**  
**Document status:** Initial project specification  
**Audience:** Students, product owners, designers, and implementation teams

## 1. Executive summary

RentEase is a responsive web platform for renting essential furniture and appliances on a monthly basis. It helps students and working professionals furnish temporary homes without the cost, transport burden, or maintenance responsibility associated with ownership. Customers can browse local inventory, select a rental term, schedule delivery, manage their rental, request support, and arrange a return or extension. Operations staff manage products, availability, orders, logistics, service cases, and reporting.

The first release is a single-country, multi-city web application. It should support location-aware inventory and delivery scheduling, while keeping payments integration-ready. The brief does not specify a payment provider, pricing rules, service-level targets, or vendor settlement model; those are product decisions to confirm before production implementation.

## 2. Problem and objectives

### 2.1 Problem statement

Renters commonly face high upfront purchase costs, relocation and transport difficulties, inflexible rental arrangements, limited local options, and inconsistent maintenance support. These barriers make it harder to settle into a home quickly and affordably.

### 2.2 Objectives

**Primary objectives**

- Provide affordable monthly rental options.
- Offer clear, flexible rental terms.
- Make essential furniture and appliances easy to find and rent.
- Improve convenience for people living in urban areas.

**Secondary objectives**

- Reduce unnecessary purchases and encourage reuse.
- Support relocation through delivery and pickup services.
- Establish a scalable operating model for additional cities.

### 2.3 Success measures

Track the following KPIs, with definitions and reporting periods agreed before launch:

| KPI | Suggested definition |
|---|---|
| Active rentals | Rentals currently in the active state on the reporting date |
| Monthly recurring revenue (MRR) | Monthlyized recurring rent from active subscriptions, excluding deposits and one-time fees |
| Product utilization | Rental-days occupied divided by rentable inventory-days, by product and city |
| Customer retention | Share of customers who begin another rental within a defined period after a rental ends |
| Maintenance resolution time | Median elapsed time from case creation to resolution |

## 3. Scope

### 3.1 In scope for the initial release

- Responsive web experience with a mobile-first layout.
- Account registration, login, and customer profile.
- Furniture and appliance catalog with search, category filters, product details, pricing, deposit, and rental term options.
- Cart and checkout with delivery location and requested delivery date.
- Rental lifecycle management, including extension and return requests.
- Maintenance request submission and status tracking.
- Admin and operations views for inventory, orders, schedules, service requests, returns, damage claims, service areas, and basic reporting.
- City-aware availability and inventory tracking.

### 3.2 Out of scope

- Native iOS or Android applications.
- Cross-border rentals.
- AI-driven or dynamically optimized pricing.
- A second-hand resale marketplace.
- Smart appliance telemetry and furniture customization.
- Automated payments and renewals unless separately approved as an implementation requirement.

## 4. Users and permissions

| Role | Main capabilities |
|---|---|
| Visitor | Browse the catalog and view product information; account required to place an order |
| Customer | Manage profile, cart, checkout, active rentals, extensions, returns, support requests, and rental history |
| Vendor / inventory operator | Manage assigned products, stock, pricing and terms where authorized; view relevant orders and schedules; update fulfillment and maintenance work |
| Administrator | Manage users, inventory, orders, service areas, disputes, damage claims, reports, and role access |

Authorization must be enforced by the backend for every protected operation. Vendor access should be restricted to the vendor's assigned inventory and operational records. Administrative actions should be auditable.

## 5. Functional requirements

### 5.1 Accounts and profiles

- **FR-01:** A visitor can register and sign in using an approved authentication method.
- **FR-02:** A customer can view and update contact details and saved delivery addresses.
- **FR-03:** Users can sign out; sensitive account actions require an authenticated session.
- **FR-04:** Administrators can activate, suspend, and review user accounts subject to an audit record.

### 5.2 Catalog and product discovery

- **FR-05:** Users can browse products by category: furniture (for example, bed, sofa, table) and appliances (for example, fridge, washing machine, TV).
- **FR-06:** Users can search and filter by category, service location, availability, and supported rental term.
- **FR-07:** Product details show description, images, condition, monthly rent, security deposit, available rental terms, and delivery information.
- **FR-08:** Availability shown to users must be based on current city inventory and scheduled rental periods; it must not promise a unit that has already been reserved.

### 5.3 Cart, checkout, and delivery

- **FR-09:** A customer can add and remove products and select an offered rental term.
- **FR-10:** Before order placement, the system shows the rent, deposit, any configured fees or taxes, the selected term, delivery address, and requested delivery date.
- **FR-11:** A customer can select a serviceable delivery location and an available delivery date or slot.
- **FR-12:** Order placement creates a rental order and reserves inventory atomically, subject to availability.
- **FR-13:** The customer receives an order confirmation and can review order status.
- **FR-14:** Payment collection is integration-ready. The payment provider, payment timing, refund rules, and whether checkout can be completed without online payment require a business decision.

### 5.4 Rental management

- **FR-15:** A customer can view active and past rentals, including products, term, dates, and status.
- **FR-16:** A customer can request a rental extension. The request is confirmed only after availability, revised price, and operational conditions are checked.
- **FR-17:** A customer can request return or pickup and select an available date or slot.
- **FR-18:** Operations staff can update fulfillment, rental, return, and inspection statuses.
- **FR-19:** A return is not complete until pickup and condition inspection have been recorded.

### 5.5 Maintenance and claims

- **FR-20:** A customer can submit a maintenance request against an active rental, including a description and optional images.
- **FR-21:** The customer can view request status and staff responses.
- **FR-22:** Authorized staff can assign, update, resolve, and record outcomes for maintenance requests.
- **FR-23:** Staff can record return condition, damage evidence, and a damage claim outcome. Disputes and claim decisions must be traceable.

### 5.6 Administration and operations

- **FR-24:** Authorized users can create, update, deactivate, and inspect products and inventory units.
- **FR-25:** Authorized users can configure prices, deposits, and supported rental terms, with effective dates or change history.
- **FR-26:** Operations users can manage delivery and pickup schedules and update fulfillment status.
- **FR-27:** Administrators can manage service areas and their supported products, delivery dates, and capacity.
- **FR-28:** Administrators can view users, orders, rentals, service requests, returns, claims, and operational reports according to their role.
- **FR-29:** Reports can summarize active rentals, MRR, utilization, retention, and maintenance resolution time, with filters by date and city where data permits.

## 6. Business rules and lifecycle

The following are recommended initial rules; exact commercial policy must be confirmed by the product owner.

1. A product may have multiple physical inventory units. Catalog availability is derived from eligible units in the requested service area and date range.
2. Checkout must validate inventory again when the order is submitted. A cart alone does not guarantee inventory.
3. Rent and deposit are stored as monetary values with an ISO currency code. Do not use floating-point arithmetic for money.
4. A rental term must be selected from the options offered for that product at checkout. The selected price and terms are snapshotted on the order so later catalog changes do not rewrite past agreements.
5. Inventory states should distinguish at least available, reserved, rented, maintenance, and retired. A unit cannot be allocated to overlapping reservations or rentals.
6. Order and rental statuses should be explicit and changed through validated transitions, not arbitrary text edits.
7. Return requests, extensions, cancellations, refunds, late fees, taxes, and damage charges require configurable policy decisions before implementation.
8. Every material administrative or operational status change should record the actor, timestamp, and relevant reason.

### 6.1 Suggested order and rental states

**Order:** `draft` → `placed` → `confirmed` → `fulfillment_scheduled` → `delivered` → `completed`; alternate outcomes may include `cancelled` and `rejected`.

**Rental:** `scheduled` → `active` → `return_requested` → `pickup_scheduled` → `inspection_pending` → `closed`; extension requests should be tracked separately or represented with a clearly defined request state. A rental may be `overdue` when its end date has passed without an approved extension or completed return.

**Maintenance request:** `open` → `triaged` → `in_progress` → `resolved` or `closed`; support cancellation where applicable.

These values are proposed. The implementation should document and validate the final state transitions.

## 7. Non-functional requirements

- **Performance:** Target page loads under 3 seconds on the agreed reference device, network, and test location. Define whether this means full load, Largest Contentful Paint, or another measure before acceptance.
- **Security:** Use established authentication and session practices, role-based authorization, secure transport, input validation, secure password handling if passwords are managed directly, and protected secrets. Never store raw card details; use a payment provider if online payments are enabled.
- **Privacy:** Collect only necessary personal data, restrict access by role, and define retention and deletion rules before production launch.
- **Reliability:** Prevent conflicting inventory reservations and keep order, rental, payment, and inventory records consistent. Use transaction or equivalent concurrency controls for checkout.
- **Usability:** Provide a simple, mobile-first interface with clear prices, terms, dates, validation, and status messages.
- **Accessibility:** Target WCAG 2.1 AA for core customer and administrative journeys, subject to verification.
- **Scalability:** Support city-scoped inventory, service areas, and reporting so new cities can be added without duplicating the application.
- **Observability:** Log operational errors and key state transitions; avoid logging passwords, payment credentials, or unnecessary personal data.
- **Maintainability:** Keep business rules in the backend, document API contracts and state transitions, and use consistent validation and error formats.

## 8. Suggested technical architecture

The following is a proposed baseline, not a locked technology decision.

- **Frontend:** React or Next.js with HTML5, CSS, and JavaScript/TypeScript; Tailwind CSS or Bootstrap may be used for responsive styling.
- **Backend:** Node.js with Express.js exposing REST APIs. Keep authentication, authorization, pricing calculations, inventory allocation, and state transitions on the server.
- **Database:** PostgreSQL is a good fit for transactional orders, rentals, scheduling, and inventory consistency. MongoDB remains an option if the team has a specific document-oriented need, but inventory allocation still needs strong consistency controls.
- **Images and documents:** Object storage with access controls for product images and maintenance or damage evidence.
- **Deployment:** AWS, Vercel, or Netlify depending on the selected hosting architecture. Secrets and production data must not be committed to source control.
- **External integrations:** Payment gateway, email/SMS notifications, maps/address validation, and delivery partner systems are optional integrations requiring provider and policy selection.

### 8.1 Logical components

1. **Web client:** Catalog, account, checkout, rental management, support, and operations dashboards.
2. **REST API:** Authentication, catalog, pricing, availability, orders, rentals, schedules, support, administration, and reporting.
3. **Relational data store:** Users, products, inventory, service areas, orders, rentals, requests, and audit events.
4. **File storage:** Product images and customer-submitted evidence, using authorization-aware access.
5. **Integration adapters:** Payment and notification providers behind backend interfaces so providers can change without rewriting core rental logic.

## 9. Data model

A relational model is recommended. Primary keys may be UUIDs. Tables should include created/updated timestamps; important mutable business records should preserve audit history.

| Entity | Important fields and relationships |
|---|---|
| `User` | `id`, name, email/phone, authentication reference, role, status |
| `Address` | `id`, `user_id`, address lines, city, postal code, location notes, service-area reference |
| `ServiceArea` | `id`, name, city, postal-code or boundary definition, active status, delivery capacity/policy |
| `Category` | `id`, name, parent category, active status |
| `Product` | `id`, SKU, name, description, category, images, condition/attributes, active status |
| `InventoryUnit` | `id`, product, service area, serial/asset reference, operational status, condition |
| `RentalPlan` | `id`, product, duration in months, monthly price, deposit, currency, effective dates, active status |
| `Order` | `id`, customer, address snapshot/reference, status, requested schedule, currency, totals snapshot |
| `OrderItem` | `id`, order, product, inventory unit when allocated, selected plan and price/term snapshots |
| `Rental` | `id`, order item, customer, unit, start/end dates, status, extension/return details |
| `DeliveryTask` | `id`, order or rental, task type, address, slot, assigned partner, status, completion evidence |
| `MaintenanceRequest` | `id`, rental, reporter, description, priority, status, assigned operator, resolution details |
| `Claim` | `id`, rental, claim type, evidence references, amount if applicable, decision, decision actor/time |
| `PaymentRecord` | `id`, order/rental, provider reference, amount, currency, status, event timestamps; no raw card data |
| `AuditEvent` | `id`, actor, action, entity type/id, timestamp, reason, safe change metadata |

**Corrections to the source data notes:** “Product Users” is interpreted as product data. “Business Data: Name, Skill Type, Services Offered, Product List, Pricing” appears to describe a vendor or service partner profile; define whether vendors are first-class platform users and what “Skill Type” means before adding it to the schema.

## 10. REST API outline

All routes below are illustrative. Use versioned routes such as `/api/v1`, authenticated authorization checks, consistent pagination, and a documented error response format.

| Method and route | Purpose | Access |
|---|---|---|
| `POST /auth/register` | Create customer account | Public |
| `POST /auth/login` | Authenticate | Public |
| `GET /products` | Search/filter catalog by category and service area | Public |
| `GET /products/{id}` | Product details and rental terms | Public |
| `GET /availability` | Check product availability for dates and area | Public |
| `POST /cart/validate` | Recheck price, term, serviceability, and availability | Customer |
| `POST /orders` | Place order and reserve inventory | Customer |
| `GET /orders/{id}` | View order details and status | Owner or authorized staff |
| `GET /rentals` | List current and historical rentals | Customer or authorized staff |
| `POST /rentals/{id}/extension-requests` | Request extension | Rental owner |
| `POST /rentals/{id}/return-requests` | Request pickup/return | Rental owner |
| `POST /rentals/{id}/maintenance-requests` | Report a maintenance issue | Rental owner |
| `GET /maintenance-requests` | List or filter service requests | Authorized staff; customer sees own |
| `PATCH /admin/orders/{id}` | Update operational order status | Authorized staff |
| `POST /admin/products` | Add product | Admin/vendor according to policy |
| `PATCH /admin/inventory-units/{id}` | Update inventory state/location | Authorized staff |
| `GET /admin/reports` | Retrieve permitted operational metrics | Admin |

For order creation, use an idempotency key or equivalent protection against duplicate submissions. Availability checks must not be treated as a reservation until checkout successfully commits.

## 11. Key workflows

### 11.1 Customer rental

1. User selects a delivery location and browses serviceable products.
2. User reviews rent, deposit, terms, condition, and delivery details.
3. User adds product(s) to cart and selects a rental term.
4. Checkout revalidates serviceability, price, date, and inventory.
5. The system places the order, reserves units, records a price snapshot, and returns confirmation.
6. Operations schedules delivery; staff record delivery completion and the rental start.
7. Customer manages the active rental, requests maintenance, extension, or return.
8. On pickup, staff inspect the unit and close the rental, recording condition and any claim.

### 11.2 Inventory onboarding and fulfillment

1. An authorized operator creates a product and one or more inventory units.
2. Units are assigned to a service area and marked available only after readiness checks.
3. Confirmed orders reserve units and create delivery tasks.
4. Delivery changes the unit and rental to the appropriate active states.
5. Pickup and inspection return a unit to available, maintenance, or retired status.

## 12. Acceptance criteria for the MVP

- A customer can register, sign in, browse both top-level categories, and open product details.
- Product details show monthly rent, deposit, term options, and service availability for a selected location.
- A customer can create an order with a supported term, address, and delivery date, and receive a confirmation.
- Concurrent checkout attempts cannot allocate the same physical inventory unit to overlapping rentals.
- The customer can view active and completed rentals and submit a maintenance request, extension request, or return request.
- Staff can manage products, inventory, schedules, and maintenance cases with role-appropriate access.
- Admins can review orders, returns, claims, and service areas and view the agreed KPI reports.
- Core journeys work on supported mobile and desktop browsers and meet the agreed performance and accessibility targets.
- State changes and administrative actions needed for operational review can be traced to an actor and timestamp.

## 13. Assumptions, constraints, and decisions to confirm

**Assumptions from the brief**

- Target users are willing to rent rather than purchase some household essentials.
- Reliable delivery partners can be arranged.
- Inventory is stored locally and allocated by service area.

**Constraints from the brief**

- Logistics and maintenance add operating cost.
- Products wear over time and may be unavailable during repair.
- Inventory is limited by city and product.

**Decisions needed before production implementation**

- Launch geography, currency, taxes, service-area definition, and delivery capacity rules.
- Payment provider, deposits/refunds, cancellation policy, billing dates, late fees, and failed-payment handling.
- Rental term options, minimum term, extension pricing, return policy, and damage-claim process.
- Vendor onboarding and permissions, including the meaning of “Skill Type” in the supplied sample data.
- Notification channels, operational service-level targets, and support hours.
- Data retention, privacy, identity verification, and applicable legal review.
- Exact performance measurement method and supported browser/device matrix.

## 14. Future enhancements

- Native mobile applications.
- Bundled subscriptions for furnished rooms or household setups.
- Online payments, recurring billing, and auto-renewals.
- Smart appliance monitoring, subject to customer consent and device capability.
- Furniture options and customization.
- More advanced demand planning and pricing after sufficient operational data is available.

## 15. Deliverables

- Functional responsive web application.
- Admin and operations dashboard.
- Product requirements and technical documentation.
- Deployment-ready build and environment configuration.
- API and data model documentation.
- Operational guidance for inventory, delivery, returns, and maintenance.

---

*This document translates the supplied project brief into an implementable initial specification. Items identified as proposed or requiring confirmation should be finalized with the project owner before production launch.*
