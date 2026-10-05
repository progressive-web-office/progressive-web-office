# Data models

A **data model** describes the data of an application before its database
is made, at three levels kept in step (DB-002..DB-004): the **conceptual**
model (entities and associations, the MCD), the **logical** model derived
from it (relations and keys, the MLD), and the **physical** model — the SQL
that makes the tables.

*New data model…* in the command palette makes one, from an example
(customers, orders, products); it is a `.mcd` file of the folder, opened
like a document. Any `.mcd` file opens the same way.

## The conceptual model

It is written as text, on the left; its diagram is drawn on the right as
you type.

```text
-- Customers, their orders and the products ordered.
entity Customer
  #customer_id: serial
  name: varchar(80)

entity Order
  #order_id: serial
  date: date

entity Product
  #product_id: serial
  label: varchar(80)
  price: decimal(8,2)

association Places
  Customer 0,n
  Order 1,1

association Contains
  Order 1,n
  Product 0,n
  quantity: integer
```

- `entity Name`, then its **attributes**, indented (<kbd>Enter</kbd> after a
  line keeps the indent); `#` before the **identifier** (one or more
  attributes); a type after `:`.
- `association Name`, then each entity it links with its **cardinality** —
  `0,1`, `1,1`, `0,n`, `1,n` (also written `01`, `11`, `0N`, `1N`) — and its
  own attributes. Two links to the same entity (a reflexive association) are
  told apart by a role in brackets: `Employee 0,1 (report)`,
  `Employee 0,n (manager)`.
- `--` starts a comment. `entité` is understood as `entity`.
- Types: `integer`, `serial` (a counter), `real`, `decimal(p,s)`,
  `varchar(n)`, `char(n)`, `text`, `date`, `time`, `datetime`, `boolean`,
  `blob`; an identifier without a type is an `integer`, another attribute a
  `text`.

Mistakes are listed under the text with their line — an unknown entity, an
entity without identifier, a name used twice; click one to go to its line.
**⇩ Export the diagram (SVG)** saves the drawing.

## The logical model

**Logical (MLD)** shows the relations derived by the usual rules:

- each entity becomes a relation, its identifier the **primary key**;
- an association with a side `x,1` (a binary association) becomes a
  **foreign key** of the entity of that side, with the association's
  attributes — `NOT NULL` for `1,1`, empty allowed for `0,1`, unique when
  both sides are `x,1`;
- any other association becomes a relation whose key is made of the keys
  of its entities.

```text
Customer (customer_id, name)
Order (order_id, date, #customer_id)
Product (product_id, label, price)
Contains (#order_id, #product_id, quantity)
```

The primary key is underlined, a foreign key follows `#`.

## The physical model

**Physical (SQL)** gives the `CREATE TABLE` statements for **SQLite**,
**PostgreSQL** or **MySQL / MariaDB**, the tables in an order where each
follows those it refers to, with their primary keys, foreign keys and
unique constraints. **Copy the SQL**, or **Save as a .sql file**: the file is
written beside the model, and runs with SQLite like any `.sql` file of the
folder (see [Code cells](./code.md)) — the tables are made and their keys
checked.
