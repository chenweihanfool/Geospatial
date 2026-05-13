import { pgTable, text, serial, numeric, timestamp, geometry, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Survey point data schema for comprehensive point management - using existing Azure n_kc_ctl table
export const surveyPoints = pgTable("n_kc_ctl", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(), // Using existing integer primary key
  ptn: text("ptn").notNull(), // 點名
  realY: text("realy").notNull(), // 公告Y (actual column name: realy)
  realX: text("realx").notNull(), // 公告X (actual column name: realx)
  corsys: text("corsys").notNull(), // 座標系統 (0=67, 1=97)
  lv: text("lv").notNull(), // 階層 (0表示圖根)
  owner: text("owner").notNull(), // 上傳者
  catacode: text("catacode").notNull(), // 段代碼
  coord97Y: text("97y"), // 97Y (actual column name: 97y)
  coord97X: text("97x"), // 97X (actual column name: 97x)
  ps: text("ps"), // 備註
  state: text("state").default("?"), // 狀態 (?表示未知)
  geom: geometry("geom", { type: "point" }), // PostGIS geometry column
  timestamp: timestamp("timestamp").defaultNow(), // Using existing timestamp column
});

// Keep original coordinate data for backward compatibility
export const coordinateData = pgTable("kc_ct2", {
  id: serial("id").primaryKey(),
  code: text("code"),
  catacode: text("catacode").notNull(),
  state: text("state").notNull(),
  updatetime: timestamp("updatetime"),
  geom: geometry("geom", { type: "point" }),
  ps: text("ps"),
  y: numeric("y", { precision: 15, scale: 6 }),
  x: numeric("x", { precision: 15, scale: 6 }),
});

// Schema for database storage
export const insertCoordinateDataSchema = createInsertSchema(coordinateData).pick({
  code: true,
  catacode: true,
  state: true,
  ps: true,
  y: true,
  x: true,
}).extend({
  code: z.string().min(1, "請輸入點位代碼"),
  catacode: z.string().min(1, "請輸入段代碼"),
  state: z.string().default("0"),
  ps: z.string().optional(),
  y: z.string().min(1, "請輸入 Y 座標"),
  x: z.string().min(1, "請輸入 X 座標"),
});

// Schema for frontend form with coordinate system selection
export const insertCoordinateFormSchema = insertCoordinateDataSchema.extend({
  coordinateSystem: z.enum(["97", "67"], {
    required_error: "請選擇座標系統",
  }),
  originalY: z.string().optional(),
  originalX: z.string().optional(),
});

// Schema for batch upload from TXT file
export const batchUploadSchema = z.object({
  file: z.string().min(1, "檔案內容不能為空"),
  coordinateSystem: z.enum(["97", "67"]).default("67"),
  catacode: z.string().min(1, "請輸入段代碼"),
  code: z.string().min(1, "請輸入點位代碼"),
});

// Survey point schemas for new comprehensive system
export const insertSurveyPointSchema = createInsertSchema(surveyPoints).pick({
  ptn: true,
  realY: true,
  realX: true,
  corsys: true,
  lv: true,
  owner: true,
  catacode: true,
  coord97Y: true,
  coord97X: true,
  ps: true,
  state: true,
}).extend({
  ptn: z.string().min(1, "請輸入點名"),
  realY: z.string().min(1, "請輸入公告Y座標"),
  realX: z.string().min(1, "請輸入公告X座標"),
  corsys: z.enum(["1", "0"], { required_error: "請選擇座標系統" }),
  lv: z.string().regex(/^\d+$/, "階層必須是數字"),
  owner: z.string().min(1, "請輸入上傳者"),
  catacode: z.string().min(1, "請輸入段代碼"),
  coord97Y: z.string().optional(),
  coord97X: z.string().optional(),
  ps: z.string().optional(),
  state: z.string().default("?"),
});

// Survey point batch upload schema
export const surveyPointBatchUploadSchema = z.object({
  file: z.string().min(1, "檔案內容不能為空"),
  defaultOwner: z.string().min(1, "請輸入預設上傳者"),
});

export type InsertSurveyPoint = z.infer<typeof insertSurveyPointSchema>;
export type SurveyPointBatchUpload = z.infer<typeof surveyPointBatchUploadSchema>;
export type SurveyPoint = typeof surveyPoints.$inferSelect;

