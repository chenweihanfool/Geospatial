import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";
import {
  Database, ArrowLeft, RefreshCw, HardDrive, Download,
  Trash2, RotateCcw, Clock, Table2, ShieldCheck, CheckCircle, AlertCircle
} from "lucide-react";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function DatabaseManagement() {
  const { toast } = useToast();
  const [selectedTable, setSelectedTable] = useState<string>("");

  // 查詢資料表列表
  const { data: tablesData, isLoading: isLoadingTables, refetch: refetchTables } = useQuery({
    queryKey: ["/api/database/tables"],
    queryFn: ({ queryKey }) => apiRequest({ method: "GET", url: queryKey[0] }),
    refetchInterval: 60000,
  });

  // 查詢備份列表
  const { data: backupsData, isLoading: isLoadingBackups, refetch: refetchBackups } = useQuery({
    queryKey: ["/api/database/backups"],
    queryFn: ({ queryKey }) => apiRequest({ method: "GET", url: queryKey[0] }),
    refetchInterval: 30000,
  });

  // 建立備份
  const backupMutation = useMutation({
    mutationFn: async (tableName: string) =>
      apiRequest({ method: "POST", url: "/api/database/backup", data: { tableName } }),
    onSuccess: (result) => {
      toast({ title: "備份成功", description: result.message });
      refetchBackups();
    },
    onError: (error: any) => {
      toast({ title: "備份失敗", description: error.message || "無法建立備份", variant: "destructive" });
    },
  });

  // 刪除備份
  const deleteBackupMutation = useMutation({
    mutationFn: async (filename: string) =>
      apiRequest({ method: "DELETE", url: `/api/database/backups/${encodeURIComponent(filename)}` }),
    onSuccess: (_, filename) => {
      toast({ title: "已刪除備份", description: filename });
      refetchBackups();
    },
    onError: (error: any) => {
      toast({ title: "刪除失敗", description: error.message, variant: "destructive" });
    },
  });

  // 還原備份
  const restoreMutation = useMutation({
    mutationFn: async (filename: string) =>
      apiRequest({ method: "POST", url: "/api/database/restore", data: { filename } }),
    onSuccess: (result) => {
      toast({ title: "還原成功", description: result.message });
      refetchTables();
    },
    onError: (error: any) => {
      toast({ title: "還原失敗", description: error.message || "無法還原備份", variant: "destructive" });
    },
  });

  const handleDownload = (filename: string) => {
    window.open(`/api/database/backups/${encodeURIComponent(filename)}/download`, "_blank");
  };

  const tables: any[] = tablesData?.tables ?? [];
  const backups: any[] = backupsData?.backups ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Database className="text-blue-600 h-8 w-8" />
              <h1 className="text-2xl font-medium text-gray-700 dark:text-gray-200">資料庫管理</h1>
              <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                Database Management
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

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* 資料庫狀態 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                {tablesData ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">連線狀態</p>
                  <p className="text-lg font-semibold text-green-600">
                    {tablesData ? "已連接" : "連接中..."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Table2 className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">資料表數量</p>
                  <p className="text-lg font-semibold text-blue-600">{tables.length} 個</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <HardDrive className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">可用備份</p>
                  <p className="text-lg font-semibold text-purple-600">{backups.length} 個</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 資料庫版本 */}
        {tablesData?.version && (
          <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                  {tablesData.database} | {tablesData.version.split(',')[0]}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 資料表列表 */}
        <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
          <CardHeader className="bg-blue-600 text-white flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-medium flex items-center">
              <Table2 className="mr-2 h-5 w-5" />
              資料表列表
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:text-white hover:bg-blue-700"
              onClick={() => refetchTables()}
              disabled={isLoadingTables}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoadingTables ? "animate-spin" : ""}`} />
              重新整理
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingTables ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Schema</TableHead>
                      <TableHead>資料表名稱</TableHead>
                      <TableHead className="text-right">資料筆數</TableHead>
                      <TableHead className="text-right">欄位數</TableHead>
                      <TableHead className="text-center">備份操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tables.map((t) => (
                      <TableRow key={t.fullName}>
                        <TableCell>
                          <Badge variant="outline">{t.schemaName}</Badge>
                        </TableCell>
                        <TableCell className="font-mono font-medium">{t.tableName}</TableCell>
                        <TableCell className="text-right">
                          {t.rowCount === -1 ? (
                            <span className="text-gray-400 text-sm">無法讀取</span>
                          ) : (
                            <span className="font-semibold">{t.rowCount.toLocaleString()}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-gray-600 dark:text-gray-400">
                          {t.columnCount}
                        </TableCell>
                        <TableCell className="text-center">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                disabled={backupMutation.isPending}
                              >
                                <HardDrive className="h-3 w-3 mr-1" />
                                備份
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>確認備份</AlertDialogTitle>
                                <AlertDialogDescription>
                                  確定要備份資料表 <strong>{t.fullName}</strong> 嗎？<br />
                                  目前共 {t.rowCount.toLocaleString()} 筆資料，備份將儲存在伺服器端。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => backupMutation.mutate(t.fullName)}>
                                  確定備份
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
          </CardContent>
        </Card>

        {/* 備份管理 */}
        <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
          <CardHeader className="bg-green-600 text-white flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-medium flex items-center">
              <Clock className="mr-2 h-5 w-5" />
              備份歷程與還原
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:text-white hover:bg-green-700"
              onClick={() => refetchBackups()}
              disabled={isLoadingBackups}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoadingBackups ? "animate-spin" : ""}`} />
              重新整理
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingBackups ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
              </div>
            ) : backups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <HardDrive className="h-12 w-12 mb-3" />
                <p className="text-lg">目前沒有可用備份</p>
                <p className="text-sm mt-1">請先從上方資料表列表選擇資料表並建立備份</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>資料表</TableHead>
                      <TableHead>備份時間</TableHead>
                      <TableHead className="text-right">資料筆數</TableHead>
                      <TableHead className="text-right">檔案大小</TableHead>
                      <TableHead className="text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backups.map((b) => (
                      <TableRow key={b.filename}>
                        <TableCell>
                          <span className="font-mono text-sm font-medium">{b.tableName}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-400">
                            <Clock className="h-3 w-3" />
                            <span>{formatDate(b.createdAt)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {b.rowCount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-gray-600 dark:text-gray-400 text-sm">
                          {formatFileSize(b.fileSize)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-300 hover:bg-green-50"
                              onClick={() => handleDownload(b.filename)}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              下載
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-orange-600 border-orange-300 hover:bg-orange-50"
                                  disabled={restoreMutation.isPending}
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  還原
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-orange-600">警告：還原資料</AlertDialogTitle>
                                  <AlertDialogDescription className="space-y-2">
                                    <span className="block">
                                      確定要從備份 <strong>{b.filename}</strong> 還原嗎？
                                    </span>
                                    <span className="block text-orange-600 font-medium">
                                      此操作將清除目標資料表 <strong>{b.tableName}</strong> 的所有現有資料，
                                      並以備份中的 {b.rowCount.toLocaleString()} 筆資料取代。
                                    </span>
                                    <span className="block text-red-600">
                                      此操作無法復原，請確認已備份目前資料後再執行。
                                    </span>
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-orange-600 hover:bg-orange-700"
                                    onClick={() => restoreMutation.mutate(b.filename)}
                                  >
                                    確定還原
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={deleteBackupMutation.isPending}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>確認刪除備份</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    確定要刪除備份 <strong>{b.filename}</strong> 嗎？此操作無法復原。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-red-600 hover:bg-red-700"
                                    onClick={() => deleteBackupMutation.mutate(b.filename)}
                                  >
                                    刪除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
