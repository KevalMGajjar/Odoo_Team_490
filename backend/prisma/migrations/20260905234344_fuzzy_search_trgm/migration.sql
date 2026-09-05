-- Trigram search, so a misspelt or half-remembered name still finds the record
-- ("priyesh" → "Priyanshu"). Plain ILIKE cannot do this: it needs a literal
-- substring, so a single wrong letter returns nothing.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes on the columns the search box actually queries. Without
-- these, similarity() degrades to a sequential scan on every keystroke.
CREATE INDEX IF NOT EXISTS contacts_name_trgm_idx ON "contacts" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contacts_email_trgm_idx ON "contacts" USING gin ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contacts_city_trgm_idx ON "contacts" USING gin ("city" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON "products" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS accounts_name_trgm_idx ON "chart_of_accounts" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS accounts_code_trgm_idx ON "chart_of_accounts" USING gin ("code" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS analytic_accounts_name_trgm_idx ON "analytic_accounts" USING gin ("name" gin_trgm_ops);
