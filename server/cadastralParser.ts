// Cadastral file parser for BNP, COA, PAR files
// BNP: 宗地編號 子號 行數 點數量 界址點編號序列
// COA: 點編號 N(Y)座標 E(X)座標 (連續數字，需手動分割)
// PAR: 宗地編號 子號 段代號 面積 等級 其他屬性 宗地中心座標

export interface BNPRecord {
  lotNo: string;
  subNo: string;
  lineCount: number;  // 行數：表示該地號會有幾行界址點記錄
  pointCount: number;
  boundaryPoints: string[]; // 界址點編號序列
}

export interface COARecord {
  pointNo: string;
  yCoord: string;
  xCoord: string;
}

export interface PARRecord {
  lotNo: string;
  subNo: string;
  sectionCode: string;
  area: string;
  grade: string;
  attributes: string;
  centerY: string;
  centerX: string;
}

export interface ParsedCadastralData {
  bnpRecords: BNPRecord[];
  coaRecords: COARecord[];
  parRecords: PARRecord[];
  parcels: Array<{
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
  }>;
}

/**
 * Parse BNP file content
 * Format: 宗地編號 子號 行數 點數量 界址點編號序列
 * Example: 590 0 2 10 1 2 3 4 5 6 7 8 9 10
 *          590 0 2 8 11 12 13 14 15 16 17 18
 *          678 1 1 6 5294+ 5279 5289 5288- 5278 5293  (弧形宗地，+表示凸弧，-表示凹弧)
 * 同一個地號+子號可能有多行記錄，需要合併
 * 界址點號後面可能有 + 或 - 符號表示弧形，需要移除
 */
export function parseBNPFile(content: string): BNPRecord[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  const recordMap = new Map<string, BNPRecord>();

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;

    const lotNo = parts[0];
    const subNo = parts[1];
    const lineCount = parseInt(parts[2], 10);
    const pointCount = parseInt(parts[3], 10);
    
    // 清理界址點號：移除 + 和 - 符號
    const boundaryPoints = parts.slice(4).map(point => point.replace(/[+-]/g, ''));

    const key = `${lotNo}-${subNo}`;
    
    if (recordMap.has(key)) {
      // 合併界址點到現有記錄
      const existing = recordMap.get(key)!;
      existing.boundaryPoints.push(...boundaryPoints);
      existing.pointCount += pointCount;
    } else {
      // 新增記錄
      recordMap.set(key, {
        lotNo,
        subNo,
        lineCount,
        pointCount,
        boundaryPoints
      });
    }
  }

  return Array.from(recordMap.values());
}

/**
 * Parse COA file content
 * 支援兩種格式：
 * 1. 空格分隔：點編號 Y座標 X座標
 *    Example: 5294 2718323.305 220705.926
 * 2. 連續數字：點編號 Y座標X座標 (連在一起)
 *    Example: 1 2717519.00400000220486.07900000
 */
export function parseCOAFile(content: string): COARecord[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  const records: COARecord[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;

    const pointNo = parts[0];
    let yCoord = '';
    let xCoord = '';

    // 格式1: 空格分隔 (點編號 Y座標 X座標)
    if (parts.length >= 3) {
      yCoord = parts[1];
      xCoord = parts[2];
    } 
    // 格式2: 連續數字 (點編號 Y座標X座標)
    else {
      const coords = parts[1];
      
      // 找到小數點位置來分割
      const dotIndices: number[] = [];
      for (let i = 0; i < coords.length; i++) {
        if (coords[i] === '.') {
          dotIndices.push(i);
        }
      }

      if (dotIndices.length >= 2) {
        // 有兩個小數點，第一個小數點後若干位是Y的小數部分
        // 假設Y座標小數點後有8位
        const firstDotIndex = dotIndices[0];
        const yDecimalLength = 8;
        const yEndIndex = firstDotIndex + yDecimalLength + 1; // +1 for the dot
        
        yCoord = coords.substring(0, yEndIndex);
        xCoord = coords.substring(yEndIndex);
      } else if (dotIndices.length === 1) {
        // 只有一個小數點，按中間分割
        const midPoint = Math.floor(coords.length / 2);
        yCoord = coords.substring(0, midPoint);
        xCoord = coords.substring(midPoint);
      } else {
        // 沒有小數點，按中間分割
        const midPoint = Math.floor(coords.length / 2);
        yCoord = coords.substring(0, midPoint);
        xCoord = coords.substring(midPoint);
      }
    }

    records.push({
      pointNo,
      yCoord,
      xCoord
    });
  }

  return records;
}

