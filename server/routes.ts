import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { pool, switchDatabase, getCurrentDbInfo, type DatabaseConnection } from "./db";
import { insertCoordinateDataSchema, insertSurveyPointSchema, surveyPointBatchUploadSchema, cadastralFileUploadSchema } from "@shared/schema";
import type { InsertSurveyPoint, SurveyPointBatchUpload, CadastralFileUpload } from "@shared/schema";
import { z } from "zod";
import { parseCadastralFiles, type ParsedCadastralData } from "./cadastralParser";
import { generateShpFromCadastralData } from "./shpGenerator";
import { transformTWD67toTWD97, transformCoordinates } from "./coordinateTransform";
import * as fs from "fs";
import * as path from "path";

const BACKUP_DIR = path.join(process.cwd(), "backups");
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Get coordinate data count
  app.get("/api/coordinates/count", async (req, res) => {
    try {
      const count = await storage.getCoordinateDataCount();
      res.json({ count });
    } catch (error) {
      console.error("Error getting coordinate count:", error);
      res.status(500).json({ 
        message: "無法取得座標資料統計",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Get all coordinate data
  app.get("/api/coordinates", async (req, res) => {
    try {
      const coordinates = await storage.getAllCoordinateData();
      res.json({ data: coordinates });
    } catch (error) {
      console.error("Error getting coordinate data:", error);
      res.status(500).json({ 
        message: "無法取得座標資料",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Delete coordinate data by ID
  app.delete("/api/coordinates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ 
          message: "無效的ID格式" 
        });
      }

      const deleted = await storage.deleteCoordinateData(id);
      if (deleted) {
        res.json({ 
          message: "座標資料已成功刪除",
          id: id
        });
      } else {
        res.status(404).json({ 
          message: "找不到指定的座標資料" 
        });
      }
    } catch (error) {
      console.error("Error deleting coordinate data:", error);
      res.status(500).json({ 
        message: "無法刪除座標資料",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Create coordinate data
  app.post("/api/coordinates", async (req, res) => {
    try {
      // Import the form schema for validation
      const { insertCoordinateFormSchema } = await import("@shared/schema");
      const validatedData = insertCoordinateFormSchema.parse(req.body);
      
      // Extract coordinate system and coordinates
      const { coordinateSystem, originalX, originalY, x, y, ...dataToStore } = validatedData;
      
      const inputX = parseFloat(x);
      const inputY = parseFloat(y);
      
      let geomX = inputX;  // X coordinate for geometry column
      let geomY = inputY;  // Y coordinate for geometry column
      let transformInfo = null;
      
      // If coordinate system is TWD67, transform to TWD97 for geometry only
      if (coordinateSystem === "67") {
        // Transform to 97 coordinates for geometry
        // Note: transformTWD67toTWD97 expects (Y, X) order
        const transformed = transformTWD67toTWD97(inputY, inputX);
        geomX = transformed.x97;
        geomY = transformed.y97;
        
        transformInfo = {
          original: { x: inputX, y: inputY },
          converted: { x: geomX, y: geomY }
        };
      }
      
      // Prepare data for storage
      // X,Y fields store original user input
      // geom field will use transformed coordinates (if needed)
      const coordinateData = {
        ...dataToStore,
        x: x,  // Store original input as string
        y: y,  // Store original input as string
        ps: dataToStore.ps || (coordinateSystem === "67" ? 
          `TWD67轉換->TWD97: (${geomX.toFixed(6)},${geomY.toFixed(6)})` : 
          `TWD97座標: (${inputX.toFixed(6)},${inputY.toFixed(6)})`)
      };
      
      const coordinate = await storage.createCoordinateData(coordinateData, geomX, geomY);
      res.status(201).json({ 
        message: "座標資料已成功寫入資料庫",
        data: coordinate,
        transformation: transformInfo
      });
    } catch (error) {
      console.error("Error creating coordinate data:", error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          message: "資料格式錯誤",
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      } else {
        res.status(500).json({ 
          message: "無法寫入座標資料",
          error: error instanceof Error ? error.message : "未知錯誤"
        });
      }
    }
  });

  // Batch upload coordinate data
  app.post("/api/coordinates/batch", async (req, res) => {
    try {
      const { batchUploadSchema } = await import("@shared/schema");
      const validatedData = batchUploadSchema.parse(req.body);
      
      const { file, coordinateSystem, catacode, code } = validatedData;
      const lines = file.trim().split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        return res.status(400).json({ 
          message: "檔案內容為空或格式錯誤" 
        });
      }
      
      const processedData: any[] = [];
      const geomCoords: Array<{geomX: number, geomY: number}> = [];
      const errors: string[] = [];
      
      // Parse each line: Y座標,X座標,備註
      lines.forEach((line, index) => {
        try {
          const parts = line.split(',').map(part => part.trim());
          if (parts.length < 2 || parts.length > 3) {
            errors.push(`第 ${index + 1} 行：格式錯誤，應為 2-3 個欄位 (Y座標,X座標,備註)`);
            return;
          }
          
          const [yStr, xStr, ps = ""] = parts;
          const inputY = parseFloat(yStr);  // Y coordinate (first coordinate)
          const inputX = parseFloat(xStr);  // X coordinate (second coordinate)
          
          if (isNaN(inputX) || isNaN(inputY)) {
            errors.push(`第 ${index + 1} 行：座標格式錯誤`);
            return;
          }
          
          let geomX = inputX;
          let geomY = inputY;
          
          // Apply coordinate transformation if needed
          if (coordinateSystem === "67") {
            // Note: transformTWD67toTWD97 expects (Y, X) order
            const transformed = transformTWD67toTWD97(inputY, inputX);
            geomX = transformed.x97;
            geomY = transformed.y97;
          }
          
          processedData.push({
            code: code,
            catacode: catacode,
            state: "0",
            ps: ps || (coordinateSystem === "67" ? 
              `TWD67轉換->TWD97: (${geomX.toFixed(6)},${geomY.toFixed(6)})` : 
              `TWD97座標: (${inputX.toFixed(6)},${inputY.toFixed(6)})`),
            x: inputX.toString(),  // Store original X coordinate
            y: inputY.toString(),  // Store original Y coordinate
          });
          
          geomCoords.push({ geomX, geomY });
          
        } catch (error) {
          errors.push(`第 ${index + 1} 行：解析錯誤 - ${error instanceof Error ? error.message : "未知錯誤"}`);
        }
      });
      
      if (errors.length > 0) {
        return res.status(400).json({ 
          message: "檔案解析錯誤",
          errors: errors 
        });
      }
      
      if (processedData.length === 0) {
        return res.status(400).json({ 
          message: "沒有有效的資料可以處理" 
        });
      }
      
      // Batch insert to database
      const result = await storage.batchCreateCoordinateData(processedData, geomCoords);
      
      res.status(201).json({
        message: `成功批次寫入 ${result.length} 筆座標資料`,
        count: result.length,
        data: result,
        coordinateSystem: coordinateSystem
      });
      
    } catch (error) {
      console.error("Error in batch upload:", error);
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ 
          message: "資料驗證失敗",
          error: error.message 
        });
      } else {
        res.status(500).json({ 
          message: "無法批次寫入座標資料",
          error: error instanceof Error ? error.message : "未知錯誤"
        });
      }
    }
  });

  // Database status check
  app.get("/api/status", async (req, res) => {
    try {
      const count = await storage.getCoordinateDataCount();
      res.json({ 
        database: "connected",
        postgis: "enabled",
        count 
      });
    } catch (error) {
      console.error("Error checking database status:", error);
      res.status(500).json({ 
        database: "error",
        postgis: "unknown",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Get current database connection info
  app.get("/api/database/info", async (req, res) => {
    try {
      const dbInfo = getCurrentDbInfo();
      res.json(dbInfo);
    } catch (error) {
      console.error("Error getting database info:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Switch database connection
  app.post("/api/database/switch", async (req, res) => {
    try {
      const { host, port, database, username, password, table } = req.body;
      
      if (!host || !port || !database || !username || !password || !table) {
        return res.status(400).json({ 
          message: "請提供完整的資料庫連線資訊" 
        });
      }

      const dbInfo: DatabaseConnection = {
        host,
        port: parseInt(port),
        database,
        username,
        password,
        table
      };

      const result = await switchDatabase(dbInfo);
      
      if (result.success) {
        res.json({ 
          message: result.message,
          dbInfo: getCurrentDbInfo()
        });
      } else {
        res.status(500).json({ 
          message: result.message,
          error: result.error
        });
      }
    } catch (error) {
      console.error("Error switching database:", error);
      res.status(500).json({ 
        message: "資料庫切換失敗",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Test database connection and table structure
  app.get("/api/test-db", async (req, res) => {
    try {
      const dbResult = await pool.query('SELECT current_database()');
      const tableResult = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'n_kc_ctl'");
      const columnResult = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'n_kc_ctl' ORDER BY ordinal_position");
      
      res.json({
        database: dbResult.rows[0].current_database,
        tableExists: tableResult.rows.length > 0,
        columns: columnResult.rows.map(r => r.column_name)
      });
    } catch (error) {
      console.error("Error testing database:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Survey Point APIs
  // Get survey point count - direct SQL implementation
  app.get("/api/survey-points/count", async (req, res) => {
    try {
      const currentDb = getCurrentDbInfo();
      const tableName = currentDb.table || "public.n_kc_ctl";
      const result = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
      const count = parseInt(result.rows[0].count);
      res.json({ count });
    } catch (error) {
      console.error("Error getting survey point count:", error);
      res.status(500).json({ 
        message: "無法取得測點資料統計",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Get all survey points - direct SQL implementation
  app.get("/api/survey-points", async (req, res) => {
    try {
      const currentDb = getCurrentDbInfo();
      const tableName = currentDb.table || "public.n_kc_ctl";
      
      // Get appropriate timestamp field name based on table
      let timestampField = "timestamp";
      if (tableName.includes('kc_ct2')) {
        timestampField = "updatetime";
      } else if (tableName.includes('kd_ctl')) {
        timestampField = "time";
      }
      
      const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY ${timestampField} DESC`);
      res.json({ data: result.rows });
    } catch (error) {
      console.error("Error getting survey points:", error);
      res.status(500).json({ 
        message: "無法取得測點資料",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Create single survey point - direct SQL implementation
  app.post("/api/survey-points", async (req, res) => {
    try {
      const result = insertSurveyPointSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "資料驗證失敗",
          error: result.error.issues.map(issue => issue.message).join(", ")
        });
      }

      const validatedData = result.data;
      
      // Calculate coordinate transformation
      const realY = parseFloat(validatedData.realY);
      const realX = parseFloat(validatedData.realX);
      const lv = parseInt(validatedData.lv);
      
      let coord97Y = validatedData.coord97Y ? parseFloat(validatedData.coord97Y) : null;
      let coord97X = validatedData.coord97X ? parseFloat(validatedData.coord97X) : null;
      
      if (validatedData.corsys === "0" && (!coord97Y || !coord97X)) {
        // Note: transformTWD67toTWD97 expects (Y, X) order
        const transformed = transformTWD67toTWD97(realY, realX);
        coord97X = transformed.x97;
        coord97Y = transformed.y97;
      } else if (validatedData.corsys === "1") {
        coord97X = coord97X || realX;
        coord97Y = coord97Y || realY;
      }
      
      // Direct SQL insert to Azure PostgreSQL - using correct column names
      const currentDb = getCurrentDbInfo();
      const tableName = currentDb.table || "public.n_kc_ctl";
      
      // Get table schema mapping
      const getTableSchema = (tableName: string) => {
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
          ptn: 'code',
          realY: 'y',
          realX: 'x',
          corsys: 'corsys',
          lv: 'lv',
          owner: 'owner',
          catacode: 'catacode',
          coord97Y: '"97y"',
          coord97X: '"97x"',
          ps: 'ps',
          state: 'state',
          geom: 'geom',
          timestamp: 'updatetime',
          ispic: 'ispic'
        };

        // Return appropriate schema based on table name
        if (tableName.includes('kd_ctl')) {
          return kd_ctl_schema;
        } else if (tableName.includes('kc_ct2')) {
          return kc_ct2_schema;
        } else {
          return n_kc_ctl_schema;
        }
      };

      const schema = getTableSchema(tableName);
      let query: string;
      let values: any[];
      
      if (tableName.includes('kc_ct2')) {
        // Simplified insert for kc_ct2 table
        query = `
          INSERT INTO ${tableName} (${schema.ptn}, ${schema.realY}, ${schema.realX}, ${schema.catacode}, ${schema.ps}, ${schema.state}, ${schema.geom}, ${schema.timestamp})
          VALUES ($1, $2, $3, $4, $5, $6, ST_MakePoint($7, $8), NOW() AT TIME ZONE 'Asia/Taipei')
          RETURNING *
        `;
        
        values = [
          validatedData.ptn,
          parseFloat(validatedData.realY).toFixed(3),
          parseFloat(validatedData.realX).toFixed(3),
          validatedData.catacode,
          validatedData.ps || null,
          validatedData.state || "?",
          coord97X || realX,
          coord97Y || realY
        ];
      } else {
        // Original insert for n_kc_ctl and kd_ctl tables
        query = `
          INSERT INTO ${tableName} (${schema.ptn}, ${schema.realY}, ${schema.realX}, ${schema.corsys}, ${schema.lv}, ${schema.owner}, ${schema.catacode}, ${schema.coord97Y}, ${schema.coord97X}, ${schema.ps}, ${schema.state}, ${schema.geom}, ${schema.timestamp}, ${schema.ispic})
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ST_MakePoint($12, $13), NOW() AT TIME ZONE 'Asia/Taipei', $14)
          RETURNING *
        `;
        
        values = [
          validatedData.ptn,
          parseFloat(validatedData.realY).toFixed(3),
          parseFloat(validatedData.realX).toFixed(3),
          validatedData.corsys,
          lv.toString(),
          validatedData.owner,
          validatedData.catacode,
          coord97Y ? parseFloat(coord97Y.toString()).toFixed(3) : null,
          coord97X ? parseFloat(coord97X.toString()).toFixed(3) : null,
          validatedData.ps || null,
          validatedData.state || "?",
          coord97X || realX,
          coord97Y || realY,
          false
        ];
      }
      
      const dbResult = await pool.query(query, values);
      res.status(201).json({
        message: "成功新增測點資料",
        data: dbResult.rows[0]
      });
    } catch (error) {
      console.error("Error creating survey point:", error);
      res.status(500).json({ 
        message: "無法新增測點資料",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Delete survey point by ID - direct SQL implementation
  app.delete("/api/survey-points/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ 
          message: "無效的測點ID" 
        });
      }

      const currentDb = getCurrentDbInfo();
      const tableName = currentDb.table || "public.n_kc_ctl";
      const result = await pool.query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING id`, [id]);
      if (result.rows.length > 0) {
        res.json({ 
          message: "成功刪除測點資料",
          success: true 
        });
      } else {
        res.status(404).json({ 
          message: "找不到指定的測點資料" 
        });
      }
    } catch (error) {
      console.error("Error deleting survey point:", error);
      res.status(500).json({ 
        message: "無法刪除測點資料",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Batch upload survey points
  app.post("/api/survey-points/batch", async (req, res) => {
    try {
      const result = surveyPointBatchUploadSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "資料驗證失敗",
          error: result.error.issues.map(issue => issue.message).join(", ")
        });
      }

      const { file, defaultOwner } = result.data;
      const lines = file.trim().split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        return res.status(400).json({ 
          message: "檔案內容為空" 
        });
      }

      const processedData: InsertSurveyPoint[] = [];
      const errors: string[] = [];

      lines.forEach((line, index) => {
        try {
          const parts = line.split(/\s+/);
          
          if (parts.length < 8) {
            errors.push(`第 ${index + 1} 行：欄位不足，需要至少 8 個欄位（點名 公告Y 公告X 座標系統 階層 段代碼 備註 狀態）`);
            return;
          }

          const [ptn, realY, realX, corsys, lv, catacode, ps, state] = parts;
          
          // Validate coordinates
          if (isNaN(parseFloat(realY)) || isNaN(parseFloat(realX))) {
            errors.push(`第 ${index + 1} 行：座標格式錯誤`);
            return;
          }

          // Validate level
          if (isNaN(parseInt(lv))) {
            errors.push(`第 ${index + 1} 行：階層格式錯誤`);
            return;
          }

          // Validate coordinate system (0=97系統, 1=67系統)
          if (corsys !== "1" && corsys !== "0") {
            errors.push(`第 ${index + 1} 行：座標系統必須是 1（67系統）或 0（97系統）`);
            return;
          }

          // 根據座標系統計算 97Y 和 97X
          let coord97Y: string | undefined;
          let coord97X: string | undefined;
          
          if (corsys === "0") {
            // 座標系統為 0 表示 97 系統，直接使用公告座標並確保精度
            coord97Y = parseFloat(realY).toFixed(3);
            coord97X = parseFloat(realX).toFixed(3);
          } else if (corsys === "1") {
            // 座標系統為 1 表示 67 系統，需要進行 67 to 97 轉換
            const realYNum = parseFloat(realY);
            const realXNum = parseFloat(realX);
            
            // TWD67 to TWD97 transformation
            const dx = 828.0;
            const dy = -204.0;
            
            const transformed97X = realXNum + dx;
            const transformed97Y = realYNum + dy;
            
            coord97Y = transformed97Y.toFixed(3);
            coord97X = transformed97X.toFixed(3);
          }

          const surveyPointData: InsertSurveyPoint = {
            ptn: ptn || `POINT_${Date.now()}_${index}`,
            realY: parseFloat(realY).toFixed(3),
            realX: parseFloat(realX).toFixed(3),
            corsys: corsys as "1" | "0",
            lv: lv,
            owner: defaultOwner, // 使用頁面輸入的上傳者
            catacode: catacode || "UNKNOWN",
            coord97Y: coord97Y,
            coord97X: coord97X,
            ps: ps || "批次匯入",
            state: state || "?",
          };

          processedData.push(surveyPointData);
          
        } catch (error) {
          errors.push(`第 ${index + 1} 行：解析錯誤 - ${error instanceof Error ? error.message : "未知錯誤"}`);
        }
      });

      if (errors.length > 0) {
        return res.status(400).json({ 
          message: "檔案解析錯誤",
          errors: errors 
        });
      }

      if (processedData.length === 0) {
        return res.status(400).json({ 
          message: "沒有有效的資料可以處理" 
        });
      }

      // Batch insert to database
      const insertResult = await storage.batchCreateSurveyPoints(processedData);
      
      res.status(201).json({
        message: `成功批次寫入 ${insertResult.length} 筆測點資料`,
        count: insertResult.length,
        data: insertResult
      });
      
    } catch (error) {
      console.error("Error in survey point batch upload:", error);
      res.status(500).json({ 
        message: "無法批次寫入測點資料",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // ====== Cadastral Data Processing Endpoints ======
  
  // Parse cadastral files (BNP, COA, PAR) - server-side parsing for validation
  app.post("/api/cadastral/parse", async (req, res) => {
    try {
      const validatedData = cadastralFileUploadSchema.parse(req.body);
      
      // Server-side parsing ensures data integrity
      const parsedData = parseCadastralFiles(
        validatedData.bnpContent,
        validatedData.coaContent,
        validatedData.parContent
      );

      res.json({
        message: "檔案解析成功",
        data: parsedData
      });
    } catch (error) {
      console.error("Error parsing cadastral files:", error);
      res.status(500).json({
        message: "檔案解析失敗",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Save selected parcels and boundary points to database
  // Server re-parses files to prevent client data tampering
  app.post("/api/cadastral/save", async (req, res) => {
    try {
      const { selectedLots, bnpContent, coaContent, parContent, coordinateSystem = "TWD97" } = req.body;
      
      if (!selectedLots || !Array.isArray(selectedLots) || selectedLots.length === 0) {
        return res.status(400).json({
          message: "請選擇至少一個宗地"
        });
      }

      // Validate file contents
      const fileData = cadastralFileUploadSchema.parse({
        bnpContent,
        coaContent,
        parContent,
        coordinateSystem
      });

      // Server-side parsing - don't trust client data
      const parsedData = parseCadastralFiles(
        fileData.bnpContent,
        fileData.coaContent,
        fileData.parContent
      );

      const { parcels, coaRecords } = parsedData;
      
      // Filter selected parcels
      const selectedParcels = parcels.filter(p => 
        selectedLots.some((lot: any) => 
          lot.lotNo === p.lotNo && lot.subNo === p.subNo
        )
      );

      // Collect all boundary point numbers from selected parcels
      const allBoundaryPointNos = new Set<string>();
      selectedParcels.forEach(p => {
        if (p.boundaryPoints) {
          p.boundaryPoints.split(',').forEach(no => allBoundaryPointNos.add(no.trim()));
        }
      });

      // Filter boundary points
      const selectedBoundaryPoints = coaRecords.filter(coa => 
        allBoundaryPointNos.has(coa.pointNo)
      );

      // Insert boundary points using storage interface
      // Store original coordinates in attributes, transform for geometry only
      const boundaryPointData = selectedBoundaryPoints.map(point => ({
        pointNo: point.pointNo,
        yCoord: point.yCoord,  // Store original coordinates in attributes
        xCoord: point.xCoord,  // Store original coordinates in attributes
        coordinateSystem: coordinateSystem as "TWD97" | "TWD67"
      }));
      
      const insertedPoints = await storage.batchCreateBoundaryPoints(boundaryPointData);

      // Prepare parcel data with polygon coordinates
      const parcelDataArray = selectedParcels.map(parcel => {
        const boundaryPointNos = parcel.boundaryPoints ? parcel.boundaryPoints.split(',').map(n => n.trim()) : [];
        const polygonCoordinates = boundaryPointNos
          .map(pointNo => {
            const point = coaRecords.find(c => c.pointNo === pointNo);
            if (!point) return null;
            
            let x = parseFloat(point.xCoord);
            let y = parseFloat(point.yCoord);
            
            // Transform to TWD97 for geometry if coordinate system is TWD67
            if (coordinateSystem === "TWD67") {
              const transformed = transformTWD67toTWD97(y, x);
              x = transformed.x97;
              y = transformed.y97;
            }
            
            return { x, y };
          })
          .filter(p => p !== null) as Array<{x: number, y: number}>;

        return {
          parcel: {
            lotNo: parcel.lotNo,
            subNo: parcel.subNo,
            sectionCode: parcel.sectionCode,
            area: parcel.area,
            grade: parcel.grade,
            attributes: parcel.attributes,
            centerY: parcel.centerY,
            centerX: parcel.centerX,
            zone: parcel.zone,
            pointCount: parcel.pointCount,
            boundaryPoints: parcel.boundaryPoints
          },
          polygonCoordinates
        };
      });

      // Insert parcels using storage interface
      const insertedParcels = await storage.batchCreateCadastralParcels(parcelDataArray);

      res.json({
        message: `成功儲存 ${insertedParcels.length} 筆宗地資料和 ${insertedPoints.length} 筆界址點資料`,
        parcels: insertedParcels.map(p => `${p.lotNo}-${p.subNo}`),
        boundaryPoints: insertedPoints.map(p => p.pointNo)
      });

    } catch (error) {
      console.error("Error saving cadastral data:", error);
      res.status(500).json({
        message: "儲存資料失敗",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Get all cadastral parcels using storage interface
  app.get("/api/cadastral/parcels", async (req, res) => {
    try {
      const parcels = await storage.getAllCadastralParcels();
      res.json({ data: parcels });
    } catch (error) {
      console.error("Error getting cadastral parcels:", error);
      res.status(500).json({
        message: "無法取得宗地資料",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Get all boundary points using storage interface
  app.get("/api/cadastral/points", async (req, res) => {
    try {
      const points = await storage.getAllBoundaryPoints();
      res.json({ data: points });
    } catch (error) {
      console.error("Error getting boundary points:", error);
      res.status(500).json({
        message: "無法取得界址點資料",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Generate and download SHP file
  // Server re-parses files to prevent client data tampering
  app.post("/api/cadastral/generate-shp", async (req, res) => {
    try {
      const { selectedLots, bnpContent, coaContent, parContent, coordinateSystem = "TWD97" } = req.body;

      if (!selectedLots || !Array.isArray(selectedLots) || selectedLots.length === 0) {
        return res.status(400).json({
          message: "請選擇至少一個宗地"
        });
      }

      // Validate file contents
      const fileData = cadastralFileUploadSchema.parse({
        bnpContent,
        coaContent,
        parContent,
        coordinateSystem
      });

      // Server-side parsing - don't trust client data
      const parsedData = parseCadastralFiles(
        fileData.bnpContent,
        fileData.coaContent,
        fileData.parContent
      );

      // Generate SHP file with server-validated data
      const shpBuffer = await generateShpFromCadastralData(selectedLots, parsedData, coordinateSystem as "TWD97" | "TWD67");

      // Set headers for file download
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `cadastral_data_${timestamp}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', shpBuffer.length);

      res.send(shpBuffer);
    } catch (error) {
      console.error("Error generating SHP file:", error);
      res.status(500).json({
        message: "生成SHP檔案失敗",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Helper function to normalize section code format
  const normalizeCatacode = (input: string): string => {
    // Remove whitespace
    let code = input.trim().toUpperCase();
    
    // If it starts with KC, extract the number part
    if (code.startsWith('KC')) {
      const numPart = code.substring(2);
      // Pad to 4 digits
      return 'KC' + numPart.padStart(4, '0');
    }
    
    // If it's just a number, add KC prefix and pad to 4 digits
    return 'KC' + code.padStart(4, '0');
  };

  // Get coordinate system for a section code - 查詢段代碼的座標系統
  app.get("/api/spatial/section-coord-system/:catacode", async (req, res) => {
    try {
      const { catacode } = req.params;
      
      if (!catacode) {
        return res.status(400).json({
          message: "段代碼不可為空"
        });
      }
      
      // Normalize the section code (e.g., 346 → KC0346, 0346 → KC0346, KC0346 → KC0346)
      const normalizedCode = normalizeCatacode(catacode);
      
      // Query from current database table
      const currentDb = getCurrentDbInfo();
      const surveyTableName = currentDb.table || "public.n_kc_ctl";
      
      // Use pattern matching to find the section code in comma-separated lists
      // Match pattern: exact match OR starts with code, OR has comma+code, OR ends with code
      const query = `
        SELECT DISTINCT corsys 
        FROM ${surveyTableName}
        WHERE catacode = $1 
           OR catacode LIKE $1 || ',%'
           OR catacode LIKE '%,' || $1 || ',%'
           OR catacode LIKE '%,' || $1
        LIMIT 1
      `;
      
      const result = await pool.query(query, [normalizedCode]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          message: `找不到段代碼 ${normalizedCode} 的座標系統資訊`
        });
      }
      
      const corsys = result.rows[0].corsys;
      const coordinateSystem = corsys === '1' ? 'TWD67' : 'TWD97';
      
      res.json({
        catacode: normalizedCode,
        corsys,
        coordinateSystem
      });
    } catch (error) {
      console.error("Error querying section coordinate system:", error);
      res.status(500).json({
        message: "查詢段代碼座標系統失敗",
        error: error instanceof Error ? error.message : "未知錯誤"
      });
    }
  });

  // Spatial range query for points - 空間範圍查詢
  app.post("/api/spatial/range-query", async (req, res) => {
    try {
      const { spatialRangeQuerySchema } = await import("@shared/schema");
      const validatedData = spatialRangeQuerySchema.parse(req.body);
      
      const inputCenterY = parseFloat(validatedData.centerY);
      const inputCenterX = parseFloat(validatedData.centerX);
      const range = parseFloat(validatedData.range);
      const catacode = validatedData.catacode;
      
      if (isNaN(inputCenterY) || isNaN(inputCenterX) || isNaN(range)) {
        return res.status(400).json({
          message: "座標或範圍格式錯誤"
        });
      }
      
      // Normalize the section code and determine coordinate system
      const normalizedCode = normalizeCatacode(catacode);
      const currentDb = getCurrentDbInfo();
      const surveyTableName = currentDb.table || "public.n_kc_ctl";
      
      // Use pattern matching to find the section code in comma-separated lists
      const corsysQuery = `
        SELECT DISTINCT corsys 
        FROM ${surveyTableName}
        WHERE catacode = $1 
           OR catacode LIKE $1 || ',%'
           OR catacode LIKE '%,' || $1 || ',%'
           OR catacode LIKE '%,' || $1
        LIMIT 1
      `;
      
      const corsysResult = await pool.query(corsysQuery, [normalizedCode]);
      
      if (corsysResult.rows.length === 0) {
        return res.status(404).json({
          message: "找不到該段代碼的座標系統資訊，請確認段代碼是否正確"
        });
      }
      
      const corsys = corsysResult.rows[0].corsys;
      const isTWD67 = corsys === '1';
      
      // If user input is TWD67, need to convert to TWD97 for PostGIS query
      // Note: Parameter order is (Y, X) not (X, Y)
      let centerY97, centerX97;
      if (isTWD67) {
        const transformed = transformTWD67toTWD97(inputCenterY, inputCenterX);
        centerY97 = transformed.y97;
        centerX97 = transformed.x97;
      } else {
        centerY97 = inputCenterY;
        centerX97 = inputCenterX;
      }
      
      // Create center point geometry using TWD97 coordinates for PostGIS query
      const centerPoint = `ST_SetSRID(ST_MakePoint(${centerX97}, ${centerY97}), 3826)`;
      
      const results: Array<{pointName: string, y: string, x: string}> = [];
      
      // Query survey points (圖根點)
      // Output original coordinates (realy, realx) which match the section's coordinate system
      try {
        const surveyQuery = `
          SELECT ptn as point_name, realy as y, realx as x
          FROM ${surveyTableName}
          WHERE (catacode = $1 
                 OR catacode LIKE $1 || ',%'
                 OR catacode LIKE '%,' || $1 || ',%'
                 OR catacode LIKE '%,' || $1)
          AND ST_DWithin(geom, ${centerPoint}, $2)
          ORDER BY ptn
        `;
        const surveyResult = await pool.query(surveyQuery, [normalizedCode, range]);
        surveyResult.rows.forEach(row => {
          results.push({
            pointName: row.point_name,
            y: row.y,
            x: row.x
          });
        });
      } catch (error) {
        console.error("Error querying survey points:", error);
      }
      
      // Query coordinate points (補點) from kc_ct2
      // Note: kc_ct2 only has y and x columns (no separate original columns)
      // The y/x columns already store the original coordinates
      // Also note: kc_ct2.catacode uses numeric format (e.g., "352") without KC prefix
      try {
        // Extract numeric part from normalized code (e.g., "KC0352" -> "352")
        const numericCode = normalizedCode.replace('KC', '').replace(/^0+/, '') || '0';
        const paddedNumericCode = normalizedCode.replace('KC', ''); // Keep leading zeros (e.g., "0352")
        
        const coordQuery = `
          SELECT 'Q' || TRIM(code) || id as point_name, y::text as y, x::text as x
          FROM kc_ct2
          WHERE (catacode = $1 
                 OR catacode = $2
                 OR catacode = $3
                 OR catacode LIKE $1 || ',%'
                 OR catacode LIKE $2 || ',%'
                 OR catacode LIKE $3 || ',%'
                 OR catacode LIKE '%,' || $1 || ',%'
                 OR catacode LIKE '%,' || $2 || ',%'
                 OR catacode LIKE '%,' || $3 || ',%'
                 OR catacode LIKE '%,' || $1
                 OR catacode LIKE '%,' || $2
                 OR catacode LIKE '%,' || $3)
          AND ST_DWithin(geom, ${centerPoint}, $4)
          ORDER BY id
        `;
        const coordResult = await pool.query(coordQuery, [normalizedCode, paddedNumericCode, numericCode, range]);
        coordResult.rows.forEach(row => {
          results.push({
            pointName: row.point_name,
            y: row.y,
            x: row.x
          });
        });
      } catch (error) {
        console.error("Error querying coordinate points:", error);
      }
      
      // Query boundary points (界址點) from kc_pt
      // y_coord and x_coord store original coordinates (TWD67 if the parcel is in TWD67)
      // Note: We can't filter by catacode here, so we query all boundary points in range
      try {
        const boundaryQuery = `
          SELECT point_no as point_name, y_coord::text as y, x_coord::text as x
          FROM kc_pt
          WHERE ST_DWithin(geom, ${centerPoint}, $1)
          ORDER BY point_no
        `;
        const boundaryResult = await pool.query(boundaryQuery, [range]);
        boundaryResult.rows.forEach(row => {
          results.push({
            pointName: row.point_name,
            y: row.y,
            x: row.x
          });
        });
      } catch (error) {
        console.error("Error querying boundary points:", error);
      }
      
      // Generate TXT content
      const txtLines = results.map(r => `${r.pointName},${r.y},${r.x}`);
      const txtContent = txtLines.join('\n');
      
      // Generate filename with ROC date format (e.g., 1141109.txt)
      const now = new Date();
      const rocYear = now.getFullYear() - 1911;
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const filename = `${rocYear}${month}${day}.txt`;
      
      // Send as downloadable file
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(txtContent);
      
    } catch (error) {
      console.error("Error in spatial range query:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({
          message: "資料驗證失敗",
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      } else {
        res.status(500).json({
          message: "空間查詢失敗",
          error: error instanceof Error ? error.message : "未知錯誤"
        });
      }
    }
  });

  // ====== 地段批次上傳 (Section Batch Upload) ======
  app.post("/api/survey-points/batch-section", async (req, res) => {
    try {
      const { catacode, corsys, lv, owner, file } = req.body;

      if (!catacode || !corsys || !lv || !owner || !file) {
        return res.status(400).json({ message: "請提供段代碼、座標系統、階層、上傳者及檔案內容" });
      }

      if (corsys !== "0" && corsys !== "1") {
        return res.status(400).json({ message: "座標系統必須是 0（67系統）或 1（97系統）" });
      }

      const lines = (file as string).trim().split('\n').filter((l: string) => l.trim());
      if (lines.length === 0) {
        return res.status(400).json({ message: "檔案內容為空" });
      }

      const currentDb = getCurrentDbInfo();
      const tableName = currentDb.table || "public.n_kc_ctl";
      const processedData: InsertSurveyPoint[] = [];
      const errors: string[] = [];

      lines.forEach((line: string, index: number) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 3) {
          errors.push(`第 ${index + 1} 行：欄位不足，需要至少 3 個欄位（點名 公告Y 公告X）`);
          return;
        }

        const [ptn, realY, realX, ps = "地段批次匯入", state = "?"] = parts;

        if (isNaN(parseFloat(realY)) || isNaN(parseFloat(realX))) {
          errors.push(`第 ${index + 1} 行：座標格式錯誤`);
          return;
        }

        let coord97Y: string;
        let coord97X: string;

        if (corsys === "0") {
          // TWD67 → 轉換為97
          const realYNum = parseFloat(realY);
          const realXNum = parseFloat(realX);
          const dx = 828.0;
          const dy = -204.0;
          coord97Y = (realYNum + dy).toFixed(3);
          coord97X = (realXNum + dx).toFixed(3);
        } else {
          // TWD97 → 直接使用
          coord97Y = parseFloat(realY).toFixed(3);
          coord97X = parseFloat(realX).toFixed(3);
        }

        processedData.push({
          ptn,
          realY: parseFloat(realY).toFixed(3),
          realX: parseFloat(realX).toFixed(3),
          corsys: corsys as "0" | "1",
          lv: String(lv),
          owner,
          catacode,
          coord97Y,
          coord97X,
          ps,
          state,
        });
      });

      if (errors.length > 0) {
        return res.status(400).json({ message: "檔案解析錯誤", errors });
      }

      if (processedData.length === 0) {
        return res.status(400).json({ message: "沒有有效的資料可以處理" });
      }

      const insertResult = await storage.batchCreateSurveyPoints(processedData);
      res.status(201).json({
        message: `成功批次寫入 ${insertResult.length} 筆圖根點資料（地段：${catacode}）`,
        count: insertResult.length,
        data: insertResult,
      });
    } catch (error) {
      console.error("Error in section batch upload:", error);
      res.status(500).json({
        message: "無法批次寫入圖根點資料",
        error: error instanceof Error ? error.message : "未知錯誤",
      });
    }
  });

  // ====== 資料庫管理 API ======

  // 列出所有資料表及筆數
  app.get("/api/database/tables", async (req, res) => {
    try {
      const tablesResult = await pool.query(`
        SELECT table_name, table_schema
        FROM information_schema.tables
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
          AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
      `);

      const tables = await Promise.all(
        tablesResult.rows.map(async (row) => {
          try {
            const countResult = await pool.query(
              `SELECT COUNT(*) as count FROM "${row.table_schema}"."${row.table_name}"`
            );
            const colResult = await pool.query(`
              SELECT COUNT(*) as count
              FROM information_schema.columns
              WHERE table_schema = $1 AND table_name = $2
            `, [row.table_schema, row.table_name]);
            return {
              tableName: row.table_name,
              schemaName: row.table_schema,
              fullName: `${row.table_schema}.${row.table_name}`,
              rowCount: parseInt(countResult.rows[0].count),
              columnCount: parseInt(colResult.rows[0].count),
            };
          } catch {
            return {
              tableName: row.table_name,
              schemaName: row.table_schema,
              fullName: `${row.table_schema}.${row.table_name}`,
              rowCount: -1,
              columnCount: 0,
            };
          }
        })
      );

      const dbResult = await pool.query("SELECT current_database(), version()");
      res.json({
        database: dbResult.rows[0].current_database,
        version: dbResult.rows[0].version,
        tables,
      });
    } catch (error) {
      console.error("Error listing tables:", error);
      res.status(500).json({
        message: "無法列出資料表",
        error: error instanceof Error ? error.message : "未知錯誤",
      });
    }
  });

  // 建立資料表備份
  app.post("/api/database/backup", async (req, res) => {
    try {
      const { tableName } = req.body;
      if (!tableName) {
        return res.status(400).json({ message: "請指定要備份的資料表名稱" });
      }

      // 驗證資料表是否存在
      const [schemaName, tblName] = tableName.includes(".")
        ? tableName.split(".")
        : ["public", tableName];

      const existsResult = await pool.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      `, [schemaName, tblName]);

      if (existsResult.rows.length === 0) {
        return res.status(404).json({ message: `資料表 ${tableName} 不存在` });
      }

      // 取得欄位資訊（排除 geom，改用 WKT）
      const colsResult = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schemaName, tblName]);

      const columns = colsResult.rows;
      const selectExprs = columns.map(col => {
        if (col.data_type === 'USER-DEFINED') {
          return `ST_AsText("${col.column_name}") AS "${col.column_name}"`;
        }
        return `"${col.column_name}"`;
      });

      const dataResult = await pool.query(
        `SELECT ${selectExprs.join(", ")} FROM "${schemaName}"."${tblName}"`
      );

      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${schemaName}__${tblName}__${timestamp}.json`;
      const filepath = path.join(BACKUP_DIR, filename);

      const backup = {
        metadata: {
          tableName: tblName,
          schemaName,
          fullTableName: tableName,
          createdAt: now.toISOString(),
          rowCount: dataResult.rows.length,
          columns: columns.map(c => ({ name: c.column_name, type: c.data_type })),
        },
        data: dataResult.rows,
      };

      fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), "utf-8");

      res.json({
        message: `成功備份資料表 ${tableName}，共 ${dataResult.rows.length} 筆資料`,
        filename,
        rowCount: dataResult.rows.length,
        createdAt: now.toISOString(),
      });
    } catch (error) {
      console.error("Error creating backup:", error);
      res.status(500).json({
        message: "備份失敗",
        error: error instanceof Error ? error.message : "未知錯誤",
      });
    }
  });

  // 列出所有備份
  app.get("/api/database/backups", async (req, res) => {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        return res.json({ backups: [] });
      }

      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith(".json"))
        .map(filename => {
          try {
            const filepath = path.join(BACKUP_DIR, filename);
            const stat = fs.statSync(filepath);
            const content = JSON.parse(fs.readFileSync(filepath, "utf-8"));
            return {
              filename,
              tableName: content.metadata?.fullTableName || filename,
              createdAt: content.metadata?.createdAt || stat.mtime.toISOString(),
              rowCount: content.metadata?.rowCount ?? 0,
              fileSize: stat.size,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({ backups: files });
    } catch (error) {
      console.error("Error listing backups:", error);
      res.status(500).json({
        message: "無法列出備份",
        error: error instanceof Error ? error.message : "未知錯誤",
      });
    }
  });

  // 下載備份檔案
  app.get("/api/database/backups/:filename/download", (req, res) => {
    try {
      const { filename } = req.params;
      if (filename.includes("..") || filename.includes("/")) {
        return res.status(400).json({ message: "無效的檔名" });
      }

      const filepath = path.join(BACKUP_DIR, filename);
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ message: "備份檔案不存在" });
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.sendFile(filepath);
    } catch (error) {
      res.status(500).json({
        message: "下載失敗",
        error: error instanceof Error ? error.message : "未知錯誤",
      });
    }
  });

  // 刪除備份
  app.delete("/api/database/backups/:filename", (req, res) => {
    try {
      const { filename } = req.params;
      if (filename.includes("..") || filename.includes("/")) {
        return res.status(400).json({ message: "無效的檔名" });
      }

      const filepath = path.join(BACKUP_DIR, filename);
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ message: "備份檔案不存在" });
      }

      fs.unlinkSync(filepath);
      res.json({ message: "備份已刪除", filename });
    } catch (error) {
      res.status(500).json({
        message: "刪除備份失敗",
        error: error instanceof Error ? error.message : "未知錯誤",
      });
    }
  });

  // 還原資料表
  app.post("/api/database/restore", async (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename || filename.includes("..") || filename.includes("/")) {
        return res.status(400).json({ message: "請指定有效的備份檔案名稱" });
      }

      const filepath = path.join(BACKUP_DIR, filename);
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ message: "備份檔案不存在" });
      }

      const backup = JSON.parse(fs.readFileSync(filepath, "utf-8"));
      const { metadata, data } = backup;

      if (!metadata || !data) {
        return res.status(400).json({ message: "備份檔案格式錯誤" });
      }

      const { schemaName, tableName } = metadata;

      // 驗證資料表是否存在
      const existsResult = await pool.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      `, [schemaName, tableName]);

      if (existsResult.rows.length === 0) {
        return res.status(404).json({ message: `目標資料表 ${metadata.fullTableName} 不存在` });
      }

      // 取得目前資料表欄位（用於構建 INSERT）
      const colsResult = await pool.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schemaName, tableName]);

      const tableColumns = colsResult.rows;

      // 清空資料表
      await pool.query(`TRUNCATE TABLE "${schemaName}"."${tableName}" RESTART IDENTITY CASCADE`);

      if (data.length === 0) {
        return res.json({ message: `還原完成，資料表已清空（備份中無資料）`, rowCount: 0 });
      }

      // 逐筆插入（跳過自動生成的 id，讓 DB 自動產生）
      const geomColumns = tableColumns
        .filter(c => c.data_type === 'USER-DEFINED')
        .map(c => c.column_name);

      const insertableColumns = tableColumns.filter(c => {
        // 跳過 GENERATED ALWAYS AS IDENTITY
        const hasDefault = c.column_default?.includes('nextval') || c.column_default?.includes('generated');
        return !(hasDefault && c.column_name === 'id');
      });

      let inserted = 0;
      for (const row of data) {
        const cols: string[] = [];
        const vals: any[] = [];
        const placeholders: string[] = [];
        let paramIdx = 1;

        for (const col of insertableColumns) {
          if (col.column_name === 'id') continue;
          if (row[col.column_name] === undefined || row[col.column_name] === null) {
            if (col.is_nullable === 'YES') continue;
          }

          cols.push(`"${col.column_name}"`);
          if (geomColumns.includes(col.column_name)) {
            // 使用 WKT 還原 geometry
            if (row[col.column_name]) {
              placeholders.push(`ST_GeomFromText($${paramIdx}, 3826)`);
              vals.push(row[col.column_name]);
              paramIdx++;
            } else {
              placeholders.push('NULL');
            }
          } else {
            placeholders.push(`$${paramIdx}`);
            vals.push(row[col.column_name]);
            paramIdx++;
          }
        }

        if (cols.length === 0) continue;

        try {
          await pool.query(
            `INSERT INTO "${schemaName}"."${tableName}" (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`,
            vals
          );
          inserted++;
        } catch (err) {
          console.error(`Row insert error:`, err);
        }
      }

      res.json({
        message: `成功還原資料表 ${metadata.fullTableName}，共插入 ${inserted} 筆資料`,
        rowCount: inserted,
        source: filename,
        restoredAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error restoring backup:", error);
      res.status(500).json({
        message: "還原失敗",
        error: error instanceof Error ? error.message : "未知錯誤",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
