import { boolean, decimal, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Subscription plans table
 */
export const subscriptionPlans = mysqlTable("subscription_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  priceMonthly: decimal("price_monthly", { precision: 10, scale: 2 }).notNull(),
  priceYearly: decimal("price_yearly", { precision: 10, scale: 2 }),
  stripePriceIdMonthly: varchar("stripe_price_id_monthly", { length: 255 }),
  stripePriceIdYearly: varchar("stripe_price_id_yearly", { length: 255 }),
  features: json("features").$type<string[]>(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = typeof subscriptionPlans.$inferInsert;

/**
 * Subscriptions table
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  planId: int("plan_id").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  status: mysqlEnum("status", ["active", "canceled", "past_due", "trialing", "incomplete"]).notNull(),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  trialEnd: timestamp("trial_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Payment history table
 */
export const paymentHistory = mysqlTable("payment_history", {
  id: int("id").autoincrement().primaryKey(),
  subscriptionId: int("subscription_id").notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("BRL"),
  status: mysqlEnum("status", ["succeeded", "pending", "failed"]).notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PaymentHistory = typeof paymentHistory.$inferSelect;
export type InsertPaymentHistory = typeof paymentHistory.$inferInsert;

/**
 * Wine evaluation subcriteria stored as JSON
 */
export interface WineSubcriteria {
  // Aparência (max 5)
  appearance: {
    clarity: number;      // Limpidez e brilho: 0-2
    color: number;        // Cor (intensidade e adequação): 0-2
    visualAspect: number; // Aspecto visual geral: 0-1
  };
  // Aromas (max 25)
  aromas: {
    intensity: number;    // Intensidade aromática: 0-8
    complexity: number;   // Complexidade aromática: 0-10
    quality: number;      // Qualidade e precisão: 0-7
  };
  // Paladar (max 40)
  palate: {
    attack: number;       // Ataque e equilíbrio inicial: 0-8
    structure: number;    // Estrutura (acidez, taninos, álcool): 0-12
    intensity: number;    // Intensidade e definição dos sabores: 0-10
    persistence: number;  // Persistência (final de boca): 0-10
  };
  // Qualidade e Harmonia (max 20)
  harmony: {
    balance: number;      // Equilíbrio geral: 0-8
    elegance: number;     // Elegância e textura: 0-6
    integration: number;  // Integração dos elementos: 0-6
  };
  // Potencial e Tipicidade (max 10)
  potential: {
    typicity: number;     // Fidelidade ao estilo, uva e região: 0-5
    agingPotential: number; // Potencial de guarda: 0-5
  };
}

/**
 * Wine table - stores all wine evaluations
 */
export const wines = mysqlTable("wines", {
  id: int("id").autoincrement().primaryKey(),
  
  // Basic info
  name: varchar("name", { length: 255 }).notNull(),
  producer: varchar("producer", { length: 255 }).notNull(),
  vintage: int("vintage"), // Safra (ano)
  
  // Classification
  country: varchar("country", { length: 100 }).notNull(),
  region: varchar("region", { length: 255 }),
  grapes: varchar("grapes", { length: 500 }), // Comma-separated grape varieties
  style: mysqlEnum("style", ["tinto", "branco", "rose", "espumante"]).notNull(),
  
  // Image
  imageUrl: text("imageUrl"),
  
  // Price
  referencePrice: decimal("referencePrice", { precision: 10, scale: 2 }),
  
  // Scoring - subcriteria stored as JSON
  subcriteria: json("subcriteria").$type<WineSubcriteria>(),
  
  // Calculated scores (stored for query performance)
  appearanceScore: int("appearanceScore").default(0).notNull(), // max 5
  aromasScore: int("aromasScore").default(0).notNull(),         // max 25
  palateScore: int("palateScore").default(0).notNull(),         // max 40
  harmonyScore: int("harmonyScore").default(0).notNull(),       // max 20
  potentialScore: int("potentialScore").default(0).notNull(),   // max 10
  finalScore: int("finalScore").default(0).notNull(),           // 0-100
  
  // Cost-benefit (separate from final score)
  costBenefit: int("costBenefit").default(3).notNull(), // 1-5
  
  // Comments
  shortComment: text("shortComment"),   // "Por que vale a pena" - 2-3 lines
  longComment: text("longComment"),     // Detailed tasting notes
  
  // Pairing suggestions (JSON array)
  pairings: json("pairings").$type<string[]>(),
  
  // Occasions (JSON array) - jantar entre amigos, levar para jantar, churrasco, etc.
  occasions: json("occasions").$type<string[]>(),
  
  // When to drink
  drinkNow: boolean("drinkNow").default(true).notNull(),
  canAge: boolean("canAge").default(false).notNull(),
  
  // Best buy flag (calculated: finalScore >= 88 AND costBenefit >= 4 AND referencePrice IS NOT NULL)
  isBestBuy: boolean("isBestBuy").default(false).notNull(),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"), // User ID of curator
});

export type Wine = typeof wines.$inferSelect;
export type InsertWine = typeof wines.$inferInsert;

/**
 * Purchase links for wines
 */
export const purchaseLinks = mysqlTable("purchaseLinks", {
  id: int("id").autoincrement().primaryKey(),
  wineId: int("wineId").notNull(),
  storeName: varchar("storeName", { length: 255 }).notNull(),
  url: text("url").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }),
  observation: text("observation"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PurchaseLink = typeof purchaseLinks.$inferSelect;
export type InsertPurchaseLink = typeof purchaseLinks.$inferInsert;

/**
 * Recipe difficulty levels
 */
export type RecipeDifficulty = "facil" | "medio" | "dificil";

/**
 * Recipes table - tested recipes with wine pairings
 */
export const recipes = mysqlTable("recipes", {
  id: int("id").autoincrement().primaryKey(),
  
  // Basic info
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"), // Brief description
  
  // Recipe details
  ingredients: json("ingredients").$type<string[]>().notNull(), // List of ingredients
  steps: json("steps").$type<string[]>().notNull(), // Step by step instructions
  
  // Time and difficulty
  prepTime: int("prepTime").notNull(), // Preparation time in minutes
  cookTime: int("cookTime").notNull(), // Cooking time in minutes
  difficulty: mysqlEnum("difficulty", ["facil", "medio", "dificil"]).default("medio").notNull(),
  servings: int("servings").default(4).notNull(), // Number of servings
  
  // Categorization
  category: varchar("category", { length: 100 }).notNull(), // carnes, peixes, massas, etc.
  mainIngredient: varchar("mainIngredient", { length: 100 }).notNull(), // Main ingredient for filtering
  
  // Image
  imageUrl: text("imageUrl"),
  
  // Tips
  tips: text("tips"), // Optional cooking tips
  
  // Pairing comment - explains why the wine pairing works
  pairingComment: text("pairingComment"),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"), // User ID of curator
});

export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = typeof recipes.$inferInsert;

/**
 * Recipe-Wine pairings - links recipes to recommended wines
 */
export const recipeWines = mysqlTable("recipeWines", {
  id: int("id").autoincrement().primaryKey(),
  recipeId: int("recipeId").notNull(),
  wineId: int("wineId").notNull(),
  note: text("note"), // Optional note about why this wine works
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RecipeWine = typeof recipeWines.$inferSelect;
export type InsertRecipeWine = typeof recipeWines.$inferInsert;
