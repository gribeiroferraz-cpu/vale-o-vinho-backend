import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { WineSubcriteria } from "../drizzle/schema";

// Zod schema for wine subcriteria validation
const subcriteriaSchema = z.object({
  appearance: z.object({
    clarity: z.number().min(0).max(2),
    color: z.number().min(0).max(2),
    visualAspect: z.number().min(0).max(1),
  }),
  aromas: z.object({
    intensity: z.number().min(0).max(8),
    complexity: z.number().min(0).max(10),
    quality: z.number().min(0).max(7),
  }),
  palate: z.object({
    attack: z.number().min(0).max(8),
    structure: z.number().min(0).max(12),
    intensity: z.number().min(0).max(10),
    persistence: z.number().min(0).max(10),
  }),
  harmony: z.object({
    balance: z.number().min(0).max(8),
    elegance: z.number().min(0).max(6),
    integration: z.number().min(0).max(6),
  }),
  potential: z.object({
    typicity: z.number().min(0).max(5),
    agingPotential: z.number().min(0).max(5),
  }),
});

// Wine input schema for create/update
const wineInputSchema = z.object({
  name: z.string().min(1).max(255),
  producer: z.string().min(1).max(255),
  vintage: z.number().int().min(1900).max(2100).nullable().optional(),
  country: z.string().min(1).max(100),
  region: z.string().max(255).nullable().optional(),
  grapes: z.string().max(500).nullable().optional(),
  style: z.enum(["tinto", "branco", "rose", "espumante"]),
  imageUrl: z.string().nullable().optional(),
  referencePrice: z.string().nullable().optional(),
  subcriteria: subcriteriaSchema,
  costBenefit: z.number().int().min(1).max(5),
  shortComment: z.string().nullable().optional(),
  longComment: z.string().nullable().optional(),
  pairings: z.array(z.string()).nullable().optional(),
  occasions: z.array(z.string()).nullable().optional(),
  drinkNow: z.boolean().optional(),
  canAge: z.boolean().optional(),
});

// Recipe input schema
const recipeInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  prepTime: z.number().int().min(0),
  cookTime: z.number().int().min(0),
  difficulty: z.enum(["facil", "medio", "dificil"]),
  servings: z.number().int().min(1).optional(),
  category: z.string().min(1).max(100),
  mainIngredient: z.string().min(1).max(100),
  imageUrl: z.string().nullable().optional(),
  tips: z.string().nullable().optional(),
  pairingComment: z.string().nullable().optional(),
});

// Recipe filters schema
const recipeFiltersSchema = z.object({
  category: z.string().optional(),
  mainIngredient: z.string().optional(),
  difficulty: z.enum(["facil", "medio", "dificil"]).optional(),
  search: z.string().optional(),
});

// Purchase link input schema
const purchaseLinkInputSchema = z.object({
  wineId: z.number().int(),
  storeName: z.string().min(1).max(255),
  url: z.string().url(),
  price: z.string().nullable().optional(),
  observation: z.string().nullable().optional(),
});

