# Databases and data models

A **data model** describes the data of an application before its database
is made, at three levels kept in step (DB-002..DB-004): the **conceptual**
model (entities and associations), the **logical** model derived from it
(relations and keys), and the **physical** model — the SQL
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

**Logical model** shows the relations derived by the usual rules:

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

**Physical model (SQL)** gives the `CREATE TABLE` statements for **SQLite**,
**PostgreSQL** or **MySQL / MariaDB**, the tables in an order where each
follows those it refers to, with their primary keys, foreign keys and
unique constraints. **Copy the SQL**, or **Save as a .sql file**: the file is
written beside the model, and runs with SQLite like any `.sql` file of the
folder (see [Code cells](./code.md)) — the tables are made and their keys
checked.

## SQLite databases

A SQLite database (`.sqlite`, `.sqlite3`, `.db`) opens as a document
(DB-001); *New SQLite database* in the command palette makes an empty one.
SQLite is downloaded the first time, after you agreed, checked, and runs in
the sandbox of the code cells.

- **Tables** lists its tables and views.
- **Data** shows the rows of the table chosen, a hundred at a time.
  Double-click a cell — or <kbd>Enter</kbd> on it — to change it (emptied, it
  becomes `NULL` when the column allows it); **＋ New row** adds a row with
  the default values, **🗑** deletes one. Views, and tables without rowid,
  are changed in SQL.
- **Structure** shows the columns — type, key, required, default, the
  table a column refers to — and the SQL that made the table.
- **SQL** runs statements (<kbd>Ctrl</kbd>+<kbd>Enter</kbd>): queries show
  their rows, other statements change the database — tables made appear in
  the list. **Run a .sql file…** runs a script, such as the SQL saved from a
  data model: the tables of the model are made in the database.
- The foreign keys are checked: a row referring to a row that does not exist
  is refused.

**Save** writes the database back as a SQLite file, with the changes.

**◇ Conceptual data model** reads the conceptual model back from the tables
(DB-005), as a `.mcd` file beside the database (or downloaded): a table
whose key is made of references to other tables becomes an association
between them, another table an entity, and each of its references an
association with a side `1,1` (or `0,1` when the column may be empty).
