import { and, desc, eq, gte, isNotNull, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  wines, 
  purchaseLinks, 
  InsertWine, 
  InsertPurchaseLink,
  Wine,
  WineSubcriteria
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==================== USER QUERIES ====================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    } else {
      // Check if this is the first user in the database
      const existingUsers = await db.select().from(users).limit(1);
      if (existingUsers.length === 0) {
        // First user becomes admin
        values.role = "admin";
        updateSet.role = "admin";
      } else {
        // Check if the existing user is the current user and has default role
        const currentUser = existingUsers.find(u => u.openId === user.openId);
        if (currentUser && currentUser.role === "user" && existingUsers.length === 1) {
          // This is the only user and has default role, upgrade to admin
          values.role = "admin";
          updateSet.role = "admin";
        }
      }
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== WINE QUERIES ====================

/**
 * Calculate scores from subcriteria
 */
export function calculateScores(subcriteria: WineSubcriteria) {
  const appearanceScore = 
    (subcriteria.appearance?.clarity || 0) +
    (subcriteria.appearance?.color || 0) +
    (subcriteria.appearance?.visualAspect || 0);
  
  const aromasScore = 
    (subcriteria.aromas?.intensity || 0) +
    (subcriteria.aromas?.complexity || 0) +
    (subcriteria.aromas?.quality || 0);
  
  const palateScore = 
    (subcriteria.palate?.attack || 0) +
    (subcriteria.palate?.structure || 0) +
    (subcriteria.palate?.intensity || 0) +
    (subcriteria.palate?.persistence || 0);
  
  const harmonyScore = 
    (subcriteria.harmony?.balance || 0) +
    (subcriteria.harmony?.elegance || 0) +
    (subcriteria.harmony?.integration || 0);
  
  const potentialScore = 
    (subcriteria.potential?.typicity || 0) +
    (subcriteria.potential?.agingPotential || 0);
  
  const finalScore = appearanceScore + aromasScore + palateScore + harmonyScore + potentialScore;
  
  return {
    appearanceScore: Math.min(appearanceScore, 5),
    aromasScore: Math.min(aromasScore, 25),
    palateScore: Math.min(palateScore, 40),
    harmonyScore: Math.min(harmonyScore, 20),
    potentialScore: Math.min(potentialScore, 10),
    finalScore: Math.min(finalScore, 100),
  };
}

/**
 * Determine if wine qualifies as "Best Buy"
 */
export function isBestBuy(finalScore: number, costBenefit: number, referencePrice: string | null): boolean {
  return finalScore >= 88 && costBenefit >= 4 && referencePrice !== null;
}

export interface WineFilters {
  style?: "tinto" | "branco" | "rose" | "espumante";
  minScore?: number;
  minCostBenefit?: number;
  maxPrice?: number;
  minPrice?: number;
  country?: string;
  region?: string;
  grape?: string;
  bestBuyOnly?: boolean;
  search?: string;
}

/**
 * Get all wines with optional filters
 */
export async function getWines(filters?: WineFilters) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (filters?.style) {
    conditions.push(eq(wines.style, filters.style));
  }
  if (filters?.minScore) {
    conditions.push(gte(wines.finalScore, filters.minScore));
  }
  if (filters?.minCostBenefit) {
    conditions.push(gte(wines.costBenefit, filters.minCostBenefit));
  }
  if (filters?.maxPrice) {
    conditions.push(sql`CAST(${wines.referencePrice} AS DECIMAL) <= ${filters.maxPrice}`);
  }
  if (filters?.minPrice) {
    conditions.push(sql`CAST(${wines.referencePrice} AS DECIMAL) >= ${filters.minPrice}`);
  }
  if (filters?.country) {
    conditions.push(eq(wines.country, filters.country));
  }
  if (filters?.region) {
    conditions.push(like(wines.region, `%${filters.region}%`));
  }
  if (filters?.grape) {
    conditions.push(like(wines.grapes, `%${filters.grape}%`));
  }
  if (filters?.bestBuyOnly) {
    conditions.push(eq(wines.isBestBuy, true));
  }
  if (filters?.search) {
    conditions.push(
      or(
        like(wines.name, `%${filters.search}%`),
        like(wines.producer, `%${filters.search}%`)
      )
    );
  }

  const query = conditions.length > 0
    ? db.select().from(wines).where(and(...conditions)).orderBy(desc(wines.finalScore))
    : db.select().from(wines).orderBy(desc(wines.finalScore));

  return query;
}

