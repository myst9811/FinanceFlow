-- Change default currency for new accounts from USD to INR
ALTER TABLE "accounts" ALTER COLUMN "currency" SET DEFAULT 'INR';
