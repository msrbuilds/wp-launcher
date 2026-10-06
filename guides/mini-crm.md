# Mini CRM & Client Portal

The Mini CRM runs client work alongside the sites you build: clients, projects
with a board, invoices, payment, and a conversation with each client. The
optional client portal gives those clients a sign-in of their own.

Both are panel features for owners and admins. Members never see them.

## Turning it on

**Settings → Features**:

- **Mini CRM** (`projects`) adds a *Mini CRM* group to the sidebar: Clients,
  Projects, Invoices and Payment Methods.
- **Client Portal** (`clientPortal`) is off by default and needs Mini CRM. While
  it is off, `/portal` behaves as though it does not exist.

Records belong to the staff user who created them. Another admin on the same
panel does not see your clients, projects or invoices.

## Clients and projects

Create a client first. Projects, invoices and messages all hang off a client.

Each project page shows its details beside a **board**. Columns and cards are
yours to define:

- Drag a card between or within columns. Drag a column by the grip in its header
  to reorder it.
- Open a card to edit its description, due date and labels, and to add **notes
  and files**. Notes and files are staff-only and never shown to the client.
- Each column header has an **eye** toggle (*visible to* / *hidden from the
  client*), hidden by default. The portal
  shows only visible columns and their cards. A column you forget to toggle stays
  private rather than leaking.

Deleting a column deletes its cards. Deleting a project deletes its board.

## Invoices and payment methods

**Payment Methods** holds the payment instructions you give clients, such as bank
details or a payment link. Only owners and admins can change the list.

When you create an invoice, choose which methods it shows. An invoice shows
**only** the methods attached to it, so adding a method later never changes an
invoice you have already sent. To retire a method that invoices still use,
deactivate it rather than delete it. Deactivating hides it from new invoices
and leaves sent ones intact.

Invoice statuses: **draft → sent → paid**, or **cancelled** from any status. Only
drafts can be edited or deleted. Invoice numbers (`INV-0001`, …) run across the
whole install.

## Payment proofs

A client who has paid uploads a receipt from the portal: PNG, JPEG, WebP or PDF,
up to 5 MB. The invoice moves to **Awaiting verification**, not to *Paid*. A
client cannot mark their own invoice settled.

The invoice shows the pending proof. Then:

- **Accept** records the payment, marks the invoice paid, and closes any other
  pending proofs on it.
- **Reject** requires a reason, which the client reads. The invoice returns to
  *Sent* once no other proof is pending.

Files are identified by their content, not their extension, stored outside the
code checkout under `data/uploads/`, and served only to signed-in users.

## Conversations

Each client has **one** message thread, written from both the panel (the
**Messages** button on the client) and the portal. A message can reference one
of that client's projects or invoices.

## Notifications

New messages, payment proofs and their outcomes raise notifications on both
sides:

- The **bell** in the panel and portal headers lists them and marks them read.
- **Email** follows each person's preference:
  - **Immediate:** sent as it happens. This is the default.
  - **Daily digest:** one email at 08:00 with everything since the last one.
  - **Off:** no email, but the bell still shows everything.

Staff set their preference on the **Account** page. Each portal login sets its
own in the portal, so one person at a client choosing the digest does not mute
their colleagues.

Email needs working SMTP. See the SMTP settings in the
[VPS guide](vps-deployment.md).

## Inviting clients to the portal

With Client Portal on, each client row has a **Portal** button. Enter the
person's email to send an invitation. The link is valid for **72 hours**. They
choose a password and then sign in at `https://<your panel>/portal`.

In the portal a client sees:

- their projects, limited to client-visible columns
- their invoices, but never drafts or cancelled ones, with the attached payment
  methods
- the place to upload payment proofs
- their conversation with you and their notifications

Removing someone from **Portal** revokes their sign-in immediately. Their
messages and uploaded proofs stay on record.

Portal sessions are separate from panel sessions, with a different token,
cookie name and cookie path. A client cannot reach any panel endpoint, and
signing in to the portal in a shared browser does not sign a staff member out.
