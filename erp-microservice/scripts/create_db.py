#!/usr/bin/env python3
"""
Create the Odoo database via XML-RPC, scriptable so any teammate (or CI) can
reproduce this instead of clicking through the web UI's database manager.
"""
import sys
import xmlrpc.client

ODOO_URL = "http://localhost:8069"
DB_NAME = "urban_erp"
ADMIN_LOGIN = "admin"
ADMIN_PASSWORD = "admin"
MASTER_PASSWORD = "admin"  # Odoo's docker image default; override if changed

def main():
    db_service = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/db")

    existing = db_service.list()
    if DB_NAME in existing:
        print(f"Database '{DB_NAME}' already exists — nothing to do.")
        return

    print(f"Creating database '{DB_NAME}' (this takes ~30-60s, Odoo is loading base modules)...")
    try:
        db_service.create_database(
            MASTER_PASSWORD, DB_NAME,
            False,          # demo data — off, we seed our own realistic data
            "en_US",        # lang
            ADMIN_PASSWORD,
            ADMIN_LOGIN,    # login (Odoo 17+ signature includes this)
            "Urban Furniture",  # country_code param slot / company name depending on version
        )
    except TypeError:
        # older create_database signature without the trailing name arg
        db_service.create_database(MASTER_PASSWORD, DB_NAME, False, "en_US", ADMIN_PASSWORD)
    except xmlrpc.client.Fault as e:
        print(f"ERROR creating database: {e.faultString}")
        sys.exit(1)

    print(f"Database '{DB_NAME}' created. Verifying login...")
    common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
    uid = common.authenticate(DB_NAME, ADMIN_LOGIN, ADMIN_PASSWORD, {})
    if not uid:
        print("ERROR: database created but authentication failed")
        sys.exit(1)
    print(f"OK — authenticated as uid={uid}")

if __name__ == "__main__":
    main()