// Filter schema
const wineFiltersSchema = z.object({
  style: z.enum(["tinto", "branco", "rose", "espumante"]).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  minCostBenefit: z.number().int().min(1).max(5).optional(),
  maxPrice: z.number().optional(),
  minPrice: z.number().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  grape: z.string().optional(),
  bestBuyOnly: z.boolean().optional(),
  search: z.string().optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Wine routes
  wines: router({
    // Public: List wines with filters
    list: publicProcedure
      .input(wineFiltersSchema.optional())
      .query(({ input }) => {
        return db.getWines(input);
      }),

    // Public: Get single wine with purchase links
    get: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ input }) => {
        return db.getWineWithLinks(input.id);
      }),

    // Public: Get unique countries
    countries: publicProcedure.query(() => {
      return db.getCountries();
    }),

    // Public: Get unique regions
    regions: publicProcedure.query(() => {
      return db.getRegions();
    }),

    // Protected: Create wine (admin only)
    create: protectedProcedure
      .input(wineInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        const id = await db.createWine({
          ...input,
          createdBy: ctx.user.id,
        });
        return { id };
      }),

    // Protected: Update wine (admin only)
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        data: wineInputSchema.partial(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.updateWine(input.id, input.data);
        return { success: true };
      }),

    // Protected: Delete wine (admin only)
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.deleteWine(input.id);
        return { success: true };
      }),
  }),

  // Purchase link routes
  purchaseLinks: router({
    // Public: Get links for a wine
    list: publicProcedure
      .input(z.object({ wineId: z.number().int() }))
      .query(({ input }) => {
        return db.getPurchaseLinks(input.wineId);
      }),

    // Protected: Create purchase link (admin only)
    create: protectedProcedure
      .input(purchaseLinkInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        const id = await db.createPurchaseLink(input);
        return { id };
      }),

    // Protected: Update purchase link (admin only)
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        data: purchaseLinkInputSchema.partial().omit({ wineId: true }),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.updatePurchaseLink(input.id, input.data);
        return { success: true };
      }),

    // Protected: Delete purchase link (admin only)
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.deletePurchaseLink(input.id);
        return { success: true };
      }),
  }),

  // Recipe routes
  recipes: router({
    // Public: List recipes with filters
    list: publicProcedure
      .input(recipeFiltersSchema.optional())
      .query(({ input }) => {
        return db.getRecipes(input);
      }),

    // Public: Get single recipe with recommended wines
    get: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ input }) => {
        return db.getRecipeWithWines(input.id);
      }),

    // Public: Get unique categories
    categories: publicProcedure.query(() => {
      return db.getRecipeCategories();
    }),

    // Protected: Create recipe (admin only)
    create: protectedProcedure
      .input(recipeInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        const id = await db.createRecipe({
          ...input,
          createdBy: ctx.user.id,
        });
        return { id };
      }),

    // Protected: Update recipe (admin only)
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        data: recipeInputSchema.partial(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.updateRecipe(input.id, input.data);
        return { success: true };
      }),

    // Protected: Delete recipe (admin only)
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.deleteRecipe(input.id);
        return { success: true };
      }),

    // Protected: Link wine to recipe (admin only)
    linkWine: protectedProcedure
      .input(z.object({
        recipeId: z.number().int(),
        wineId: z.number().int(),
        note: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        const id = await db.linkWineToRecipe(input);
        return { id };
      }),

    // Protected: Unlink wine from recipe (admin only)
    unlinkWine: protectedProcedure
      .input(z.object({
        recipeId: z.number().int(),
        wineId: z.number().int(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        await db.unlinkWineFromRecipe(input.recipeId, input.wineId);
        return { success: true };
      }),
  }),

  // Image upload route
  upload: router({
    // Protected: Upload image (admin only)
    image: protectedProcedure
      .input(z.object({
        base64: z.string(),
        filename: z.string(),
        contentType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required");
        }
        
        const { storagePut } = await import("./storage.js");
        
        // Decode base64 to buffer
        const buffer = Buffer.from(input.base64, "base64");
        
        // Generate unique filename
        const timestamp = Date.now();
        const ext = input.filename.split(".").pop() || "jpg";
        const key = `wine_curator/${timestamp}_${Math.random().toString(36).substring(7)}.${ext}`;
        
        // Upload to storage
        const result = await storagePut(key, buffer, input.contentType);
        
        return { url: result.url };
      }),
  }),

  // Harmonization routes
  harmonization: router({
    // Public: Get wines by pairing (ingredient/dish)
    byPairing: publicProcedure
      .input(z.object({ pairing: z.string() }))
      .query(({ input }) => {
        return db.getWinesByPairing(input.pairing);
      }),

    // Public: Get wines by occasion
    byOccasion: publicProcedure
      .input(z.object({ occasion: z.string() }))
      .query(({ input }) => {
        return db.getWinesByOccasion(input.occasion);
      }),
  }),
});

export type AppRouter = typeof appRouter;
