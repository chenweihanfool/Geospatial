import { useState, type ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertCoordinateFormSchema, batchUploadSchema } from "@shared/schema";
import type { InsertCoordinateFormData, CoordinateData, BatchUploadData } from "@shared/schema";
import { MapPin, Database, Globe, Award, BarChart3, CheckCircle, AlertCircle, Eye, Trash2, Upload, FileText, Navigation, Search, Loader2, HardDrive } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";

export default function Home() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchCoordinateSystem, setBatchCoordinateSystem] = useState<string>("");
  const [isCheckingBatchCoordSystem, setIsCheckingBatchCoordSystem] = useState(false);

  const form = useForm<InsertCoordinateFormData>({
    resolver: zodResolver(insertCoordinateFormSchema),
    defaultValues: {
      code: "",
      catacode: "",
      state: "0",
      ps: "",
      y: "",
      x: "",
      coordinateSystem: "97",
      originalY: "",
      originalX: "",
    },
  });

  const batchForm = useForm<BatchUploadData>({
    resolver: zodResolver(batchUploadSchema),
    defaultValues: {
      file: "",
      coordinateSystem: "67",
      catacode: "",
      code: "",
    },
  });

  // Query for status and count
  const { data: statusData } = useQuery({
    queryKey: ["/api/status"],
    refetchInterval: 30000,
  });

  const { data: countData } = useQuery({
    queryKey: ["/api/coordinates/count"],
    refetchInterval: 30000,
  });

  // Query for all coordinate data
  const { data: coordinatesData, isLoading: isLoadingCoordinates } = useQuery({
    queryKey: ["/api/coordinates"],
    enabled: false, // Only fetch when explicitly requested
  });

  // Function to load coordinate data when dialog is opened
  const loadCoordinateData = async () => {
    await queryClient.fetchQuery({ queryKey: ["/api/coordinates"] });
  };

  // Mutation for deleting coordinate data
  const deleteCoordinateMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest({ method: "DELETE", url: `/api/coordinates/${id}` });
    },
    onSuccess: (data) => {
      toast({
        title: "刪除成功",
        description: data.message || "座標資料已成功刪除",
      });
      // Invalidate and refetch queries
      queryClient.invalidateQueries({ queryKey: ["/api/coordinates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coordinates/count"] });
    },
    onError: (error: any) => {
      toast({
        title: "刪除失敗",
        description: error.message || "無法刪除座標資料",
        variant: "destructive",
      });
    },
  });

  // Mutation for creating coordinate data
  const createCoordinateMutation = useMutation({
    mutationFn: async (data: InsertCoordinateFormData) => {
      return await apiRequest({ method: "POST", url: "/api/coordinates", data });
    },
    onSuccess: (data) => {
      let successMessage = data.message || "座標資料已成功寫入資料庫";
      
      // Add transformation info if coordinates were converted
      if (data.transformation) {
        successMessage += `\n\n座標轉換完成：\n輸入TWD67: (${data.transformation.original.x.toFixed(6)}, ${data.transformation.original.y.toFixed(6)})\n幾何TWD97: (${data.transformation.converted.x.toFixed(6)}, ${data.transformation.converted.y.toFixed(6)})\n\n※ 資料庫 X,Y 欄位保留原始輸入值\n※ 幾何欄位使用轉換後的97座標`;
      }
      
      toast({
        title: "成功",
        description: successMessage,
      });
      form.reset();
      // Invalidate both queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/coordinates/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coordinates"] });
    },
    onError: (error: any) => {
      toast({
        title: "錯誤",
        description: error.message || "無法寫入座標資料",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: InsertCoordinateFormData) => {
    setIsSubmitting(true);
    try {
      await createCoordinateMutation.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Batch upload mutation
  const batchUploadMutation = useMutation({
    mutationFn: async (data: BatchUploadData) => {
      return await apiRequest({ method: "POST", url: "/api/coordinates/batch", data });
    },
    onSuccess: (response: any) => {
      const successMessage = response.message || `成功批次寫入 ${response.count} 筆座標資料`;
      toast({
        title: "批次上傳成功",
        description: successMessage,
      });
      batchForm.reset();
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/coordinates/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coordinates"] });
    },
    onError: (error: any) => {
      toast({
        title: "批次上傳失敗",
        description: error.message || "無法批次上傳座標資料",
        variant: "destructive",
      });
    },
  });

  const onBatchSubmit = async (data: BatchUploadData) => {
    setIsBatchUploading(true);
    try {
      await batchUploadMutation.mutateAsync(data);
    } finally {
      setIsBatchUploading(false);
    }
  };

  const handleClear = () => {
    form.reset();
    toast({
      title: "已清除",
      description: "所有欄位已重置",
    });
  };

  const handleBatchClear = () => {
    batchForm.reset();
    setBatchCoordinateSystem("");
    toast({
      title: "已清除",
      description: "批次上傳欄位已重置",
    });
  };

  // Check coordinate system when batch catacode changes
  const handleBatchCatacodeChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const catacode = e.target.value;
    batchForm.setValue("catacode", catacode);
    
    if (!catacode) {
      setBatchCoordinateSystem("");
      return;
    }
    
    setIsCheckingBatchCoordSystem(true);
    try {
      const response = await fetch(`/api/spatial/section-coord-system/${catacode}`);
      
      if (response.ok) {
        const data = await response.json();
        setBatchCoordinateSystem(data.coordinateSystem);
        // Auto-set coordinate system based on detection
        if (data.coordinateSystem === "TWD67") {
          batchForm.setValue("coordinateSystem", "67");
        } else if (data.coordinateSystem === "TWD97") {
          batchForm.setValue("coordinateSystem", "97");
        }
      } else {
        setBatchCoordinateSystem("");
      }
    } catch (error) {
      console.error("Error checking coordinate system:", error);
      setBatchCoordinateSystem("");
    } finally {
      setIsCheckingBatchCoordSystem(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <MapPin className="text-blue-600 h-8 w-8" />
              <h1 className="text-2xl font-medium text-gray-700 dark:text-gray-200">補點座標輸入系統</h1>
              <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                Coordinate Input System
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/survey-points">
                <Button variant="outline" size="sm" data-testid="button-survey-points">
                  <Navigation className="h-4 w-4 mr-2" />
                  圖根點管理
                </Button>
              </Link>
              <Link href="/cadastral">
                <Button variant="outline" size="sm" data-testid="button-cadastral">
                  <MapPin className="h-4 w-4 mr-2" />
                  地籍資料處理
                </Button>
              </Link>
              <Link href="/spatial-query">
                <Button variant="outline" size="sm" data-testid="button-spatial-query">
                  <Search className="h-4 w-4 mr-2" />
                  空間查詢
                </Button>
              </Link>
              <Link href="/database-management">
                <Button variant="outline" size="sm" data-testid="button-database-management">
                  <HardDrive className="h-4 w-4 mr-2" />
                  資料庫管理
                </Button>
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Main Form */}
        <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
          <CardHeader className="bg-blue-600 text-white">
            <CardTitle className="text-lg font-medium flex items-center">
              <Database className="mr-2 h-5 w-5" />
              座標資料輸入
            </CardTitle>
            <p className="text-blue-100 dark:text-blue-200 text-sm mt-1">
              請輸入點位座標資料以寫入 PostgreSQL 資料庫
            </p>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-sm font-medium text-gray-700">
                    點位代碼 <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="code"
                      {...form.register("code")}
                      placeholder="請輸入點位代碼"
                      className="pl-4 pr-10"
                    />
                  </div>
                  {form.formState.errors.code && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.code.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="catacode" className="text-sm font-medium text-gray-700">
                    段代碼 <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="catacode"
                      {...form.register("catacode")}
                      placeholder="請輸入段代碼"
                      className="pl-4 pr-10"
                    />
                  </div>
                  {form.formState.errors.catacode && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.catacode.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ps" className="text-sm font-medium text-gray-700">
                    備註
                  </Label>
                  <div className="relative">
                    <Input
                      id="ps"
                      {...form.register("ps")}
                      placeholder="請輸入備註"
                      className="pl-4 pr-10"
                    />
                  </div>
                  {form.formState.errors.ps && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.ps.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Coordinate System Selection */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2 pb-2 border-b border-gray-200">
                  <Database className="text-purple-600 h-5 w-5" />
                  <h3 className="text-lg font-medium text-gray-700">座標系統</h3>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="coordinateSystem" className="text-sm font-medium text-gray-700">
                    選擇座標系統 <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={form.watch("coordinateSystem")}
                    onValueChange={(value) => form.setValue("coordinateSystem", value as "97" | "67")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="請選擇座標系統" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="97">TWD97座標系統</SelectItem>
                      <SelectItem value="67">TWD67座標系統</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.formState.errors.coordinateSystem && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.coordinateSystem.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Coordinate Systems */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Y Coordinate */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 pb-2 border-b border-gray-200">
                    <Globe className="text-blue-600 h-5 w-5" />
                    <h3 className="text-lg font-medium text-gray-700">Y 座標 (縱座標)</h3>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="y" className="text-sm font-medium text-gray-700">
                      Y 座標值 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="y"
                      type="number"
                      step="0.000001"
                      {...form.register("y")}
                      placeholder="請輸入 Y 座標"
                      className="pl-4 pr-10"
                    />
                    {form.formState.errors.y && (
                      <p className="text-sm text-red-500">
                        {form.formState.errors.y.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* X Coordinate */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 pb-2 border-b border-gray-200">
                    <Award className="text-green-600 h-5 w-5" />
                    <h3 className="text-lg font-medium text-gray-700">X 座標 (橫座標)</h3>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="x" className="text-sm font-medium text-gray-700">
                      X 座標值 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="x"
                      type="number"
                      step="0.000001"
                      {...form.register("x")}
                      placeholder="請輸入 X 座標"
                      className="pl-4 pr-10"
                    />
                    {form.formState.errors.x && (
                      <p className="text-sm text-red-500">
                        {form.formState.errors.x.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6"
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      處理中...
                    </div>
                  ) : (
                    <>
                      <Database className="mr-2 h-4 w-4" />
                      寫入資料庫
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleClear}
                  className="sm:w-auto bg-gray-500 hover:bg-gray-600 text-white font-medium py-3 px-6"
                >
                  清除資料
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Batch Upload */}
        <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 mt-8">
          <CardHeader className="bg-green-600 text-white">
            <CardTitle className="text-lg font-medium flex items-center">
              <Upload className="mr-2 h-5 w-5" />
              批次上傳座標資料
            </CardTitle>
            <p className="text-green-100 dark:text-green-200 text-sm mt-1">
              上傳 TXT 檔案格式：Y座標,X座標,備註
            </p>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={batchForm.handleSubmit(onBatchSubmit)} className="space-y-6">
              {/* Section Code and Point Code */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="batchCatacode" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    段代碼 <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="batchCatacode"
                      onChange={handleBatchCatacodeChange}
                      placeholder="請輸入段代碼 (例如: 346)"
                      className="pl-4"
                      data-testid="input-batch-catacode"
                    />
                    {isCheckingBatchCoordSystem && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                    )}
                  </div>
                  {batchCoordinateSystem && (
                    <div className="flex items-center space-x-2 text-sm">
                      <div 
                        className={`px-2 py-1 rounded ${
                          batchCoordinateSystem === 'TWD67' 
                            ? 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300' 
                            : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                        }`}
                        data-testid="badge-batch-coord-system"
                      >
                        座標系統：{batchCoordinateSystem}
                      </div>
                      <span className="text-gray-600 dark:text-gray-400">
                        已自動設定
                      </span>
                    </div>
                  )}
                  {batchForm.formState.errors.catacode && (
                    <p className="text-sm text-red-500">
                      {batchForm.formState.errors.catacode.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="batchCode" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    點位代碼 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="batchCode"
                    {...batchForm.register("code")}
                    placeholder="請輸入點位代碼 (例如: C)"
                    className="pl-4"
                    data-testid="input-batch-code"
                  />
                  {batchForm.formState.errors.code && (
                    <p className="text-sm text-red-500">
                      {batchForm.formState.errors.code.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Coordinate System Selection */}
              <div className="space-y-2">
                <Label htmlFor="batchCoordinateSystem" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  座標系統 <span className="text-red-500">*</span>
                </Label>
                <Select 
                  value={batchForm.watch("coordinateSystem")} 
                  onValueChange={(value) => batchForm.setValue("coordinateSystem", value as "97" | "67")}
                >
                  <SelectTrigger className="w-full" data-testid="select-batch-coord-system">
                    <SelectValue placeholder="請選擇座標系統" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="97">TWD97 (二度分帶)</SelectItem>
                    <SelectItem value="67">TWD67 (需要轉換)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {batchCoordinateSystem ? '已根據段代碼自動設定座標系統' : '請先輸入段代碼或手動選擇座標系統'}
                </p>
                {batchForm.formState.errors.coordinateSystem && (
                  <p className="text-sm text-red-500">
                    {batchForm.formState.errors.coordinateSystem.message}
                  </p>
                )}
              </div>

              {/* File Content Input */}
              <div className="space-y-2">
                <Label htmlFor="fileContent" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  檔案內容 <span className="text-red-500">*</span>
                </Label>
                <div className="space-y-2">
                  <Textarea
                    id="fileContent"
                    {...batchForm.register("file")}
                    placeholder="請貼上 TXT 檔案內容，格式例如：&#10;2698035.015,216853.999,測試點&#10;2698036.015,216852.999&#10;2698037.015,216854.129,備註"
                    rows={8}
                    className="font-mono text-sm"
                    data-testid="textarea-batch-file-content"
                  />
                  {batchForm.formState.errors.file && (
                    <p className="text-sm text-red-500">
                      {batchForm.formState.errors.file.message}
                    </p>
                  )}
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                  <FileText className="h-4 w-4" />
                  <span>格式：Y座標,X座標,備註（每行一筆資料，備註可省略）</span>
                </div>
              </div>

              {/* Example */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">檔案格式範例</h4>
                <code className="text-xs text-blue-700 dark:text-blue-300 whitespace-pre-line">
{`2698035.015,216853.999,測試點
2698036.015,216852.999
2698037.015,216854.129,備註資訊`}
                </code>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  • 每行 2-3 個欄位，以逗號分隔<br/>
                  • 第1欄：Y座標（必填）<br/>
                  • 第2欄：X座標（必填）<br/>
                  • 第3欄：備註（選填，可省略）<br/>
                  • 段代碼和點位代碼統一在上方輸入，套用至所有資料
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
                <Button
                  type="submit"
                  disabled={isBatchUploading}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6"
                  data-testid="button-batch-upload"
                >
                  {isBatchUploading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      批次處理中...
                    </div>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      批次上傳資料
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleBatchClear}
                  className="sm:w-auto bg-gray-500 hover:bg-gray-600 text-white font-medium py-3 px-6"
                  data-testid="button-batch-clear"
                >
                  清除內容
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Status Info */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white border border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Database className="text-blue-600 h-5 w-5" />
                <span className="text-sm font-medium text-gray-700">資料庫狀態</span>
              </div>
              <div className="mt-2 flex items-center space-x-2">
                {statusData?.database === "connected" ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-sm text-gray-600 hover:text-gray-800 p-0 h-auto font-normal"
                    >
                      {statusData?.database === "connected"
                        ? "PostgreSQL 已連接"
                        : "PostgreSQL 連接失敗"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="flex items-center space-x-2">
                        <Database className="text-blue-600 h-5 w-5" />
                        <span>資料庫連線資訊</span>
                      </DialogTitle>
                      <DialogDescription>
                        Azure PostgreSQL 資料庫連線詳細資訊
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3">
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-sm font-medium text-gray-700">伺服器主機</span>
                          <span className="text-sm text-gray-600 font-mono">toufen.postgres.database.azure.com</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-sm font-medium text-gray-700">連接埠</span>
                          <span className="text-sm text-gray-600 font-mono">5432</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-sm font-medium text-gray-700">資料庫名稱</span>
                          <span className="text-sm text-gray-600 font-mono">postgres</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-sm font-medium text-gray-700">使用者名稱</span>
                          <span className="text-sm text-gray-600 font-mono">PostgreSQL_toufen</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-sm font-medium text-gray-700">主要資料表</span>
                          <span className="text-sm text-gray-600 font-mono">public.kc_ct2</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-sm font-medium text-gray-700">SSL 模式</span>
                          <span className="text-sm text-gray-600 font-mono">require</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                          <span className="text-sm font-medium text-gray-700">PostGIS 擴展</span>
                          <span className="text-sm text-green-600 font-mono">
                            {statusData?.postgis === "enabled" ? "✓ 已啟用" : "✗ 未啟用"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-600">
                          <strong>連線字串格式：</strong>
                        </p>
                        <code className="text-xs text-gray-800 break-all">
                          postgresql://PostgreSQL_toufen:••••••@toufen.postgres.database.azure.com:5432/postgres?sslmode=require
                        </code>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Globe className="text-green-600 h-5 w-5" />
                <span className="text-sm font-medium text-gray-700">PostGIS 擴展</span>
              </div>
              <div className="mt-2 flex items-center space-x-2">
                {statusData?.postgis === "enabled" ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm text-gray-600">
                  {statusData?.postgis === "enabled"
                    ? "空間資料支援啟用"
                    : "PostGIS 狀態未知"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Dialog>
            <DialogTrigger asChild>
              <Card 
                className="bg-white border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
                onClick={loadCoordinateData}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="text-blue-600 h-5 w-5" />
                    <span className="text-sm font-medium text-gray-700">資料統計</span>
                    <Eye className="text-blue-600 h-4 w-4 ml-auto" />
                  </div>
                  <div className="mt-2">
                    <span className="text-sm text-gray-600">
                      已儲存 {countData?.count || 0} 筆座標
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="text-xs text-blue-600">
                      點擊查看詳細資料
                    </span>
                  </div>
                </CardContent>
              </Card>
            </DialogTrigger>
            <DialogContent className="max-w-6xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <Database className="text-blue-600 h-5 w-5" />
                  <span>座標資料明細</span>
                  <span className="text-sm text-gray-500">
                    ({countData?.count || 0} 筆記錄)
                  </span>
                </DialogTitle>
                <DialogDescription>
                  查看所有儲存的座標資料，包含 Taiwan97 座標系和公告座標系的資料。
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="h-[60vh] w-full">
                {isLoadingCoordinates ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-2 text-gray-600">載入中...</span>
                  </div>
                ) : coordinatesData?.data?.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px]">ID</TableHead>
                        <TableHead>點位代碼</TableHead>
                        <TableHead>段代碼</TableHead>
                        <TableHead>狀態</TableHead>
                        <TableHead>Y 座標</TableHead>
                        <TableHead>X 座標</TableHead>
                        <TableHead>備註</TableHead>
                        <TableHead>更新時間</TableHead>
                        <TableHead className="w-[80px]">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coordinatesData.data.map((coord: CoordinateData) => (
                        <TableRow key={coord.id}>
                          <TableCell className="font-medium">{coord.id}</TableCell>
                          <TableCell>{coord.code}</TableCell>
                          <TableCell>{coord.catacode}</TableCell>
                          <TableCell>{coord.state}</TableCell>
                          <TableCell>{coord.y}</TableCell>
                          <TableCell>{coord.x}</TableCell>
                          <TableCell>{coord.ps}</TableCell>
                          <TableCell>
                            {coord.updatetime ? new Date(coord.updatetime).toLocaleString('zh-TW') : '-'}
                          </TableCell>
                          <TableCell>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>確認刪除</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    確定要刪除這筆座標資料嗎？
                                    <br />
                                    <strong>ID: {coord.id}</strong>
                                    <br />
                                    <strong>點位代碼: {coord.code}</strong>
                                    <br />
                                    <strong>段代碼: {coord.catacode}</strong>
                                    <br />
                                    此操作無法復原。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteCoordinateMutation.mutate(coord.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    確定刪除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex items-center justify-center h-32 text-gray-500">
                    <div className="text-center">
                      <Database className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                      <p>尚未有座標資料</p>
                      <p className="text-sm">請先輸入座標資料</p>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  );
}
