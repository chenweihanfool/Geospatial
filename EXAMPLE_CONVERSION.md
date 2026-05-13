# 實例轉換：從座標系統到商品管理系統

## 🔄 轉換對應表

| 原始功能 | 新功能 | 說明 |
|---------|--------|------|
| 座標輸入 | 商品新增 | 輸入商品資料 |
| 點位代碼 | 商品編號 | 唯一識別碼 |
| X,Y座標 | 價格、庫存 | 數值型資料 |
| 座標系統選擇 | 商品分類 | 下拉選單 |
| 批次上傳 | 批次匯入 | CSV檔案上傳 |
| 座標查看 | 商品列表 | 資料表格顯示 |
| 資料庫狀態 | 系統狀態 | 連線狀態顯示 |

## 📝 具體修改步驟

### 1. 資料模型修改 (shared/schema.ts)

```typescript
// 原始：座標資料表
export const coordinateData = pgTable("kc_ct2", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  sectionCode: text("section_code"),
  x: decimal("x", { precision: 10, scale: 6 }),
  y: decimal("y", { precision: 10, scale: 6 }),
  coordinateSystem: text("coordinate_system"),
  notes: text("notes"),
});

// 修改為：商品資料表
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),              // 商品編號
  name: text("name").notNull(),              // 商品名稱
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),  // 價格
  stock: integer("stock").default(0),        // 庫存數量
  category: text("category").notNull(),      // 商品分類
  description: text("description"),          // 商品描述
  createdAt: timestamp("created_at").defaultNow(),
});

// 表單驗證結構
export const insertProductSchema = createInsertSchema(products).pick({
  code: true,
  name: true,
  price: true,
  stock: true,
  category: true,
  description: true,
});

export const insertProductFormSchema = insertProductSchema.extend({
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, "請輸入有效的價格"),
  stock: z.string().regex(/^\d+$/, "請輸入有效的庫存數量"),
});
```

### 2. API 路由修改 (server/routes.ts)

```typescript
// 原始：座標 API
app.get("/api/coordinates", async (req, res) => {
  const coordinates = await storage.getAllCoordinateData();
  res.json({ data: coordinates });
});

app.post("/api/coordinates", async (req, res) => {
  const result = insertCoordinateDataSchema.safeParse(req.body);
  // ...
});

// 修改為：商品 API
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

app.get("/api/products/count", async (req, res) => {
  const count = await storage.getProductCount();
  res.json({ count: count.toString() });
});

app.delete("/api/products/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const success = await storage.deleteProduct(id);
  res.json({ success });
});
```

### 3. 資料存取層修改 (server/storage.ts)

```typescript
// 原始：座標資料存取
export interface IStorage {
  getCoordinateDataCount(): Promise<number>;
  getAllCoordinateData(): Promise<CoordinateData[]>;
  createCoordinateData(data: InsertCoordinateData): Promise<CoordinateData>;
  deleteCoordinateData(id: number): Promise<boolean>;
}

// 修改為：商品資料存取
export interface IStorage {
  getProductCount(): Promise<number>;
  getAllProducts(): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  deleteProduct(id: number): Promise<boolean>;
  batchCreateProducts(products: InsertProduct[]): Promise<Product[]>;
}

export class DatabaseStorage implements IStorage {
  async getProductCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(products);
    return result.count;
  }

  async getAllProducts(): Promise<Product[]> {
    return await db.select().from(products).orderBy(desc(products.createdAt));
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db
      .insert(products)
      .values(insertProduct)
      .returning();
    return product;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id));
    return result.rowCount > 0;
  }
}
```

### 4. 前端頁面修改 (client/src/pages/home.tsx)

