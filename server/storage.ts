import { users, coordinateData, surveyPoints, cadastralParcels, boundaryPoints, type User, type InsertUser, type CoordinateData, type InsertCoordinateData, type SurveyPoint, type InsertSurveyPoint, type CadastralParcel, type InsertCadastralParcel, type BoundaryPoint, type InsertBoundaryPoint } from "@shared/schema";
import { db, pool } from "./db";
import { eq, sql, desc, count } from "drizzle-orm";
import { Pool } from 'pg';
import { transformTWD67toTWD97 } from "./coordinateTransform";

// Remove the separate Azure pool since we're now using the main pool for Azure

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createCoordinateData(data: InsertCoordinateData, geomX?: number, geomY?: number): Promise<CoordinateData>;
  getCoordinateDataCount(): Promise<number>;
  getAllCoordinateData(): Promise<CoordinateData[]>;
  deleteCoordinateData(id: number): Promise<boolean>;
  batchCreateCoordinateData(dataArray: InsertCoordinateData[], geomCoords: Array<{geomX: number, geomY: number}>): Promise<CoordinateData[]>;
  
  // Survey point methods
  createSurveyPoint(data: InsertSurveyPoint): Promise<SurveyPoint>;
  getSurveyPointCount(): Promise<number>;
  getAllSurveyPoints(): Promise<SurveyPoint[]>;
  deleteSurveyPoint(id: number): Promise<boolean>;
  batchCreateSurveyPoints(dataArray: InsertSurveyPoint[]): Promise<SurveyPoint[]>;

  // Cadastral data methods
  createBoundaryPoint(data: InsertBoundaryPoint): Promise<BoundaryPoint>;
  createCadastralParcel(data: InsertCadastralParcel, polygonCoordinates: Array<{x: number, y: number}>): Promise<CadastralParcel>;
  getAllCadastralParcels(): Promise<CadastralParcel[]>;
  getAllBoundaryPoints(): Promise<BoundaryPoint[]>;
  batchCreateBoundaryPoints(dataArray: InsertBoundaryPoint[]): Promise<BoundaryPoint[]>;
  batchCreateCadastralParcels(dataArray: Array<{parcel: InsertCadastralParcel, polygonCoordinates: Array<{x: number, y: number}>}>): Promise<CadastralParcel[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createCoordinateData(data: InsertCoordinateData, geomX?: number, geomY?: number): Promise<CoordinateData> {
    // Use provided geometry coordinates or fall back to data coordinates
    const geometryX = geomX !== undefined ? geomX : parseFloat(data.x);
    const geometryY = geomY !== undefined ? geomY : parseFloat(data.y);
    
    const [coordinate] = await db
      .insert(coordinateData)
      .values({
        ...data,
        updatetime: sql`NOW() AT TIME ZONE 'Asia/Taipei'`,
        geom: sql`ST_MakePoint(${geometryX}, ${geometryY})`,
      })
      .returning();
    return coordinate;
  }

  async getCoordinateDataCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(coordinateData);
    return result.count;
  }

  async getAllCoordinateData(): Promise<CoordinateData[]> {
    const coordinates = await db.select().from(coordinateData).orderBy(coordinateData.updatetime);
    return coordinates;
  }

  async deleteCoordinateData(id: number): Promise<boolean> {
    const result = await db.delete(coordinateData).where(eq(coordinateData.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async batchCreateCoordinateData(dataArray: InsertCoordinateData[], geomCoords: Array<{geomX: number, geomY: number}>): Promise<CoordinateData[]> {
    const insertData = dataArray.map((data, index) => ({
      ...data,
      updatetime: sql`NOW() AT TIME ZONE 'Asia/Taipei'`,
      geom: sql`ST_MakePoint(${geomCoords[index].geomX}, ${geomCoords[index].geomY})`,
    }));

    const result = await db
      .insert(coordinateData)
      .values(insertData)
      .returning();
    
    return result;
  }

  // Survey point methods implementation - use raw SQL to avoid Drizzle ORM issues
  async createSurveyPoint(data: InsertSurveyPoint): Promise<SurveyPoint> {
    try {
      // Convert string coordinates to numbers for geometry
      const realY = parseFloat(data.realY);
      const realX = parseFloat(data.realX);
      const lv = parseInt(data.lv);
      
      // Calculate coord97 if not provided and coordinate system is 67
      let coord97Y = data.coord97Y ? parseFloat(data.coord97Y) : null;
      let coord97X = data.coord97X ? parseFloat(data.coord97X) : null;
      
      if (data.corsys === "1") {
        // Apply TWD67 to TWD97 transformation for 67 system
        const transformed = transformTWD67toTWD97(realY, realX);
        coord97X = transformed.x97;
        coord97Y = transformed.y97;
      } else if (data.corsys === "0") {
        // If coordinate system is 97, use real coordinates as 97 coordinates
        coord97X = coord97X || realX;
        coord97Y = coord97Y || realY;
      }
      
      // Direct insert without debugging - using correct column names
      
      // Use raw SQL to directly insert into Azure PostgreSQL - using correct column names
      const { getCurrentDbInfo } = await import("./db");
      const currentDb = getCurrentDbInfo();
      const tableName = currentDb.table || "public.n_kc_ctl";
      const schema = this.getTableSchema(tableName);
      
      let query: string;
      let values: any[];
      
      if (tableName.includes('kc_ct2')) {
        // Simplified insert for kc_ct2 table with only available columns
        query = `
          INSERT INTO ${tableName} (${schema.ptn}, ${schema.realY}, ${schema.realX}, ${schema.catacode}, ${schema.ps}, ${schema.state}, ${schema.geom}, ${schema.timestamp})
          VALUES ($1, $2, $3, $4, $5, $6, ST_MakePoint($7, $8), NOW() AT TIME ZONE 'Asia/Taipei')
          RETURNING *
        `;
        
        values = [
          data.ptn,
          parseFloat(data.realY).toFixed(3),
          parseFloat(data.realX).toFixed(3),
          data.catacode,
          data.ps || null,
          data.state || "?",
          parseFloat((coord97X || realX).toString()).toFixed(3),
          parseFloat((coord97Y || realY).toString()).toFixed(3)
        ];
      } else {
        // Original insert for n_kc_ctl and kd_ctl tables
        query = `
          INSERT INTO ${tableName} (${schema.ptn}, ${schema.realY}, ${schema.realX}, ${schema.corsys}, ${schema.lv}, ${schema.owner}, ${schema.catacode}, ${schema.coord97Y}, ${schema.coord97X}, ${schema.ps}, ${schema.state}, ${schema.geom}, ${schema.timestamp}, ${schema.ispic})
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ST_MakePoint($12, $13), NOW() AT TIME ZONE 'Asia/Taipei', $14)
          RETURNING *
        `;
        
        values = [
          data.ptn,
          parseFloat(data.realY).toFixed(3),
          parseFloat(data.realX).toFixed(3),
          data.corsys,
          lv.toString(),
          data.owner,
          data.catacode,
          coord97Y ? parseFloat(coord97Y.toString()).toFixed(3) : null,
          coord97X ? parseFloat(coord97X.toString()).toFixed(3) : null,
          data.ps || null,
          data.state || "?",
          coord97X || realX,
          coord97Y || realY,
          false
        ];
      }
      
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error("Error in createSurveyPoint:", error);
      throw error;
    }
  }

  async getSurveyPointCount(): Promise<number> {
    try {
      const { getCurrentDbInfo } = await import("./db");
      const currentDb = getCurrentDbInfo();
      const tableName = currentDb.table || "public.n_kc_ctl";
      const result = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error("Error in getSurveyPointCount:", error);
      return 0;
    }
  }

  async getAllSurveyPoints(): Promise<SurveyPoint[]> {
    try {
      const { getCurrentDbInfo } = await import("./db");
      const currentDb = getCurrentDbInfo();
      const tableName = currentDb.table || "public.n_kc_ctl";
      const schema = this.getTableSchema(tableName);
      const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY ${schema.timestamp} DESC`);
      return result.rows;
    } catch (error) {
      console.error("Error in getAllSurveyPoints:", error);
      return [];
    }
  }

  async deleteSurveyPoint(id: number): Promise<boolean> {
    try {
      const { getCurrentDbInfo } = await import("./db");
      const currentDb = getCurrentDbInfo();
      const tableName = currentDb.table || "public.n_kc_ctl";
      const result = await pool.query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING id`, [id]);
      return result.rows.length > 0;
    } catch (error) {
      console.error("Error in deleteSurveyPoint:", error);
      return false;
    }
  }

  async batchCreateSurveyPoints(dataArray: InsertSurveyPoint[]): Promise<SurveyPoint[]> {
    const surveyPointPromises = dataArray.map(data => this.createSurveyPoint(data));
    return Promise.all(surveyPointPromises);
  }

  // Cadastral data methods implementation using Drizzle ORM
  async createBoundaryPoint(data: InsertBoundaryPoint): Promise<BoundaryPoint> {
    // Store original coordinates in attributes (no rounding to preserve exact values)
    const yCoord = data.yCoord;
    const xCoord = data.xCoord;
    
    // Determine geometry coordinates based on coordinate system
    let geomX = parseFloat(data.xCoord);
    let geomY = parseFloat(data.yCoord);
    
    if (data.coordinateSystem === "TWD67") {
      // Transform to TWD97 for geometry only
      const transformed = transformTWD67toTWD97(geomY, geomX);
      geomX = transformed.x97;
      geomY = transformed.y97;
    }
    
    const [point] = await db
      .insert(boundaryPoints)
      .values({
        pointNo: data.pointNo,
        yCoord: yCoord,  // Store original coordinates exactly as provided
        xCoord: xCoord,  // Store original coordinates exactly as provided
        type: '未釘界',  // Set default type value
        geom: sql`ST_SetSRID(ST_MakePoint(${geomX}, ${geomY}), 3826)`,  // Use transformed coords for geometry
        createdAt: sql`NOW()`
      })
      .onConflictDoUpdate({
        target: boundaryPoints.pointNo,
        set: {
          yCoord: yCoord,  // Update with original coordinates
          xCoord: xCoord,  // Update with original coordinates
          type: '未釘界',  // Update type value
          geom: sql`ST_SetSRID(ST_MakePoint(${geomX}, ${geomY}), 3826)`,  // Update geometry with transformed coords
        }
      })
      .returning({
        id: boundaryPoints.id,
        pointNo: boundaryPoints.pointNo,
        yCoord: boundaryPoints.yCoord,
        xCoord: boundaryPoints.xCoord,
        type: boundaryPoints.type,
        createdAt: boundaryPoints.createdAt
        // Exclude geom to avoid parsing error
      });
    return point as BoundaryPoint;
  }

  async createCadastralParcel(data: InsertCadastralParcel, polygonCoordinates: Array<{x: number, y: number}>): Promise<CadastralParcel> {
    // Build polygon WKT
    const polygonPoints = polygonCoordinates.map(p => `${p.x} ${p.y}`);
    // Close the polygon
    if (polygonPoints.length > 0) {
      polygonPoints.push(polygonPoints[0]);
    }
    const polygonWKT = polygonPoints.length > 0 ? `POLYGON((${polygonPoints.join(', ')}))` : null;

    const [parcel] = await db
      .insert(cadastralParcels)
      .values({
        lotNo: data.lotNo,
        subNo: data.subNo,
        sectionCode: data.sectionCode || null,
        area: data.area || null,
        grade: data.grade || null,
        attributes: data.attributes || null,
        centerY: data.centerY || null,
        centerX: data.centerX || null,
        zone: data.zone || null,
        pointCount: data.pointCount || null,
        boundaryPoints: data.boundaryPoints || null,
        geom: polygonWKT ? sql`ST_GeomFromText(${polygonWKT}, 3826)` : null,
        createdAt: sql`NOW()`
      })
      .returning({
        id: cadastralParcels.id,
        lotNo: cadastralParcels.lotNo,
        subNo: cadastralParcels.subNo,
        sectionCode: cadastralParcels.sectionCode,
        area: cadastralParcels.area,
        grade: cadastralParcels.grade,
        attributes: cadastralParcels.attributes,
        centerY: cadastralParcels.centerY,
        centerX: cadastralParcels.centerX,
        zone: cadastralParcels.zone,
        pointCount: cadastralParcels.pointCount,
        boundaryPoints: cadastralParcels.boundaryPoints,
        createdAt: cadastralParcels.createdAt
        // Exclude geom to avoid parsing error
      });
    return parcel as CadastralParcel;
  }

  async getAllCadastralParcels(): Promise<CadastralParcel[]> {
    const parcels = await db
      .select({
        id: cadastralParcels.id,
        lotNo: cadastralParcels.lotNo,
        subNo: cadastralParcels.subNo,
        sectionCode: cadastralParcels.sectionCode,
        area: cadastralParcels.area,
        grade: cadastralParcels.grade,
        attributes: cadastralParcels.attributes,
        centerY: cadastralParcels.centerY,
        centerX: cadastralParcels.centerX,
        zone: cadastralParcels.zone,
        pointCount: cadastralParcels.pointCount,
        boundaryPoints: cadastralParcels.boundaryPoints,
        createdAt: cadastralParcels.createdAt
        // Exclude geom to avoid parsing error
      })
      .from(cadastralParcels)
      .orderBy(desc(cadastralParcels.createdAt));
    return parcels as CadastralParcel[];
  }

  async getAllBoundaryPoints(): Promise<BoundaryPoint[]> {
    const points = await db
      .select({
        id: boundaryPoints.id,
        pointNo: boundaryPoints.pointNo,
        yCoord: boundaryPoints.yCoord,
        xCoord: boundaryPoints.xCoord,
        createdAt: boundaryPoints.createdAt
        // Exclude geom to avoid parsing error
      })
      .from(boundaryPoints)
      .orderBy(desc(boundaryPoints.createdAt));
    return points as BoundaryPoint[];
  }

  async batchCreateBoundaryPoints(dataArray: InsertBoundaryPoint[]): Promise<BoundaryPoint[]> {
    const results: BoundaryPoint[] = [];
    for (const data of dataArray) {
      try {
        const point = await this.createBoundaryPoint(data);
        if (point) {
          results.push(point);
        }
      } catch (error) {
        console.error(`Error inserting boundary point ${data.pointNo}:`, error);
      }
    }
    return results;
  }

  async batchCreateCadastralParcels(dataArray: Array<{parcel: InsertCadastralParcel, polygonCoordinates: Array<{x: number, y: number}>}>): Promise<CadastralParcel[]> {
    const results: CadastralParcel[] = [];
    for (const item of dataArray) {
      try {
        const parcel = await this.createCadastralParcel(item.parcel, item.polygonCoordinates);
        if (parcel) {
          results.push(parcel);
        }
      } catch (error) {
        console.error(`Error inserting parcel ${item.parcel.lotNo}-${item.parcel.subNo}:`, error);
      }
    }
    return results;
  }

  // Table schema mapping for different table structures
  private getTableSchema(tableName: string) {
    // Default schema for n_kc_ctl table
    const n_kc_ctl_schema = {
      ptn: 'ptn',
      realY: 'realy',
      realX: 'realx',
      corsys: 'corsys',
      lv: 'lv',
      owner: 'owner',
      catacode: 'catacode',
      coord97Y: '"97y"',
      coord97X: '"97x"',
      ps: 'ps',
      state: 'state',
      geom: 'geom',
      timestamp: 'timestamp',
      ispic: 'ispic'
    };

    // Schema for kd_ctl table (different column names)
    const kd_ctl_schema = {
      ptn: 'ptn',
      realY: '"realY"',
      realX: '"realX"',
      corsys: 'corsys',
      lv: 'lv',
      owner: 'owner',
      catacode: 'catacode',
      coord97Y: '"97y"',
      coord97X: '"97x"',
      ps: 'ps',
      state: 'state',
      geom: 'geom',
      timestamp: 'time',
      ispic: '"isPic"'
    };

    // Schema for kc_ct2 table (coordinate table with different structure)
    const kc_ct2_schema = {
      ptn: 'code',        // 點位代碼使用 code 欄位
      realY: 'y',         // Y 座標使用 y 欄位
      realX: 'x',         // X 座標使用 x 欄位
      corsys: 'corsys',   // 座標系統（這個欄位可能不存在，需要處理）
      lv: 'lv',          // 階層（可能不存在）
      owner: 'owner',     // 上傳者（可能不存在）
      catacode: 'catacode', // 段代碼
      coord97Y: '"97y"',  // 97Y座標（可能不存在）
      coord97X: '"97x"',  // 97X座標（可能不存在）
      ps: 'ps',          // 備註
      state: 'state',    // 狀態
      geom: 'geom',      // 幾何欄位
      timestamp: 'updatetime', // 時間戳記使用 updatetime
      ispic: 'ispic'     // 圖片標記（可能不存在）
    };

    // Return appropriate schema based on table name
    if (tableName.includes('kd_ctl')) {
      return kd_ctl_schema;
    } else if (tableName.includes('kc_ct2')) {
      return kc_ct2_schema;
    } else {
      return n_kc_ctl_schema;
    }
  }
}

export const storage = new DatabaseStorage();
