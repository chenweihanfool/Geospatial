import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cadastralFileUploadSchema } from "@shared/schema";
import type { CadastralFileUpload } from "@shared/schema";
import { Upload, FileText, MapPin, Database, CheckCircle, ArrowLeft, Eye, Download, FolderOpen, X, ChevronsUpDown } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";
import { Label } from "@/components/ui/label";

interface ParsedParcel {
  lotNo: string;
  subNo: string;
  sectionCode?: string;
  area?: string;
  grade?: string;
  attributes?: string;
  centerY?: string;
  centerX?: string;
  zone?: string;
  pointCount?: number;
  boundaryPoints?: string;
}

export default function CadastralData() {
  const { toast } = useToast();
  const [parsedData, setParsedData] = useState<any>(null);
  const [selectedLots, setSelectedLots] = useState<Set<string>>(new Set());
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [fileContents, setFileContents] = useState<{
    bnpContent: string;
    coaContent: string;
    parContent: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lotInput, setLotInput] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [coordinateSystem, setCoordinateSystem] = useState<"TWD97" | "TWD67">("TWD97");
  const folderInputRef = useRef<HTMLInputElement>(null);

  // File upload form
  const form = useForm<CadastralFileUpload>({
    resolver: zodResolver(cadastralFileUploadSchema),
    defaultValues: {
      bnpContent: "",
      coaContent: "",
      parContent: "",
    },
  });

  // Handle file reading
  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    let bnpContent = "";
    let coaContent = "";
    let parContent = "";

    for (const file of fileArray) {
      const fileName = file.name.toUpperCase();
      const content = await file.text();

      if (fileName.endsWith('.BNP')) {
        bnpContent = content;
      } else if (fileName.endsWith('.COA')) {
        coaContent = content;
      } else if (fileName.endsWith('.PAR')) {
        parContent = content;
      }
    }

    // Update form values
    if (bnpContent) form.setValue('bnpContent', bnpContent);
    if (coaContent) form.setValue('coaContent', coaContent);
    if (parContent) form.setValue('parContent', parContent);

    // Show success message
    const filesFound = [
      bnpContent && 'BNP',
      coaContent && 'COA', 
      parContent && 'PAR'
    ].filter(Boolean);

    if (filesFound.length > 0) {
      toast({
        title: "檔案載入成功",
        description: `已載入 ${filesFound.join('、')} 檔案`,
      });
    } else {
      toast({
        title: "提醒",
        description: "未找到 BNP、COA 或 PAR 檔案",
        variant: "destructive",
      });
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    const files: File[] = [];

    // Handle folder or files
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          await processEntry(entry, files);
        }
      }
    }

    if (files.length > 0) {
      await handleFiles(files);
    }
  };

  // Process directory entry recursively
  const processEntry = async (entry: any, files: File[]): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve) => {
        entry.file((f: File) => resolve(f));
      });
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const entries = await new Promise<any[]>((resolve) => {
        reader.readEntries((e: any[]) => resolve(e));
      });
      for (const childEntry of entries) {
        await processEntry(childEntry, files);
      }
    }
  };

  // Handle folder input
  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFiles(files);
    }
  };

  // Fetch saved parcels
  const { data: parcelsData, isLoading: isLoadingParcels } = useQuery({
    queryKey: ["/api/cadastral/parcels"],
    queryFn: ({ queryKey }) => apiRequest({ method: "GET", url: queryKey[0] }),
    enabled: isViewDialogOpen,
  });

  // Parse files mutation
  const parseMutation = useMutation({
    mutationFn: async (data: CadastralFileUpload & { coordinateSystem: "TWD97" | "TWD67" }) => {
      return apiRequest({
        method: "POST",
        url: "/api/cadastral/parse",
        data: data,
      });
    },
    onSuccess: (result) => {
      setParsedData(result.data);
      toast({
        title: "成功",
        description: result.message || "檔案解析成功",
      });
    },
    onError: (error: any) => {
      toast({
        title: "錯誤",
        description: error.message || "檔案解析失敗",
        variant: "destructive",
      });
    },
  });

  // Save selected parcels mutation
  const saveMutation = useMutation({
    mutationFn: async (data: { selectedLots: any[], bnpContent: string, coaContent: string, parContent: string, coordinateSystem: "TWD97" | "TWD67" }) => {
      return apiRequest({
        method: "POST",
        url: "/api/cadastral/save",
        data: data,
      });
    },
    onSuccess: (result) => {
      toast({
        title: "成功",
        description: result.message || "宗地資料已成功儲存",
      });
      setSelectedLots(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/cadastral/parcels"] });
    },
    onError: (error: any) => {
      toast({
        title: "錯誤",
        description: error.message || "儲存宗地資料時發生錯誤",
        variant: "destructive",
      });
    },
  });

  // Generate and download SHP file mutation
  const downloadShpMutation = useMutation({
    mutationFn: async (data: { selectedLots: any[], bnpContent: string, coaContent: string, parContent: string, coordinateSystem: "TWD97" | "TWD67" }) => {
      const response = await fetch("/api/cadastral/generate-shp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "生成SHP檔案失敗");
      }

      return response.blob();
    },
    onSuccess: (blob) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      a.download = `cadastral_data_${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "成功",
        description: "SHP檔案已成功下載",
      });
    },
    onError: (error: any) => {
      toast({
        title: "錯誤",
        description: error.message || "下載SHP檔案時發生錯誤",
        variant: "destructive",
      });
    },
  });

  const handleParse = (data: CadastralFileUpload) => {
    // Store original file contents for server-side validation
    setFileContents({
      bnpContent: data.bnpContent,
      coaContent: data.coaContent,
      parContent: data.parContent,
    });
    parseMutation.mutate({ ...data, coordinateSystem });
  };

  const handleToggleSelection = (lotNo: string, subNo: string) => {
    const key = `${lotNo}-${subNo}`;
    const newSelection = new Set(selectedLots);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    setSelectedLots(newSelection);
  };

  // 添加手動輸入的地號
  const handleAddManualLot = () => {
    const trimmedInput = lotInput.trim();
    if (!trimmedInput) return;

    // 驗證格式：地號-子號
    const parts = trimmedInput.split('-');
    if (parts.length !== 2) {
      toast({
        title: "格式錯誤",
        description: "請輸入正確格式：地號-子號（例如：590-0）",
        variant: "destructive",
      });
      return;
    }

    const [lotNo, subNo] = parts;
    const key = `${lotNo}-${subNo}`;

    // 檢查地號是否在解析的檔案中
    const parcels: ParsedParcel[] = parsedData?.parcels || [];
    const exists = parcels.some(p => p.lotNo === lotNo && p.subNo === subNo);
    
    if (!exists) {
      toast({
        title: "地號不存在",
        description: `地號 ${key} 不在解析的檔案中，請確認後重新輸入`,
        variant: "destructive",
      });
      return;
    }

    // 添加到選擇清單
    const newSelection = new Set(selectedLots);
    newSelection.add(key);
    setSelectedLots(newSelection);
    setLotInput("");
    
    toast({
      title: "成功",
      description: `已添加地號 ${key}`,
    });
  };

  // 從下拉選單選擇地號
  const handleSelectFromDropdown = (lotNo: string, subNo: string) => {
    const key = `${lotNo}-${subNo}`;
    const newSelection = new Set(selectedLots);
    
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    
    setSelectedLots(newSelection);
  };

  // 移除已選地號
  const handleRemoveSelection = (key: string) => {
    const newSelection = new Set(selectedLots);
    newSelection.delete(key);
    setSelectedLots(newSelection);
  };

  const handleSave = () => {
    if (selectedLots.size === 0) {
      toast({
        title: "提醒",
        description: "請至少選擇一個宗地",
        variant: "destructive",
      });
      return;
    }

    if (!fileContents) {
      toast({
        title: "錯誤",
        description: "請先上傳並解析檔案",
        variant: "destructive",
      });
      return;
    }

    const selectedLotsArray = Array.from(selectedLots).map(key => {
      const [lotNo, subNo] = key.split('-');
      return { lotNo, subNo };
    });

    saveMutation.mutate({
      selectedLots: selectedLotsArray,
      bnpContent: fileContents.bnpContent,
      coaContent: fileContents.coaContent,
      parContent: fileContents.parContent,
      coordinateSystem,
    });
  };

  const handleDownloadShp = () => {
    if (selectedLots.size === 0) {
      toast({
        title: "提醒",
        description: "請至少選擇一個宗地",
        variant: "destructive",
      });
      return;
    }

    if (!fileContents) {
      toast({
        title: "錯誤",
        description: "請先上傳並解析檔案",
        variant: "destructive",
      });
      return;
    }

    const selectedLotsArray = Array.from(selectedLots).map(key => {
      const [lotNo, subNo] = key.split('-');
      return { lotNo, subNo };
    });

    downloadShpMutation.mutate({
      selectedLots: selectedLotsArray,
      bnpContent: fileContents.bnpContent,
      coaContent: fileContents.coaContent,
      parContent: fileContents.parContent,
      coordinateSystem,
    });
  };

  const parcels: ParsedParcel[] = parsedData?.parcels || [];
  const totalParcels = parcels.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="sm" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回首頁
              </Button>
            </Link>
            <h1 className="text-4xl font-bold text-gray-800 dark:text-white">地籍資料處理系統</h1>
          </div>
          <ThemeToggle />
        </div>

        {/* File Upload Section */}
        <Card className="mb-8 dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-white">
              <Upload className="h-5 w-5" />
              檔案上傳與解析
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              拖曳資料夾到下方區域，或選擇資料夾上傳 BNP、COA、PAR 檔案
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Drag and Drop Zone */}
            <div
              className={`mb-6 border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              data-testid="drop-zone"
            >
              <FolderOpen className="h-12 w-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                拖曳資料夾到此處
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                或點擊下方按鈕選擇資料夾
              </p>
              <input
                ref={folderInputRef}
                type="file"
                // @ts-ignore - webkitdirectory is not in types but is supported
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderSelect}
                className="hidden"
                data-testid="input-folder"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => folderInputRef.current?.click()}
                className="dark:border-gray-600 dark:text-white"
                data-testid="button-select-folder"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                選擇資料夾
              </Button>
            </div>

            {/* Coordinate System Selection */}
            <div className="mb-6 p-4 bg-blue-50 dark:bg-gray-700/50 rounded-lg border border-blue-200 dark:border-gray-600">
              <Label className="text-base font-semibold mb-3 block dark:text-white">
                座標系統選擇
              </Label>
              <RadioGroup 
                value={coordinateSystem} 
                onValueChange={(value: "TWD97" | "TWD67") => setCoordinateSystem(value)}
                className="flex gap-6"
                data-testid="radio-coordinate-system"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="TWD97" id="twd97" data-testid="radio-twd97" />
                  <Label htmlFor="twd97" className="font-normal cursor-pointer dark:text-white">
                    TWD97 (二度分帶-97系統)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="TWD67" id="twd67" data-testid="radio-twd67" />
                  <Label htmlFor="twd67" className="font-normal cursor-pointer dark:text-white">
                    TWD67 (67系統) - 自動轉換至 TWD97
                  </Label>
                </div>
              </RadioGroup>
              {coordinateSystem === "TWD67" && (
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                  ℹ️ TWD67 座標將自動轉換為 TWD97 用於幾何儲存，原始座標值會保留在 SHP 屬性欄位中
                </p>
              )}
            </div>

            <form onSubmit={form.handleSubmit(handleParse)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* BNP File */}
                <div className="space-y-2">
                  <Label htmlFor="bnp" className="dark:text-white">
                    BNP 檔案內容
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                      (宗地線段關係)
                    </span>
                  </Label>
                  <Textarea
                    id="bnp"
                    placeholder="格式：宗地編號 子號 分區 點數量 界址點編號序列&#10;範例：4 0 1 18 290 292 293 294"
                    {...form.register("bnpContent")}
                    className="h-40 font-mono text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    data-testid="textarea-bnp-content"
                  />
                </div>

                {/* COA File */}
                <div className="space-y-2">
                  <Label htmlFor="coa" className="dark:text-white">
                    COA 檔案內容
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                      (點座標)
                    </span>
                  </Label>
                  <Textarea
                    id="coa"
                    placeholder="格式：點編號 Y座標X座標&#10;範例：1 2717519.00400000220486.07900000"
                    {...form.register("coaContent")}
                    className="h-40 font-mono text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    data-testid="textarea-coa-content"
                  />
                </div>

                {/* PAR File */}
                <div className="space-y-2">
                  <Label htmlFor="par" className="dark:text-white">
                    PAR 檔案內容
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                      (宗地資料)
                    </span>
                  </Label>
                  <Textarea
                    id="par"
                    placeholder="格式：宗地編號 子號 段代號 面積 等級 其他屬性&#10;範例：1 0 381 162.52 1 0 162.52U 02718549.9220802.4 0"
                    {...form.register("parContent")}
                    className="h-40 font-mono text-sm dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    data-testid="textarea-par-content"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <Button 
                  type="submit" 
                  disabled={parseMutation.isPending}
                  className="dark:bg-blue-600 dark:hover:bg-blue-700"
                  data-testid="button-parse-files"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {parseMutation.isPending ? "解析中..." : "解析檔案"}
                </Button>

                <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      type="button"
                      className="dark:border-gray-600 dark:text-white"
                      data-testid="button-view-saved-data"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      查看已儲存資料
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto dark:bg-gray-800">
                    <DialogHeader>
                      <DialogTitle className="dark:text-white">已儲存的宗地資料</DialogTitle>
                    </DialogHeader>
                    {isLoadingParcels ? (
                      <div className="text-center py-8 dark:text-gray-400">載入中...</div>
                    ) : parcelsData?.data?.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow className="dark:border-gray-700">
                            <TableHead className="dark:text-gray-300">宗地地號</TableHead>
                            <TableHead className="dark:text-gray-300">子號</TableHead>
                            <TableHead className="dark:text-gray-300">段代碼</TableHead>
                            <TableHead className="dark:text-gray-300">面積</TableHead>
                            <TableHead className="dark:text-gray-300">等級</TableHead>
                            <TableHead className="dark:text-gray-300">分區</TableHead>
                            <TableHead className="dark:text-gray-300">界址點數</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parcelsData.data.map((parcel: any, index: number) => (
                            <TableRow key={index} className="dark:border-gray-700">
                              <TableCell className="dark:text-gray-300">{parcel.lot_no}</TableCell>
                              <TableCell className="dark:text-gray-300">{parcel.sub_no}</TableCell>
                              <TableCell className="dark:text-gray-300">{parcel.section_code || '-'}</TableCell>
                              <TableCell className="dark:text-gray-300">{parcel.area || '-'}</TableCell>
                              <TableCell className="dark:text-gray-300">{parcel.grade || '-'}</TableCell>
                              <TableCell className="dark:text-gray-300">{parcel.zone || '-'}</TableCell>
                              <TableCell className="dark:text-gray-300">{parcel.point_count || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">尚無已儲存的宗地資料</div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Parsed Data Section */}
        {parsedData && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center justify-between dark:text-white">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  選擇宗地
                </div>
                <Badge variant="secondary" className="dark:bg-gray-700 dark:text-white">
                  檔案中共 {totalParcels} 筆宗地
                </Badge>
              </CardTitle>
              <CardDescription className="dark:text-gray-400 mt-2">
                您可以手動輸入地號或從下拉選單選擇
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* 輸入和下拉選擇區 */}
                <div className="space-y-4">
                  <div className="flex gap-2">
                    {/* 手動輸入地號 */}
                    <div className="flex-1">
                      <Label htmlFor="lot-input" className="dark:text-white mb-2 block">
                        手動輸入地號-子號
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="lot-input"
                          placeholder="例如：590-0"
                          value={lotInput}
                          onChange={(e) => setLotInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddManualLot();
                            }
                          }}
                          className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                          data-testid="input-manual-lot"
                        />
                        <Button 
                          onClick={handleAddManualLot}
                          type="button"
                          className="dark:bg-blue-600 dark:hover:bg-blue-700"
                          data-testid="button-add-manual-lot"
                        >
                          添加
                        </Button>
                      </div>
                    </div>

                    {/* 下拉選單選擇 */}
                    <div className="flex-1">
                      <Label className="dark:text-white mb-2 block">
                        從下拉選單選擇
                      </Label>
                      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isPopoverOpen}
                            className="w-full justify-between dark:border-gray-600 dark:text-white dark:hover:bg-gray-700"
                            data-testid="button-dropdown-select"
                          >
                            選擇地號
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0 dark:bg-gray-800 dark:border-gray-700">
                          <Command className="dark:bg-gray-800">
                            <CommandInput 
                              placeholder="搜尋地號..." 
                              className="dark:text-white"
                            />
                            <CommandList>
                              <CommandEmpty className="dark:text-gray-400">未找到地號</CommandEmpty>
                              <CommandGroup className="dark:text-white">
                                {parcels.map((parcel, index) => {
                                  const key = `${parcel.lotNo}-${parcel.subNo}`;
                                  const isSelected = selectedLots.has(key);
                                  return (
                                    <CommandItem
                                      key={index}
                                      value={key}
                                      onSelect={() => {
                                        handleSelectFromDropdown(parcel.lotNo, parcel.subNo);
                                      }}
                                      className="dark:hover:bg-gray-700"
                                      data-testid={`command-item-${key}`}
                                    >
                                      <div className="flex items-center justify-between w-full">
                                        <span>
                                          {key} 
                                          {parcel.area && ` (${parcel.area})`}
                                        </span>
                                        {isSelected && <CheckCircle className="h-4 w-4 text-green-500" />}
                                      </div>
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* 已選擇的地號標籤 */}
                  {selectedLots.size > 0 && (
                    <div className="space-y-2">
                      <Label className="dark:text-white">
                        已選擇的宗地 ({selectedLots.size} 筆)
                      </Label>
                      <div className="flex flex-wrap gap-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border dark:border-gray-700">
                        {Array.from(selectedLots).map((key) => (
                          <Badge
                            key={key}
                            variant="secondary"
                            className="dark:bg-gray-700 dark:text-white flex items-center gap-1 px-3 py-1"
                            data-testid={`badge-selected-${key}`}
                          >
                            {key}
                            <button
                              onClick={() => handleRemoveSelection(key)}
                              className="ml-1 hover:text-red-500 dark:hover:text-red-400"
                              data-testid={`button-remove-${key}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 操作按鈕 */}
                <div className="flex items-center gap-4 pt-4 border-t dark:border-gray-700">
                  <Button 
                    onClick={handleSave}
                    disabled={selectedLots.size === 0 || saveMutation.isPending}
                    className="dark:bg-green-600 dark:hover:bg-green-700"
                    data-testid="button-save-selected"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    {saveMutation.isPending ? "儲存中..." : `儲存選中的宗地 (${selectedLots.size}筆)`}
                  </Button>
                  <Button 
                    onClick={handleDownloadShp}
                    disabled={selectedLots.size === 0 || downloadShpMutation.isPending}
                    variant="secondary"
                    className="dark:bg-blue-600 dark:hover:bg-blue-700 dark:text-white"
                    data-testid="button-download-shp"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {downloadShpMutation.isPending ? "生成中..." : `下載 SHP 檔案 (${selectedLots.size}筆)`}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                解析狀態
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {parsedData ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="text-2xl font-bold text-green-600 dark:text-green-400">已解析</span>
                  </>
                ) : (
                  <span className="text-2xl font-bold text-gray-400 dark:text-gray-500">未解析</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                宗地數量
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-parcel-count">
                {totalParcels}
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                已選擇
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400" data-testid="text-selected-count">
                {selectedLots.size}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