// Keep existing types for backward compatibility
export type InsertCoordinateData = z.infer<typeof insertCoordinateDataSchema>;
export type InsertCoordinateFormData = z.infer<typeof insertCoordinateFormSchema>;
export type BatchUploadData = z.infer<typeof batchUploadSchema>;
export type CoordinateData = typeof coordinateData.$inferSelect;

// Keep existing users table for compatibility
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Cadastral data tables - for land parcel (宗地) and boundary point (界址點) management
export const cadastralParcels = pgTable("kc_cada", {
  id: serial("id").primaryKey(),
  lotNo: text("lot_no").notNull(), // 宗地地號
  subNo: text("sub_no").notNull(), // 子號
  sectionCode: text("section_code"), // 段代碼
  area: numeric("area", { precision: 15, scale: 3 }), // 面積
  grade: text("grade"), // 等級
  attributes: text("attributes"), // 其他屬性
  centerY: numeric("center_y", { precision: 15, scale: 3 }), // 宗地中心Y座標
  centerX: numeric("center_x", { precision: 15, scale: 3 }), // 宗地中心X座標
  zone: text("zone"), // 分區
  pointCount: integer("point_count"), // 界址點數量
  boundaryPoints: text("boundary_points"), // 界址點編號序列（逗號分隔）
  geom: geometry("geom", { type: "polygon" }), // PostGIS polygon geometry
  createdAt: timestamp("created_at").defaultNow(),
});

export const boundaryPoints = pgTable("kc_pt", {
  id: serial("id").primaryKey(),
  pointNo: text("point_no").notNull().unique(), // 點編號（唯一）
  yCoord: numeric("y_coord", { precision: 15, scale: 3 }).notNull(), // Y座標
  xCoord: numeric("x_coord", { precision: 15, scale: 3 }).notNull(), // X座標
  type: text("type").default("未釘界"), // 類型，預設為未釘界
  geom: geometry("geom", { type: "point" }), // PostGIS point geometry
  createdAt: timestamp("created_at").defaultNow(),
});

// Cadastral parcel insert schema
export const insertCadastralParcelSchema = createInsertSchema(cadastralParcels).pick({
  lotNo: true,
  subNo: true,
  sectionCode: true,
  area: true,
  grade: true,
  attributes: true,
  centerY: true,
  centerX: true,
  zone: true,
  pointCount: true,
  boundaryPoints: true,
}).extend({
  lotNo: z.string().min(1, "請輸入宗地地號"),
  subNo: z.string().min(1, "請輸入子號"),
  sectionCode: z.string().optional(),
  area: z.string().optional(),
  grade: z.string().optional(),
  attributes: z.string().optional(),
  centerY: z.string().optional(),
  centerX: z.string().optional(),
  zone: z.string().optional(),
  pointCount: z.number().optional(),
  boundaryPoints: z.string().optional(),
});

// Boundary point insert schema
export const insertBoundaryPointSchema = createInsertSchema(boundaryPoints).pick({
  pointNo: true,
  yCoord: true,
  xCoord: true,
}).extend({
  pointNo: z.string().min(1, "請輸入點編號"),
  yCoord: z.string().min(1, "請輸入Y座標"),
  xCoord: z.string().min(1, "請輸入X座標"),
  coordinateSystem: z.enum(["TWD97", "TWD67"]).optional().default("TWD97"),
});

// Cadastral file upload schema
export const cadastralFileUploadSchema = z.object({
  bnpContent: z.string().min(1, "BNP檔案內容不能為空"),
  coaContent: z.string().min(1, "COA檔案內容不能為空"),
  parContent: z.string().min(1, "PAR檔案內容不能為空"),
  coordinateSystem: z.enum(["TWD97", "TWD67"]).optional().default("TWD97"),
});

// Types
export type CadastralParcel = typeof cadastralParcels.$inferSelect;
export type InsertCadastralParcel = z.infer<typeof insertCadastralParcelSchema>;
export type BoundaryPoint = typeof boundaryPoints.$inferSelect;
export type InsertBoundaryPoint = z.infer<typeof insertBoundaryPointSchema>;
export type CadastralFileUpload = z.infer<typeof cadastralFileUploadSchema>;

// Spatial range query schema
export const spatialRangeQuerySchema = z.object({
  centerY: z.string().min(1, "請輸入中心點Y座標"),
  centerX: z.string().min(1, "請輸入中心點X座標"),
  range: z.string().default("300"),
  catacode: z.string().min(1, "請輸入段代碼"),
});

export type SpatialRangeQuery = z.infer<typeof spatialRangeQuerySchema>;
