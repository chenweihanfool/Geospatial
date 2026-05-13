# 專案複製指南 - 補點座標輸入系統模板

## 🎯 專案概述
這是一個完整的全端 TypeScript 應用程式模板，具備以下核心功能：
- React + TypeScript 前端
- Node.js + Express 後端
- PostgreSQL 資料庫
- 明暗主題切換
- 表單驗證與資料管理
- 批次上傳功能

## 📋 複製步驟

### 1. 建立新專案
```bash
# 在 Replit 建立新的 Node.js 專案
# 或在本地建立新資料夾
mkdir my-new-app
cd my-new-app
```

### 2. 複製核心檔案結構
```
my-new-app/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              # 所有 shadcn/ui 組件
│   │   │   ├── theme-provider.tsx
│   │   │   └── theme-toggle.tsx
│   │   ├── hooks/
│   │   │   ├── use-mobile.tsx
│   │   │   └── use-toast.ts
│   │   ├── lib/
│   │   │   ├── queryClient.ts
│   │   │   └── utils.ts
│   │   ├── pages/
│   │   │   ├── home.tsx         # 主頁面（需修改）
│   │   │   └── not-found.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   └── index.html
├── server/
│   ├── db.ts                    # 資料庫連接
│   ├── index.ts                 # 伺服器主檔案
│   ├── routes.ts                # API 路由（需修改）
│   ├── storage.ts               # 資料存取層（需修改）
│   └── vite.ts                  # Vite 設定
├── shared/
│   └── schema.ts                # 共享資料模型（需修改）
├── package.json
├── tailwind.config.ts
├── vite.config.ts
├── drizzle.config.ts
└── tsconfig.json
```

### 3. 必要的依賴套件
```json
{
  "dependencies": {
    "@hookform/resolvers": "^3.x",
    "@neondatabase/serverless": "^0.x",
    "@radix-ui/react-*": "^1.x",
    "@tanstack/react-query": "^5.x",
    "drizzle-orm": "^0.x",
    "drizzle-zod": "^0.x",
    "express": "^4.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-hook-form": "^7.x",
    "tailwindcss": "^3.x",
    "vite": "^5.x",
    "wouter": "^3.x",
    "zod": "^3.x"
  }
}
```

## 🔧 客製化修改點

### 1. 資料模型 (shared/schema.ts)
```typescript
// 範例：改為商品管理系統
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  category: text("category").notNull(),
  description: text("description"),
  stock: integer("stock").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).pick({
  name: true,
  price: true,
  category: true,
  description: true,
  stock: true,
});
```

### 2. API 路由 (server/routes.ts)
```typescript
// 範例：商品管理 API
app.get("/api/products", async (req, res) => {
  const products = await storage.getAllProducts();
  res.json({ data: products });
});

app.post("/api/products", async (req, res) => {
  const result = insertProductSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  const product = await storage.createProduct(result.data);
  res.json(product);
});
```

### 3. 資料存取層 (server/storage.ts)
```typescript
// 範例：商品管理存取介面
export interface IStorage {
  getAllProducts(): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<Product>): Promise<Product>;
  deleteProduct(id: number): Promise<boolean>;
}
```

### 4. 前端頁面 (client/src/pages/home.tsx)
```typescript
// 修改頁面標題、表單欄位、功能邏輯
const Home = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-900 shadow-sm">
        <h1 className="text-2xl font-medium">商品管理系統</h1>
        <ThemeToggle />
      </header>
      {/* 自訂表單和功能 */}
    </div>
  );
};
```

## 🎨 應用範例

### 1. 商品管理系統
- 資料表：products (商品名稱、價格、庫存、分類)
- 功能：新增商品、查看清單、更新庫存、刪除商品

### 2. 學生成績系統
- 資料表：students, grades (學生資料、成績記錄)
- 功能：學生註冊、成績錄入、成績查詢、統計分析

### 3. 設備借用系統
- 資料表：equipment, borrowings (設備清單、借用記錄)
- 功能：設備登記、借用申請、歸還處理、使用統計

### 4. 會議室預約系統
- 資料表：rooms, bookings (會議室、預約記錄)
- 功能：查看空房、預約會議室、取消預約、使用記錄

## 🚀 快速開始

1. **複製專案檔案**：將所有檔案複製到新專案資料夾
2. **安裝依賴**：`npm install`
3. **設定資料庫**：更新 `DATABASE_URL` 環境變數
4. **修改資料模型**：根據需求更新 `shared/schema.ts`
5. **客製化介面**：修改 `client/src/pages/home.tsx`
6. **更新 API**：調整 `server/routes.ts` 和 `server/storage.ts`
7. **測試運行**：`npm run dev`

## 💡 進階功能

已包含的進階功能：
- ✅ 明暗主題切換
- ✅ 表單驗證 (React Hook Form + Zod)
- ✅ 資料庫連接 (PostgreSQL + Drizzle ORM)
- ✅ 響應式設計 (Tailwind CSS)
- ✅ 錯誤處理和提示
- ✅ 批次上傳功能

可擴展的功能：
- 使用者認證系統
- 檔案上傳和儲存
- 圖表和統計
- 匯出功能 (Excel, PDF)
- 即時通知
- 多語言支援

## 🔒 注意事項

1. **環境變數**：確保設定正確的 `DATABASE_URL`
2. **資料庫權限**：確保資料庫使用者有建立資料表的權限
3. **型別安全**：保持前後端型別一致性
4. **錯誤處理**：實作適當的錯誤處理機制
5. **資料驗證**：前後端都要進行資料驗證

---

這個模板提供了一個完整的基礎架構，您可以根據具體需求進行修改和擴展。