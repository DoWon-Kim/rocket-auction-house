-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "stats" JSONB,
ADD COLUMN     "textKo" JSONB,
ADD COLUMN     "textKoSource" TEXT;

-- CreateTable
CREATE TABLE "PokemonSpecies" (
    "dexId" INTEGER NOT NULL,
    "nameKo" TEXT NOT NULL,
    "nameJa" TEXT,
    "nameEn" TEXT NOT NULL,
    "genusKo" TEXT,
    "flavorKo" TEXT,
    "heightDm" INTEGER,
    "weightHg" INTEGER,
    "types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generation" INTEGER,
    "evolvesFromDexId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PokemonSpecies_pkey" PRIMARY KEY ("dexId")
);

-- CreateTable
CREATE TABLE "KoDictEntry" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "srcLang" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "ko" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KoDictEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PokemonSpecies_nameKo_idx" ON "PokemonSpecies"("nameKo");

-- CreateIndex
CREATE INDEX "PokemonSpecies_nameJa_idx" ON "PokemonSpecies"("nameJa");

-- CreateIndex
CREATE INDEX "PokemonSpecies_nameEn_idx" ON "PokemonSpecies"("nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "KoDictEntry_kind_srcLang_src_key" ON "KoDictEntry"("kind", "srcLang", "src");

