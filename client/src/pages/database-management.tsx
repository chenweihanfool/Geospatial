import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiRequest } from "@/lib/queryClient";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";
import {
  Database, ArrowLeft, RefreshCw, Layers, Table2,
  ChevronRight, Clock, CheckCircle, AlertCircle, Sparkles,
} from "lucide-react";

interface TableInfo {
  tableName: string;
  schemaName: string;
  fullName: string;
  rowCount: number;
  columnCount: number;
  lastModified: string | null;
  lastModifiedColumn: string | null;
}

interface SchemaInfo {
  schemaName: string;
  tableCount: number;
  totalRows: number;
  lastModified: string | null;
  tables: TableInfo[];
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "剛剛";
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小時前`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return new Date(iso).toLocaleDateString("zh-TW");
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function lastModifiedTooltip(t: Pick<TableInfo, "lastModified" | "lastModifiedColumn">): string {
  if (t.lastModified) return `${formatAbsolute(t.lastModified)}（依 ${t.lastModifiedColumn} 欄位）`;
  if (t.lastModifiedColumn) return `${t.lastModifiedColumn} 欄位皆為空值，無法判斷`;
  return "此表沒有可判斷時間的欄位";
}

export default function DatabaseManagement() {
  const [openSchemas, setOpenSchemas] = useState<Record<string, boolean>>({});

  const { data: dbInfo } = useQuery({
    queryKey: ["/api/database/info"],
    queryFn: ({ queryKey }) => apiRequest({ method: "GET", url: queryKey[0] }),
  });

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["/api/database/schemas"],
    queryFn: ({ queryKey }) => apiRequest({ method: "GET", url: queryKey[0] }),
    refetchInterval: 60000,
  });

  const schemas: SchemaInfo[] = data?.schemas ?? [];
  const totalTables = schemas.reduce((s, sc) => s + sc.tableCount, 0);

  const toggleSchema = (schemaName: string) => {
    setOpenSchemas(prev => ({ ...prev, [schemaName]: !prev[schemaName] }));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Database className="text-blue-600 h-8 w-8" />
              <h1 className="text-2xl font-medium text-gray-700 dark:text-gray-200">資料庫管理</h1>
              <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                Database Overview
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

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* 連線狀態 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                {isError ? (
                  <AlertCircle className="h-5 w-5 text-red-500 flex-none" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-500 flex-none" />
                )}
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">連線狀態</p>
                  <p className={`text-lg font-semibold ${isError ? "text-red-600" : "text-green-600"}`}>
                    {isError ? "連線異常" : (data ? "已連接" : "連接中…")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">主機 / 資料庫</p>
              <p className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate" title={dbInfo?.host}>
                {dbInfo?.host || "—"}
              </p>
              <p className="text-sm font-mono text-gray-500 dark:text-gray-400">{dbInfo?.database || "—"}</p>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Layers className="h-5 w-5 text-purple-500 flex-none" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Schema / 資料表</p>
                  <p className="text-lg font-semibold text-purple-600">
                    {schemas.length} 個 schema・{totalTables} 個資料表
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Schema 樹狀圖 */}
        <Card className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
          <CardHeader className="bg-blue-600 text-white flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-medium flex items-center">
              <Layers className="mr-2 h-5 w-5" />
              Schema 結構
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:text-white hover:bg-blue-700"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              重新整理
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-12 text-red-400">
                <AlertCircle className="h-10 w-10 mb-3" />
                <p>無法讀取資料庫結構</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {schemas.map((schema) => {
                  const isOpen = !!openSchemas[schema.schemaName];
                  return (
                    <Collapsible key={schema.schemaName} open={isOpen} onOpenChange={() => toggleSchema(schema.schemaName)}>
                      <CollapsibleTrigger asChild>
                        <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left">
                          <div className="flex items-center gap-2 min-w-0">
                            <ChevronRight className={`h-4 w-4 flex-none text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                            <Badge variant="outline" className="font-mono">{schema.schemaName}</Badge>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {schema.tableCount} 個資料表・共 {schema.totalRows.toLocaleString()} 筆
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 flex-none">
                            <Clock className="h-3 w-3" />
                            {formatRelative(schema.lastModified)}
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 pb-3">
                          <div className="border rounded-lg overflow-hidden ml-6">
                            {schema.tables.map((t, idx) => (
                              <div
                                key={t.fullName}
                                className={`flex items-center justify-between px-3 py-2 text-sm ${
                                  idx !== schema.tables.length - 1 ? "border-b border-gray-100 dark:border-gray-700" : ""
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Table2 className="h-3.5 w-3.5 text-gray-400 flex-none" />
                                  <span className="font-mono truncate">{t.tableName}</span>
                                  {idx === 0 && t.lastModified && (
                                    <span className="flex items-center gap-0.5 text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium flex-none">
                                      <Sparkles className="h-2.5 w-2.5" />
                                      最新
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 flex-none text-gray-500 dark:text-gray-400">
                                  <span>{t.rowCount === -1 ? "無法讀取" : `${t.rowCount.toLocaleString()} 筆`}</span>
                                  <span className="w-28 text-right" title={lastModifiedTooltip(t)}>
                                    {formatRelative(t.lastModified)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