/**
 * Parse PAR file content
 * Format: 宗地編號 子號 段代號 面積 等級 其他屬性 宗地中心座標
 * Example: 1 0 381 162.52 1 0 162.52U 02718549.9220802.4 0
 * 宗地中心座標格式類似COA，需要分割
 */
export function parsePARFile(content: string): PARRecord[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  const records: PARRecord[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 8) continue;

    const lotNo = parts[0];
    const subNo = parts[1];
    const sectionCode = parts[2];
    const area = parts[3];
    const grade = parts[4];
    const otherAttr1 = parts[5];
    const otherAttr2 = parts[6];
    const centerCoords = parts[7];
    
    // 合併其他屬性
    const attributes = `${otherAttr1} ${otherAttr2}`;

    // 解析中心座標（格式類似COA）
    // 範例：02718549.9220802.4
    // 可能格式：Y座標+X座標，兩個小數點
    const dotIndices: number[] = [];
    for (let i = 0; i < centerCoords.length; i++) {
      if (centerCoords[i] === '.') {
        dotIndices.push(i);
      }
    }

    let centerY = '';
    let centerX = '';

    if (dotIndices.length >= 2) {
      // 第一個小數點到第二個小數點之間是Y的小數部分和X的整數部分
      // 需要找到Y結束的位置
      const firstDotIndex = dotIndices[0];
      const secondDotIndex = dotIndices[1];
      
      // Y座標通常有1位小數，所以Y結束在第一個小數點後1位
      const yCoorEndIndex = firstDotIndex + 2; // dot + 1 decimal
      
      centerY = centerCoords.substring(0, yCoorEndIndex);
      centerX = centerCoords.substring(yCoorEndIndex);
    } else {
      // 備用方案
      const midPoint = Math.floor(centerCoords.length / 2);
      centerY = centerCoords.substring(0, midPoint);
      centerX = centerCoords.substring(midPoint);
    }

    records.push({
      lotNo,
      subNo,
      sectionCode,
      area,
      grade,
      attributes,
      centerY,
      centerX
    });
  }

  return records;
}

/**
 * Parse all cadastral files and merge data
 */
export function parseCadastralFiles(
  bnpContent: string,
  coaContent: string,
  parContent: string
): ParsedCadastralData {
  const bnpRecords = parseBNPFile(bnpContent);
  const coaRecords = parseCOAFile(coaContent);
  const parRecords = parsePARFile(parContent);

  // Merge BNP and PAR records by lotNo and subNo
  const parcels = bnpRecords.map(bnp => {
    const par = parRecords.find(
      p => p.lotNo === bnp.lotNo && p.subNo === bnp.subNo
    );

    return {
      lotNo: bnp.lotNo,
      subNo: bnp.subNo,
      sectionCode: par?.sectionCode,
      area: par?.area,
      grade: par?.grade,
      attributes: par?.attributes,
      centerY: par?.centerY,
      centerX: par?.centerX,
      zone: bnp.lineCount.toString(), // 使用行數（目前儲存在 zone 欄位中）
      pointCount: bnp.pointCount,
      boundaryPoints: bnp.boundaryPoints.join(',')
    };
  });

  return {
    bnpRecords,
    coaRecords,
    parRecords,
    parcels
  };
}
