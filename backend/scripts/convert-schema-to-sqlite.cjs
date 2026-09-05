const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

// 1. Change provider
schema = schema.replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"');
schema = schema.replace(/url\s*=\s*env\("DATABASE_URL"\)/, 'url = "file:./dev.db"');

// 2. Remove @db.Decimal and @db.Date
schema = schema.replace(/@db\.Decimal\([^)]+\)/g, '');
schema = schema.replace(/@db\.Date/g, '');

// 3. Convert enums to Strings and remove enum blocks
const enumRegex = /enum\s+(\w+)\s+\{[\s\S]*?\}/g;
let match;
const enums = [];
while ((match = enumRegex.exec(schema)) !== null) {
  enums.push(match[1]);
}
schema = schema.replace(enumRegex, '');

for (const e of enums) {
  const fieldRegex = new RegExp('(\\w+)\\s+' + e + '(\\?|\\s|\\s*@)', 'g');
  schema = schema.replace(fieldRegex, '$1 String$2');
}

// 4. Default values for Enums in schema need to be quoted, e.g. @default(active) -> @default("active")
schema = schema.replace(/@default\((active|archived|customer|vendor|both|goods|service|combo|average|standard|asset|liability|income|expense|capital|sales|purchase|bank|cash|miscellaneous|draft|posted|cancelled|revenue|bill|payment|cogs|fx|stock|opening|reversal|confirmed|not_paid|partial|paid|inbound|outbound|BReceipt|BPayment|CReceipt|CPayment|Journal|in|out|adjustment)\)/g, '@default("$1")');

fs.writeFileSync('prisma/schema.prisma', schema);