```typescript
// 修改頁面標題和圖示
<header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700">
  <div className="max-w-4xl mx-auto px-4 py-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <Package className="text-blue-600 h-8 w-8" />  {/* 改為商品圖示 */}
        <h1 className="text-2xl font-medium text-gray-700 dark:text-gray-200">
          商品管理系統
        </h1>
        <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
          Product Management System
        </span>
      </div>
      <ThemeToggle />
    </div>
  </div>
</header>

// 修改表單欄位
<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div>
      <Label htmlFor="code">商品編號</Label>
      <Input
        id="code"
        {...register("code")}
        placeholder="例如：P001"
        className="mt-1"
      />
      {errors.code && (
        <p className="text-red-500 text-sm mt-1">{errors.code.message}</p>
      )}
    </div>
    
    <div>
      <Label htmlFor="name">商品名稱</Label>
      <Input
        id="name"
        {...register("name")}
        placeholder="例如：筆記型電腦"
        className="mt-1"
      />
      {errors.name && (
        <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
      )}
    </div>
    
    <div>
      <Label htmlFor="price">價格</Label>
      <Input
        id="price"
        {...register("price")}
        placeholder="例如：25000.00"
        className="mt-1"
      />
      {errors.price && (
        <p className="text-red-500 text-sm mt-1">{errors.price.message}</p>
      )}
    </div>
    
    <div>
      <Label htmlFor="stock">庫存數量</Label>
      <Input
        id="stock"
        {...register("stock")}
        placeholder="例如：100"
        className="mt-1"
      />
      {errors.stock && (
        <p className="text-red-500 text-sm mt-1">{errors.stock.message}</p>
      )}
    </div>
    
    <div>
      <Label htmlFor="category">商品分類</Label>
      <Select onValueChange={(value) => setValue("category", value)}>
        <SelectTrigger>
          <SelectValue placeholder="請選擇分類" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="electronics">電子產品</SelectItem>
          <SelectItem value="clothing">服裝配件</SelectItem>
          <SelectItem value="books">圖書文具</SelectItem>
          <SelectItem value="home">家居用品</SelectItem>
          <SelectItem value="sports">運動器材</SelectItem>
        </SelectContent>
      </Select>
      {errors.category && (
        <p className="text-red-500 text-sm mt-1">{errors.category.message}</p>
      )}
    </div>
    
    <div className="md:col-span-2">
      <Label htmlFor="description">商品描述</Label>
      <Textarea
        id="description"
        {...register("description")}
        placeholder="商品詳細描述..."
        className="mt-1"
        rows={3}
      />
    </div>
  </div>
  
  <Button type="submit" className="w-full" disabled={mutation.isPending}>
    {mutation.isPending ? "新增中..." : "新增商品"}
  </Button>
</form>

// 修改資料表格顯示
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>商品編號</TableHead>
      <TableHead>商品名稱</TableHead>
      <TableHead>價格</TableHead>
      <TableHead>庫存</TableHead>
      <TableHead>分類</TableHead>
      <TableHead>建立時間</TableHead>
      <TableHead>操作</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {productsData.data.map((product: Product) => (
      <TableRow key={product.id}>
        <TableCell>{product.code}</TableCell>
        <TableCell>{product.name}</TableCell>
        <TableCell>NT$ {product.price}</TableCell>
        <TableCell>{product.stock}</TableCell>
        <TableCell>{product.category}</TableCell>
        <TableCell>{new Date(product.createdAt).toLocaleDateString()}</TableCell>
        <TableCell>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleDelete(product.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### 5. 批次上傳格式修改

```typescript
// 原始：座標批次上傳格式
// 點位代碼,段代碼,備註,座標系統,Y座標,X座標

// 修改為：商品批次上傳格式
// 商品編號,商品名稱,價格,庫存,分類,描述
// P001,筆記型電腦,25000.00,50,electronics,高效能商務筆電
// P002,無線滑鼠,800.00,200,electronics,人體工學設計
```

## 🎯 完成後的功能

修改完成後，您將擁有一個完整的商品管理系統：

1. **商品新增**：可以輸入商品資料並儲存到資料庫
2. **商品列表**：顯示所有商品資料的表格
3. **商品刪除**：可以刪除不需要的商品
4. **批次匯入**：可以上傳 CSV 檔案批次新增商品
5. **系統狀態**：顯示資料庫連線狀態和商品總數
6. **明暗主題**：支援主題切換功能
7. **響應式設計**：適配不同螢幕大小

這個轉換範例展示了如何將一個特定領域的應用程式架構重新用於完全不同的用途，同時保持程式碼的品質和功能完整性。