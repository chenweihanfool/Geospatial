import { useState, useEffect, useRef, useCallback } from "react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertSurveyPointSchema, surveyPointBatchUploadSchema } from "@shared/schema";
import type { InsertSurveyPoint, SurveyPoint, SurveyPointBatchUpload } from "@shared/schema";
import { MapPin, Database, Globe, Award, BarChart3, CheckCircle, AlertCircle, Eye, Trash2, Upload, FileText, Navigation, ArrowLeft, Layers } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";

export default function SurveyPoints() {
  const { toast } = useToast();
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDbInfoOpen, setIsDbInfoOpen] = useState(false);
  const [isDbSwitchOpen, setIsDbSwitchOpen] = useState(false);

  // Single point form setup
  const form = useForm<InsertSurveyPoint>({
    resolver: zodResolver(insertSurveyPointSchema),
    defaultValues: {
      ptn: "",
      realY: "",
      realX: "",
      corsys: "1",
      lv: "0",
      owner: "",
      catacode: "",
      coord97Y: "",
      coord97X: "",
      ps: "",
      state: "?",
    },
  });

  // Batch upload form setup
  const batchForm = useForm<SurveyPointBatchUpload>({
    resolver: zodResolver(surveyPointBatchUploadSchema),
    defaultValues: {
      file: "",
      defaultOwner: "",
    },
  });

  // Database switch form setup
  const dbSwitchForm = useForm({
    defaultValues: {
      host: "",
      port: "5432",
      database: "",
      username: "",
      password: "",
      table: "public.n_kc_ctl",
    },
  });

  // Fetch survey points count
  const { data: countData } = useQuery({
    queryKey: ["/api/survey-points/count"],
    queryFn: ({ queryKey }) => apiRequest({ method: "GET", url: queryKey[0] }),
    refetchInterval: 30000,
  });

  // Fetch survey points data
  const { data: surveyPointsData, isLoading: isLoadingPoints } = useQuery({
    queryKey: ["/api/survey-points"],
    queryFn: ({ queryKey }) => apiRequest({ method: "GET", url: queryKey[0] }),
    enabled: isViewDialogOpen,
  });

  // Fetch current database info
  const { data: dbInfo, refetch: refetchDbInfo } = useQuery({
    queryKey: ["/api/database/info"],
    queryFn: ({ queryKey }) => apiRequest({ method: "GET", url: queryKey[0] }),
    enabled: isDbInfoOpen,
  });

  // Create survey point mutation
  const mutation = useMutation({
    mutationFn: async (data: InsertSurveyPoint) => {
      return apiRequest({
        method: "POST",
        url: "/api/survey-points",
        data: data,
      });
    },
    onSuccess: () => {
      toast({
        title: "成功",
        description: "測點資料已成功新增",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/survey-points/count"] });
      if (isViewDialogOpen) {
        queryClient.invalidateQueries({ queryKey: ["/api/survey-points"] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "錯誤",
        description: error.message || "新增測點資料時發生錯誤",
        variant: "destructive",
      });
    },
  });

  // Delete survey point mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest({
        method: "DELETE",
        url: `/api/survey-points/${id}`,
      });
    },
    onSuccess: () => {
      toast({
        title: "成功",
        description: "測點資料已成功刪除",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/survey-points/count"] });
      if (isViewDialogOpen) {
        queryClient.invalidateQueries({ queryKey: ["/api/survey-points"] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "錯誤",
        description: error.message || "刪除測點資料時發生錯誤",
        variant: "destructive",
      });
    },
  });

  // Batch upload mutation
  const batchMutation = useMutation({
    mutationFn: async (data: SurveyPointBatchUpload) => {
      return apiRequest({
        method: "POST",
        url: "/api/survey-points/batch",
        data: data,
      });
    },
    onSuccess: (result) => {
      toast({
        title: "成功",
        description: result.message || "批次上傳測點資料成功",
      });
      batchForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/survey-points/count"] });
      if (isViewDialogOpen) {
        queryClient.invalidateQueries({ queryKey: ["/api/survey-points"] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "錯誤",
        description: error.message || "批次上傳測點資料時發生錯誤",
        variant: "destructive",
      });
    },
  });

  // Database switch mutation
  const dbSwitchMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest({
        method: "POST",
        url: "/api/database/switch",
        data: data,
      });
    },
    onSuccess: (result) => {
      toast({
        title: "成功",
        description: result.message || "資料庫切換成功",
      });
      dbSwitchForm.reset();
      setIsDbSwitchOpen(false);
      // Refresh data after database switch
      queryClient.invalidateQueries({ queryKey: ["/api/survey-points/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/database/info"] });
      if (isViewDialogOpen) {
        queryClient.invalidateQueries({ queryKey: ["/api/survey-points"] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "錯誤",
        description: error.message || "資料庫切換時發生錯誤",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: InsertSurveyPoint) => {
    mutation.mutate(data);
  };

  const onBatchSubmit = async (data: SurveyPointBatchUpload) => {
    batchMutation.mutate(data);
  };

  const onDbSwitchSubmit = async (data: any) => {
    dbSwitchMutation.mutate(data);
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  const { register, handleSubmit, formState: { errors }, setValue, watch } = form;
  
  // Watch for coordinate system and coordinate changes
  const corsysValue = watch("corsys");
  const realYValue = watch("realY");
  const realXValue = watch("realX");
  
  // Transform TWD67 to TWD97 coordinates
  const transformTWD67ToTWD97 = (x67: number, y67: number) => {
    const dx = 828.0;
    const dy = -204.0;
    const x97 = x67 + dx;
    const y97 = y67 + dy;
    return { x97, y97 };
  };
  
  // Auto-calculate coord97 values when coordinate system is 67 (0)
  const calculateCoord97 = () => {
    if (corsysValue === "0" && realYValue && realXValue) {
      const realY = parseFloat(realYValue);
      const realX = parseFloat(realXValue);
      if (!isNaN(realY) && !isNaN(realX)) {
        const transformed = transformTWD67ToTWD97(realX, realY);
        setValue("coord97Y", transformed.y97.toString());
        setValue("coord97X", transformed.x97.toString());
      }
    } else if (corsysValue === "1" && realYValue && realXValue) {
      // For TWD97, copy real coordinates to coord97
      setValue("coord97Y", realYValue);
      setValue("coord97X", realXValue);
    }
  };
  
  // Effect to trigger calculation when values change
  React.useEffect(() => {
    calculateCoord97();
  }, [corsysValue, realYValue, realXValue]);
  
  const { register: batchRegister, handleSubmit: batchHandleSubmit, formState: { errors: batchErrors }, watch: batchWatch } = batchForm;

  // CTL 地段批次上傳
  interface CTLFile { filename: string; content: string; pointCount: number; catacode: string; }
  const [ctlFiles, setCtlFiles] = useState<CTLFile[]>([]);
  const [ctlCorsys, setCtlCorsys] = useState<string>("1");
  const [ctlOwner, setCtlOwner] = useState<string>("system");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function parseCTLContent(content: string): number {
    const lines = content.split('\n');
    let count = 0;
    let isFirst = true;
    for (const line of lines) {
      if (line.trim() === '') continue;
      if (isFirst) { isFirst = false; continue; }
      if (line.length < 19) continue;
      const ptn = line.substring(0, 8).trim();
      const y = parseFloat(line.substring(8, 19).trim());
      const x = parseFloat(line.substring(19, 29).trim());
      if (ptn && !isNaN(y) && !isNaN(x)) count++;
    }
    return count;
  }

  const readCTLFiles = useCallback((fileList: FileList | File[]) => {
    const filesArray = Array.from(fileList);
    filesArray.forEach(file => {
      if (!file.name.toUpperCase().endsWith('.CTL')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const catacode = file.name.replace(/\.[^.]+$/, '').toUpperCase();
        const pointCount = parseCTLContent(content);
        setCtlFiles(prev => {
          if (prev.some(f => f.filename === file.name)) return prev;
          return [...prev, { filename: file.name, content, pointCount, catacode }];
        });
      };
      reader.readAsText(file, 'utf-8');
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    readCTLFiles(e.dataTransfer.files);
  }, [readCTLFiles]);

  const [ctlUploadResult, setCtlUploadResult] = useState<any>(null);

  const ctlMutation = useMutation({
    mutationFn: async () => {
      return apiRequest({
        method: "POST",
        url: "/api/survey-points/batch-ctl",
        data: {
          files: ctlFiles.map(f => ({ filename: f.filename, content: f.content })),
          corsys: ctlCorsys,
          owner: ctlOwner,
        },
      });
    },
    onSuccess: (result) => {
      toast({ title: "上傳成功", description: result.message });
      setCtlUploadResult(result);
      setCtlFiles([]);
      queryClient.invalidateQueries({ queryKey: ["/api/survey-points/count"] });
      if (isViewDialogOpen) queryClient.invalidateQueries({ queryKey: ["/api/survey-points"] });
    },
    onError: (error: any) => {
      toast({ title: "上傳失敗", description: error.message || "發生錯誤", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Navigation className="text-blue-600 h-8 w-8" />
              <h1 className="text-2xl font-medium text-gray-700 dark:text-gray-200">圖根點資料管理系統</h1>
              <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                Survey Point Management
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  返回主頁
                </Button>
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* System Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <Dialog open={isDbInfoOpen} onOpenChange={setIsDbInfoOpen}>
                <DialogTrigger asChild>
                  <div className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors">
                    <Database className="text-blue-600 h-5 w-5" />
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">資料庫狀態</p>
                      <p className="text-lg font-semibold text-green-600">已連接</p>
                    </div>
                  </div>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center">
                      <Database className="mr-2 h-5 w-5 text-blue-600" />
                      資料庫連線資訊
                    </DialogTitle>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Azure PostgreSQL 資料庫連線詳細資訊
                    </p>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">伺服器主機</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {dbInfo?.host || "toufen.postgres.database.azure.com"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">連接埠</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {dbInfo?.port || "5432"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">資料庫名稱</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {dbInfo?.database || "postgres"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">使用者名稱</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {dbInfo?.username || "PostgreSQL_toufen"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">主要資料表</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {dbInfo?.table || "public.n_kc_ctl"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">SSL 模式</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">require</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">PostGIS 擴展</span>
                      <span className="text-sm text-green-600 dark:text-green-400 flex items-center">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        已啟用
                      </span>
                    </div>
                    <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                      <p className="font-medium text-gray-700 dark:text-gray-300">連線字串格式：</p>
                      <code className="text-xs text-gray-600 dark:text-gray-400 block mt-1 font-mono">
                        postgresql://用戶名:密碼@主機:埠/資料庫?sslmode=require
                      </code>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <Button 
                        onClick={() => {
                          setIsDbInfoOpen(false);
                          setIsDbSwitchOpen(true);
                        }}
                        variant="outline" 
                        className="w-full"
                      >
                        切換資料庫
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <BarChart3 className="text-green-600 h-5 w-5" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">圖根點總數</p>
                  <p className="text-lg font-semibold text-blue-600">
                    {countData?.count || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Globe className="text-purple-600 h-5 w-5" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">座標系統</p>
                  <p className="text-lg font-semibold text-purple-600">TWD97/TWD67</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Form */}
        <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
          <CardHeader className="bg-blue-600 text-white">
            <CardTitle className="text-lg font-medium flex items-center">
              <MapPin className="mr-2 h-5 w-5" />
              圖根點資料輸入
            </CardTitle>
            <p className="text-blue-100 dark:text-blue-200 text-sm mt-1">
              請輸入圖根點資料以寫入 PostgreSQL 資料庫
            </p>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <Label htmlFor="ptn">點名</Label>
                  <Input
                    id="ptn"
                    {...register("ptn")}
                    placeholder="例如：BDC347"
                    className="mt-1"
                  />
                  {errors.ptn && (
                    <p className="text-red-500 text-sm mt-1">{errors.ptn.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="realY">公告Y座標</Label>
                  <Input
                    id="realY"
                    {...register("realY")}
                    placeholder="例如：2702678.552"
                    className="mt-1"
                  />
                  {errors.realY && (
                    <p className="text-red-500 text-sm mt-1">{errors.realY.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="realX">公告X座標</Label>
                  <Input
                    id="realX"
                    {...register("realX")}
                    placeholder="例如：215848.490"
                    className="mt-1"
                  />
                  {errors.realX && (
                    <p className="text-red-500 text-sm mt-1">{errors.realX.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="corsys">座標系統</Label>
                  <Select onValueChange={(value) => setValue("corsys", value as "1" | "0")}>
                    <SelectTrigger>
                      <SelectValue placeholder="選擇座標系統" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">TWD97 (台灣大地基準2097)</SelectItem>
                      <SelectItem value="0">TWD67 (台灣大地基準1967)</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.corsys && (
                    <p className="text-red-500 text-sm mt-1">{errors.corsys.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="lv">階層</Label>
                  <Input
                    id="lv"
                    {...register("lv")}
                    placeholder="例如：0 (圖根點)"
                    className="mt-1"
                  />
                  {errors.lv && (
                    <p className="text-red-500 text-sm mt-1">{errors.lv.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="owner">上傳者</Label>
                  <Input
                    id="owner"
                    {...register("owner")}
                    placeholder="例如：system"
                    className="mt-1"
                  />
                  {errors.owner && (
                    <p className="text-red-500 text-sm mt-1">{errors.owner.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="catacode">段代碼</Label>
                  <Input
                    id="catacode"
                    {...register("catacode")}
                    placeholder="例如：KC0308"
                    className="mt-1"
                  />
                  {errors.catacode && (
                    <p className="text-red-500 text-sm mt-1">{errors.catacode.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="coord97Y">TWD97 Y座標 {corsysValue === "0" && "(自動計算)"}</Label>
                  <Input
                    id="coord97Y"
                    {...register("coord97Y")}
                    placeholder="自動計算或手動輸入"
                    className="mt-1"
                    disabled={corsysValue === "0"}
                  />
                  {errors.coord97Y && (
                    <p className="text-red-500 text-sm mt-1">{errors.coord97Y.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="coord97X">TWD97 X座標 {corsysValue === "0" && "(自動計算)"}</Label>
                  <Input
                    id="coord97X"
                    {...register("coord97X")}
                    placeholder="自動計算或手動輸入"
                    className="mt-1"
                    disabled={corsysValue === "0"}
                  />
                  {errors.coord97X && (
                    <p className="text-red-500 text-sm mt-1">{errors.coord97X.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="state">狀態</Label>
                  <Input
                    id="state"
                    {...register("state")}
                    placeholder="例如：? (未知)"
                    className="mt-1"
                  />
                  {errors.state && (
                    <p className="text-red-500 text-sm mt-1">{errors.state.message}</p>
                  )}
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="ps">備註</Label>
                  <Textarea
                    id="ps"
                    {...register("ps")}
                    placeholder="備註資訊..."
                    className="mt-1"
                    rows={3}
                  />
                  {errors.ps && (
                    <p className="text-red-500 text-sm mt-1">{errors.ps.message}</p>
                  )}
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {corsysValue === "0" && (
                    <span className="flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1 text-orange-500" />
                      TWD67 座標將自動轉換為 TWD97
                    </span>
                  )}
                  {corsysValue === "1" && (
                    <span className="flex items-center">
                      <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                      使用 TWD97 座標系統
                    </span>
                  )}
                </div>
                
                <div className="flex space-x-4">
                  <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" type="button">
                        <Eye className="h-4 w-4 mr-2" />
                        查看圖根點資料
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>圖根點資料列表</DialogTitle>
                      </DialogHeader>
                      <div className="mt-4">
                        {isLoadingPoints ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>點名</TableHead>
                                  <TableHead>公告Y</TableHead>
                                  <TableHead>公告X</TableHead>
                                  <TableHead>座標系統</TableHead>
                                  <TableHead>階層</TableHead>
                                  <TableHead>上傳者</TableHead>
                                  <TableHead>段代碼</TableHead>
                                  <TableHead>狀態</TableHead>
                                  <TableHead>操作</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {surveyPointsData?.data?.map((point: SurveyPoint) => (
                                  <TableRow key={point.id}>
                                    <TableCell className="font-medium">{point.ptn}</TableCell>
                                    <TableCell>{point.realY}</TableCell>
                                    <TableCell>{point.realX}</TableCell>
                                    <TableCell>
                                      <Badge variant={point.corsys === "1" ? "default" : "secondary"}>
                                        TWD{point.corsys === "1" ? "97" : "67"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{point.lv}</TableCell>
                                    <TableCell>{point.owner}</TableCell>
                                    <TableCell>{point.catacode}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline">{point.state}</Badge>
                                    </TableCell>
                                    <TableCell>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button size="sm" variant="destructive">
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>確認刪除</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              確定要刪除圖根點「{point.ptn}」嗎？此操作無法復原。
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>取消</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDelete(point.id)}>
                                              刪除
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "新增中..." : "新增圖根點"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Batch Upload */}
        <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 mt-8">
          <CardHeader className="bg-green-600 text-white">
            <CardTitle className="text-lg font-medium flex items-center">
              <Upload className="mr-2 h-5 w-5" />
              批次上傳圖根點資料
            </CardTitle>
            <p className="text-green-100 dark:text-green-200 text-sm mt-1">
              上傳格式：點名 公告Y 公告X 座標系統(0=97/1=67) 階層 段代碼 備註 狀態
            </p>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={batchHandleSubmit(onBatchSubmit)} className="space-y-6">
              <div>
                <Label htmlFor="defaultOwner">預設上傳者</Label>
                <Input
                  id="defaultOwner"
                  {...batchRegister("defaultOwner")}
                  placeholder="例如：system"
                  className="mt-1"
                />
                {batchErrors.defaultOwner && (
                  <p className="text-red-500 text-sm mt-1">{batchErrors.defaultOwner.message}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="file">檔案內容</Label>
                <Textarea
                  id="file"
                  {...batchRegister("file")}
                  placeholder="範例：&#10;BDD348 2709882.555 216522.990 1 0 KC0308 TEST 0&#10;BDD349 2709882.555 216522.990 0 0 KC0308 TEST97 1&#10;BDD350 2709882.555 216522.990 1 0 KC0308 TEST67 ?"
                  className="mt-1 font-mono text-sm"
                  rows={6}
                />
                {batchErrors.file && (
                  <p className="text-red-500 text-sm mt-1">{batchErrors.file.message}</p>
                )}
              </div>
              
              {/* Format explanation */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">檔案格式說明</h4>
                <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                  <div>• 每行 8 個參數，以空白分隔</div>
                  <div>• 格式：點名 公告Y 公告X 座標系統 階層 段代碼 備註 狀態</div>
                  <div>• 座標系統：0=97系統（直接使用公告座標）, 1=67系統（自動轉換為97座標）</div>
                  <div>• 階層：通常為 0（表示圖根點）</div>
                  <div>• 上傳者：由上方「預設上傳者」欄位自動填入</div>
                  <div>• 97Y、97X：系統根據座標系統自動計算</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center">
                    <FileText className="h-4 w-4 mr-1" />
                    支援空白或製表符分隔的文字格式
                  </div>
                </div>
                
                <Button type="submit" disabled={batchMutation.isPending}>
                  {batchMutation.isPending ? "上傳中..." : "批次上傳"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* CTL 地段批次上傳 */}
        <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 mt-8">
          <CardHeader className="bg-purple-600 text-white">
            <CardTitle className="text-lg font-medium flex items-center">
              <Layers className="mr-2 h-5 w-5" />
              CTL 地段批次上傳圖根點
            </CardTitle>
            <p className="text-purple-100 dark:text-purple-200 text-sm mt-1">
              拖曳或選擇多個 CTL 檔案，系統自動解析並寫入資料庫（段代碼取自檔名）
            </p>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* 設定列 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ctl-corsys">座標系統</Label>
                <Select value={ctlCorsys} onValueChange={setCtlCorsys}>
                  <SelectTrigger id="ctl-corsys" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">TWD97（直接使用）</SelectItem>
                    <SelectItem value="0">TWD67（自動轉換為 TWD97）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ctl-owner">上傳者</Label>
                <Input
                  id="ctl-owner"
                  value={ctlOwner}
                  onChange={e => setCtlOwner(e.target.value)}
                  placeholder="例如：system"
                  className="mt-1"
                />
              </div>
            </div>

            {/* 拖曳區 */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                  : "border-gray-300 dark:border-gray-600 hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-900/10"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".CTL,.ctl"
                multiple
                className="hidden"
                onChange={e => e.target.files && readCTLFiles(e.target.files)}
              />
              <Upload className="h-10 w-10 mx-auto mb-3 text-purple-400" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                拖曳 CTL 檔案至此，或點擊選擇檔案
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                支援同時選取多個 CTL 檔案，段代碼自動取自檔名（不含副檔名）
              </p>
            </div>

            {/* 已載入檔案列表 */}
            {ctlFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    已載入 {ctlFiles.length} 個地段，共 {ctlFiles.reduce((s, f) => s + f.pointCount, 0)} 筆點位
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 text-xs"
                    onClick={() => setCtlFiles([])}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    清除全部
                  </Button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>檔案名稱</TableHead>
                        <TableHead>段代碼</TableHead>
                        <TableHead className="text-right">點位數</TableHead>
                        <TableHead className="text-center">移除</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ctlFiles.map(f => (
                        <TableRow key={f.filename}>
                          <TableCell className="font-mono text-sm">{f.filename}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{f.catacode}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{f.pointCount}</TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                              onClick={() => setCtlFiles(prev => prev.filter(x => x.filename !== f.filename))}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* CTL 格式說明 */}
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-2">CTL 檔案格式說明</h4>
              <div className="text-xs text-purple-700 dark:text-purple-300 space-y-1 font-mono">
                <div>第 1 行：標頭（自動跳過，例如 KDK110000000）</div>
                <div>第 2 行起：[點名, 8字元] [N/Y值, 11字元] [E/X值, 10字元]</div>
                <div className="mt-1 text-purple-600 dark:text-purple-400">
                  BA01    2726503.618236890.394
                </div>
              </div>
              <div className="text-xs text-purple-600 dark:text-purple-400 mt-2 space-y-1">
                <div>• 段代碼 = CTL 檔名去副檔名（如 KD0517.CTL → KD0517）</div>
                <div>• 預設值：備註「地段批次匯入」、狀態「?」、階層 0</div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div />
              <Button
                onClick={() => { setCtlUploadResult(null); ctlMutation.mutate(); }}
                disabled={ctlFiles.length === 0 || ctlMutation.isPending || !ctlOwner}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {ctlMutation.isPending ? "寫入中..." : `寫入資料庫（${ctlFiles.length} 個地段）`}
              </Button>
            </div>

            {/* 上傳結果 */}
            {ctlUploadResult && (
              <div className="border border-green-200 dark:border-green-800 rounded-lg overflow-hidden">
                <div className="bg-green-50 dark:bg-green-900/20 px-4 py-2 flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800 dark:text-green-200">
                    {ctlUploadResult.message}
                  </span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>地段 (CTL 檔)</TableHead>
                      <TableHead>段代碼</TableHead>
                      <TableHead className="text-right">寫入筆數</TableHead>
                      <TableHead>狀態</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ctlUploadResult.results?.map((r: any) => (
                      <TableRow key={r.filename}>
                        <TableCell className="font-mono text-sm">{r.filename}</TableCell>
                        <TableCell><Badge variant="outline">{r.catacode}</Badge></TableCell>
                        <TableCell className="text-right font-semibold">{r.inserted}</TableCell>
                        <TableCell>
                          {r.errors?.length > 0 ? (
                            <span className="text-red-500 text-xs">{r.errors.join('; ')}</span>
                          ) : (
                            <span className="text-green-600 text-xs flex items-center">
                              <CheckCircle className="h-3 w-3 mr-1" />成功
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database Switch Dialog */}
        <Dialog open={isDbSwitchOpen} onOpenChange={setIsDbSwitchOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Database className="mr-2 h-5 w-5 text-blue-600" />
                切換資料庫連線
              </DialogTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                輸入新的資料庫連線資訊以切換資料庫
              </p>
            </DialogHeader>
            <form onSubmit={dbSwitchForm.handleSubmit(onDbSwitchSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="host">伺服器主機</Label>
                <Input
                  id="host"
                  {...dbSwitchForm.register("host")}
                  placeholder="例如：toufen.postgres.database.azure.com"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="port">連接埠</Label>
                <Input
                  id="port"
                  {...dbSwitchForm.register("port")}
                  placeholder="5432"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="database">資料庫名稱</Label>
                <Input
                  id="database"
                  {...dbSwitchForm.register("database")}
                  placeholder="例如：postgres"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="username">使用者名稱</Label>
                <Input
                  id="username"
                  {...dbSwitchForm.register("username")}
                  placeholder="例如：PostgreSQL_toufen"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="password">密碼</Label>
                <Input
                  id="password"
                  type="password"
                  {...dbSwitchForm.register("password")}
                  placeholder="輸入資料庫密碼"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="table">主要資料表</Label>
                <Input
                  id="table"
                  {...dbSwitchForm.register("table")}
                  placeholder="例如：public.n_kc_ctl"
                  className="mt-1"
                />
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDbSwitchOpen(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={dbSwitchMutation.isPending}>
                  {dbSwitchMutation.isPending ? "切換中..." : "切換資料庫"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}