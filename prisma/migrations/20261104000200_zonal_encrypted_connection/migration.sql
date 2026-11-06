-- Additive only. No plaintext credentials, encryption key or browser session data.
CREATE TABLE "ZonalConnection" (
 "restaurantId" TEXT PRIMARY KEY REFERENCES "Restaurant"("id") ON DELETE RESTRICT,
 "branch" TEXT NOT NULL,
 "encryptedCredentials" TEXT,
 "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
 "loginVerifiedAt" TIMESTAMP(3),
 "reportAccessVerifiedAt" TIMESTAMP(3),
 "lastAttemptAt" TIMESTAMP(3),
 "lastResultCode" TEXT,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "zonal_disconnected_unverified" CHECK ("encryptedCredentials" IS NOT NULL OR ("loginVerifiedAt" IS NULL AND "reportAccessVerifiedAt" IS NULL))
);
