#!/usr/bin/env python3
"""Check which modules are installed and install Accounting if it isn't."""
import xmlrpc.client

ODOO_URL = "http://localhost:8069"
DB = "urban_erp"
USER = "admin"
PASSWORD = "admin"

common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
uid = common.authenticate(DB, USER, PASSWORD, {})
models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")

def execute(model, method, *args, **kwargs):
    return models.execute_kw(DB, uid, PASSWORD, model, method, list(args), kwargs)

installed = execute('ir.module.module', 'search_read',
    [['name', 'in', ['account', 'contacts', 'product']]],
    fields=['name', 'state'])
print("module states:", installed)

for mod in installed:
    if mod['state'] != 'installed':
        print(f"installing {mod['name']}...")
        mod_ids = execute('ir.module.module', 'search', [['name', '=', mod['name']]])
        execute('ir.module.module', 'button_immediate_install', mod_ids)
        print(f"  {mod['name']} installed")

# check if account.move / account.account models are now reachable
try:
    count = execute('account.account', 'search_count', [])
    print(f"account.account reachable — {count} accounts exist")
except Exception as e:
    print(f"account.account NOT reachable: {e}")