/**
 * Get a single wine by ID
 */
export async function getWineById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(wines).where(eq(wines.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get wine with purchase links
 */
export async function getWineWithLinks(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const wine = await getWineById(id);
  if (!wine) return undefined;

  const links = await db.select().from(purchaseLinks).where(eq(purchaseLinks.wineId, id));

  return { ...wine, purchaseLinks: links };
}

/**
 * Create a new wine
 */
export async function createWine(data: Omit<InsertWine, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Calculate scores from subcriteria
  const scores = data.subcriteria ? calculateScores(data.subcriteria) : {
    appearanceScore: 0,
    aromasScore: 0,
    palateScore: 0,
    harmonyScore: 0,
    potentialScore: 0,
    finalScore: 0,
  };

  const bestBuy = isBestBuy(
    scores.finalScore, 
    data.costBenefit || 3, 
    data.referencePrice?.toString() || null
  );

  const result = await db.insert(wines).values({
    ...data,
    ...scores,
    isBestBuy: bestBuy,
  });

  return result[0].insertId;
}

/**
 * Update a wine
 */
export async function updateWine(id: number, data: Partial<InsertWine>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // If subcriteria is being updated, recalculate scores
  let updateData: Partial<InsertWine> = { ...data };
  
  if (data.subcriteria) {
    const scores = calculateScores(data.subcriteria);
    updateData = { ...updateData, ...scores };
    
    // Recalculate best buy status
    const existingWine = await getWineById(id);
    const costBenefit = data.costBenefit ?? existingWine?.costBenefit ?? 3;
    const referencePrice = data.referencePrice ?? existingWine?.referencePrice;
    updateData.isBestBuy = isBestBuy(scores.finalScore, costBenefit, referencePrice?.toString() || null);
  } else if (data.costBenefit !== undefined || data.referencePrice !== undefined) {
    // Recalculate best buy if cost benefit or price changed
    const existingWine = await getWineById(id);
    if (existingWine) {
      const costBenefit = data.costBenefit ?? existingWine.costBenefit;
      const referencePrice = data.referencePrice ?? existingWine.referencePrice;
      updateData.isBestBuy = isBestBuy(existingWine.finalScore, costBenefit, referencePrice?.toString() || null);
    }
  }

  await db.update(wines).set(updateData).where(eq(wines.id, id));
}

/**
 * Delete a wine and its purchase links
 */
export async function deleteWine(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete purchase links first
  await db.delete(purchaseLinks).where(eq(purchaseLinks.wineId, id));
  // Delete wine
  await db.delete(wines).where(eq(wines.id, id));
}

// ==================== PURCHASE LINK QUERIES ====================

/**
 * Get purchase links for a wine
 */
export async function getPurchaseLinks(wineId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(purchaseLinks).where(eq(purchaseLinks.wineId, wineId));
}

/**
 * Create a purchase link
 */
export async function createPurchaseLink(data: Omit<InsertPurchaseLink, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Explicitly specify all fields to avoid Drizzle ORM issues
  const result = await db.insert(purchaseLinks).values({
    wineId: data.wineId,
    storeName: data.storeName,
    url: data.url,
    price: data.price || null,
    observation: data.observation || null,
  });
  
  return result[0].insertId;
}

/**
 * Update a purchase link
 */
export async function updatePurchaseLink(id: number, data: Partial<InsertPurchaseLink>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(purchaseLinks).set(data).where(eq(purchaseLinks.id, id));
}

/**
 * Delete a purchase link
 */
export async function deletePurchaseLink(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(purchaseLinks).where(eq(purchaseLinks.id, id));
}

/**
 * Get unique countries from wines
 */
export async function getCountries() {
  const db = await getDb();
  if (!db) return [];

  const result = await db.selectDistinct({ country: wines.country }).from(wines);
  return result.map(r => r.country);
}

/**
 * Get unique regions from wines
 */
export async function getRegions() {
  const db = await getDb();
  if (!db) return [];

  const result = await db.selectDistinct({ region: wines.region }).from(wines).where(isNotNull(wines.region));
  return result.map(r => r.region).filter(Boolean) as string[];
}


// ==================== RECIPE QUERIES ====================

import { recipes, recipeWines, InsertRecipe, InsertRecipeWine } from "../drizzle/schema";

export interface RecipeFilters {
  category?: string;
  mainIngredient?: string;
  difficulty?: "facil" | "medio" | "dificil";
  search?: string;
}

/**
 * Get all recipes with optional filters
 */
export async function getRecipes(filters?: RecipeFilters) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (filters?.category) {
    conditions.push(eq(recipes.category, filters.category));
  }
  if (filters?.mainIngredient) {
    conditions.push(like(recipes.mainIngredient, `%${filters.mainIngredient}%`));
  }
  if (filters?.difficulty) {
    conditions.push(eq(recipes.difficulty, filters.difficulty));
  }
  if (filters?.search) {
    conditions.push(
      or(
        like(recipes.name, `%${filters.search}%`),
        like(recipes.description, `%${filters.search}%`)
      )
    );
  }

  const query = conditions.length > 0
    ? db.select().from(recipes).where(and(...conditions)).orderBy(desc(recipes.createdAt))
    : db.select().from(recipes).orderBy(desc(recipes.createdAt));

  return query;
}

/**
 * Get a single recipe by ID
 */
export async function getRecipeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get recipe with recommended wines
 */
export async function getRecipeWithWines(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const recipe = await getRecipeById(id);
  if (!recipe) return undefined;

  // Get wine IDs linked to this recipe
  const wineLinks = await db.select().from(recipeWines).where(eq(recipeWines.recipeId, id));
  
  // Get full wine data for each linked wine
  const recommendedWines = [];
  for (const link of wineLinks) {
    const wine = await getWineById(link.wineId);
    if (wine) {
      recommendedWines.push({ ...wine, pairingNote: link.note });
    }
  }

  return { ...recipe, recommendedWines };
}

/**
 * Create a new recipe
 */
export async function createRecipe(data: Omit<InsertRecipe, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(recipes).values(data);
  return result[0].insertId;
}

/**
 * Update a recipe
 */
export async function updateRecipe(id: number, data: Partial<InsertRecipe>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(recipes).set(data).where(eq(recipes.id, id));
}

/**
 * Delete a recipe and its wine links
 */
export async function deleteRecipe(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete wine links first
  await db.delete(recipeWines).where(eq(recipeWines.recipeId, id));
  // Delete recipe
  await db.delete(recipes).where(eq(recipes.id, id));
}

/**
 * Link a wine to a recipe
 */
export async function linkWineToRecipe(data: Omit<InsertRecipeWine, 'id' | 'createdAt'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(recipeWines).values(data);
  return result[0].insertId;
}

/**
 * Unlink a wine from a recipe
 */
export async function unlinkWineFromRecipe(recipeId: number, wineId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(recipeWines).where(
    and(eq(recipeWines.recipeId, recipeId), eq(recipeWines.wineId, wineId))
  );
}

/**
 * Get unique recipe categories
 */
export async function getRecipeCategories() {
  const db = await getDb();
  if (!db) return [];

  const result = await db.selectDistinct({ category: recipes.category }).from(recipes);
  return result.map(r => r.category);
}

/**
 * Get wines by pairing (ingredient/dish)
 */
export async function getWinesByPairing(pairing: string) {
  const db = await getDb();
  if (!db) return [];

  // Search for wines that have this pairing in their pairings array
  const result = await db.select().from(wines).where(
    sql`JSON_SEARCH(${wines.pairings}, 'one', ${`%${pairing}%`}) IS NOT NULL`
  ).orderBy(desc(wines.finalScore));

  return result;
}

/**
 * Get wines by occasion
 */
export async function getWinesByOccasion(occasion: string) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(wines).where(
    sql`JSON_SEARCH(${wines.occasions}, 'one', ${`%${occasion}%`}) IS NOT NULL`
  ).orderBy(desc(wines.finalScore));

  return result;
}
