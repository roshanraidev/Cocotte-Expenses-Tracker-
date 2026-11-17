-- Additive only. Existing roles/passwords/accounts remain untouched.
CREATE TYPE "AccessRole" AS ENUM ('SUPER_USER','ADMINISTRATOR','MANAGER','HEAD_CHEF','SOUS_CHEF','KITCHEN_STAFF','VIEWER');
ALTER TABLE "User" ADD COLUMN "accessRole" "AccessRole", ADD COLUMN "permissionOverrides" JSONB, ADD COLUMN "lastLoginAt" TIMESTAMP(3);
CREATE TABLE "AccessRolePolicy"("restaurantId" TEXT NOT NULL,"role" "AccessRole" NOT NULL,"permissions" JSONB NOT NULL,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "AccessRolePolicy_pkey" PRIMARY KEY("restaurantId","role"));
ALTER TABLE "AccessRolePolicy" ADD CONSTRAINT "AccessRolePolicy_restaurantId_fkey" FOREIGN KEY("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "PasswordReset"("id" TEXT NOT NULL,"userId" TEXT NOT NULL,"tokenHash" TEXT NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,"consumedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "PasswordReset_pkey" PRIMARY KEY("id"));
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");
CREATE INDEX "PasswordReset_userId_expiresAt_idx" ON "PasswordReset"("userId","expiresAt");
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
