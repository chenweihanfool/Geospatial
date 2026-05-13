import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { spatialRangeQuerySchema } from "@shared/schema";
import type { SpatialRangeQuery } from "@shared/schema";
import { MapPin, Download, Search, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";

export default function SpatialQuery() {
  const { toast } = useToast();
  const [isQuerying, setIsQuerying] = useState(false);
  const [coordinateSystem, setCoordinateSystem] = useState<string>("");
  const [isCheckingCoordSystem, setIsCheckingCoordSystem] = useState(false);

  const form = useForm<SpatialRangeQuery>({
    resolver: zodResolver(spatialRangeQuerySchema),
    defaultValues: {
      centerY: "",
      centerX: "",
      range: "300",
      catacode: "",
    },
  });

  // Check coordinate system when catacode changes
  const handleCatacodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const catacode = e.target.value;
    form.setValue("catacode", catacode);
    
    if (!catacode) {
      setCoordinateSystem("");
      return;
    }
    
    setIsCheckingCoordSystem(true);
    try {
      const response = await fetch(`/api/spatial/section-coord-system/${catacode}`);
      
      if (response.ok) {
        const data = await response.json();
        setCoordinateSystem(data.coordinateSystem);
      } else {
        setCoordinateSystem("");
      }
    } catch (error) {
      console.error("Error checking coordinate system:", error);
      setCoordinateSystem("");
    } finally {
      setIsCheckingCoordSystem(false);
    }
  };

  const onSubmit = async (data: SpatialRangeQuery) => {
    setIsQuerying(true);
    
    try {
      // Generate ROC date filename
      const now = new Date();
      const rocYear = now.getFullYear() - 1911;
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const filename = `${rocYear}${month}${day}.txt`;

      // Call API and get response as blob
      const response = await fetch('/api/spatial/range-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '空間查詢失敗');
      }

      // Get the text content
      const txtContent = await response.text();
      
      // Count lines to show user
      const lineCount = txtContent.split('\n').filter(line => line.trim()).length;

      // Create blob and download
      const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "查詢成功",
        description: `已找到 ${lineCount} 個點位，檔案已下載：${filename}`,
      });

      form.reset();
    } catch (error: any) {
      toast({
        title: "查詢失敗",
        description: error.message || "無法執行空間查詢",
        variant: "destructive",
      });
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <MapPin className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  空間範圍查詢系統
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  查詢範圍內的圖根點、補點、界址點座標資料
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <Link href="/">
                <Button variant="outline" size="sm" data-testid="link-home">
                  返回首頁
                </Button>
              </Link>
              <Link href="/survey-points">
                <Button variant="outline" size="sm" data-testid="link-survey-points">
                  圖根點管理
                </Button>
              </Link>
              <Link href="/cadastral">
                <Button variant="outline" size="sm" data-testid="link-cadastral">
                  地籍資料處理
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="bg-white dark:bg-gray-800 shadow-xl border-2 border-blue-100 dark:border-blue-900">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-green-600 text-white">
            <CardTitle className="flex items-center text-xl">
              <Search className="mr-2 h-6 w-6" />
              空間範圍查詢參數
            </CardTitle>
            <p className="text-blue-100 dark:text-blue-200 text-sm mt-1">
              輸入中心點座標、搜尋範圍及段代碼，系統將查詢範圍內所有點位並輸出 TXT 檔案
            </p>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Section Code */}
              <div className="space-y-2">
                <Label htmlFor="catacode" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  段代碼 <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="catacode"
                    onChange={handleCatacodeChange}
                    placeholder="請輸入段代碼 (例如: 346)"
                    className="pl-4"
                    data-testid="input-catacode"
                  />
                  {isCheckingCoordSystem && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                  )}
                </div>
                {coordinateSystem && (
                  <div className="flex items-center space-x-2 text-sm">
                    <div className={`px-2 py-1 rounded ${
                      coordinateSystem === 'TWD67' 
                        ? 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300' 
                        : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                    }`}>
                      座標系統：{coordinateSystem}
                    </div>
                    <span className="text-gray-600 dark:text-gray-400">
                      請輸入 {coordinateSystem} 座標
                    </span>
                  </div>
                )}
                {form.formState.errors.catacode && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.catacode.message}
                  </p>
                )}
              </div>

              {/* Center Point Coordinates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="centerY" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    中心點 Y 座標 {coordinateSystem ? `(${coordinateSystem})` : ''} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="centerY"
                    {...form.register("centerY")}
                    placeholder={coordinateSystem === 'TWD67' ? "例如: 2708515.268" : "例如: 2709344.183"}
                    className="pl-4"
                    data-testid="input-center-y"
                  />
                  {form.formState.errors.centerY && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.centerY.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="centerX" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    中心點 X 座標 {coordinateSystem ? `(${coordinateSystem})` : ''} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="centerX"
                    {...form.register("centerX")}
                    placeholder={coordinateSystem === 'TWD67' ? "例如: 215939.824" : "例如: 216768.413"}
                    className="pl-4"
                    data-testid="input-center-x"
                  />
                  {form.formState.errors.centerX && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.centerX.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Range */}
              <div className="space-y-2">
                <Label htmlFor="range" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  搜尋範圍 (公尺)
                </Label>
                <Input
                  id="range"
                  {...form.register("range")}
                  placeholder="預設 300 公尺"
                  className="pl-4"
                  data-testid="input-range"
                />
                {form.formState.errors.range && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.range.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  系統將以輸入的中心點為圓心，指定範圍為半徑，查詢範圍內的所有點位
                </p>
              </div>

              {/* Information Box */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
                  查詢範圍說明
                </h3>
                <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                  <li>• <strong>圖根點</strong>：從 n_kc_ctl 資料表查詢</li>
                  <li>• <strong>補點</strong>：從 kc_ct2 資料表查詢</li>
                  <li>• <strong>界址點</strong>：從 kc_pt 資料表查詢（不過濾段代碼）</li>
                  <li>• 輸出格式：點名,Y座標,X座標</li>
                  <li>• 檔名格式：民國年月日.txt (例如: 1141109.txt)</li>
                </ul>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 text-white font-semibold py-3"
                disabled={isQuerying}
                data-testid="button-submit-query"
              >
                {isQuerying ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    查詢中...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-5 w-5" />
                    執行查詢並下載 TXT 檔案
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6 bg-gradient-to-r from-green-50 to-blue-50 dark:from-gray-800 dark:to-gray-700 border border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <MapPin className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-green-900 dark:text-green-300 mb-1">
                  使用說明
                </h3>
                <ul className="text-sm text-green-800 dark:text-green-400 space-y-1">
                  <li>1. 輸入查詢範圍的中心點 TWD97 座標 (Y, X)</li>
                  <li>2. 設定搜尋半徑（預設 300 公尺）</li>
                  <li>3. 輸入段代碼以篩選特定段的點位</li>
                  <li>4. 點擊查詢按鈕，系統將自動下載包含所有點位座標的 TXT 檔案</li>
                  <li>5. 下載的檔案可直接匯入測量儀器或其他系統使用</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
