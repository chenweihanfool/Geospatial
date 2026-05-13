// SHP file generator using shp-write
// @ts-ignore - shp-write doesn't have type definitions
import * as shpwrite from 'shp-write';
import type { ParsedCadastralData, COARecord } from './cadastralParser';
import { transformTWD67toTWD97 } from './coordinateTransform';

interface ShpFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
  properties: Record<string, any>;
}

/**
 * Generate SHP file data from cadastral parcels and boundary points
 * Returns a zip buffer containing .shp, .shx, .dbf, and .prj files
 * 
 * @param selectedLots - Selected parcel lots
 * @param parsedData - Parsed cadastral data
 * @param coordinateSystem - Coordinate system (TWD97 or TWD67)
 */
export async function generateShpFromCadastralData(
  selectedLots: Array<{ lotNo: string; subNo: string }>,
  parsedData: ParsedCadastralData,
  coordinateSystem: "TWD97" | "TWD67" = "TWD97"
): Promise<Buffer> {
  const { parcels, coaRecords } = parsedData;

  // Filter selected parcels
  const selectedParcels = parcels.filter(p => 
    selectedLots.some(lot => 
      lot.lotNo === p.lotNo && lot.subNo === p.subNo
    )
  );

  // Create GeoJSON features for parcels (polygons)
  const parcelFeatures: ShpFeature[] = selectedParcels.map(parcel => {
    const boundaryPointNos = parcel.boundaryPoints 
      ? parcel.boundaryPoints.split(',').map(n => n.trim()) 
      : [];
    
    const coordinates: number[][] = [];
    const originalCoordinates: { x67: number; y67: number }[] = [];
    
    for (const pointNo of boundaryPointNos) {
      const point = coaRecords.find(c => c.pointNo === pointNo);
      if (point) {
        let x = parseFloat(point.xCoord);
        let y = parseFloat(point.yCoord);
        
        // Store original TWD67 coordinates if needed
        if (coordinateSystem === "TWD67") {
          originalCoordinates.push({ x67: x, y67: y });
          
          // Transform to TWD97 for geometry
          const transformed = transformTWD67toTWD97(y, x);
          x = transformed.x97;
          y = transformed.y97;
        }
        
        coordinates.push([x, y]);
      }
    }

    // Close the polygon by adding the first point at the end
    if (coordinates.length > 0) {
      coordinates.push(coordinates[0]);
    }

    // Build properties object
    const properties: Record<string, any> = {
      LOT_NO: parcel.lotNo,
      SUB_NO: parcel.subNo,
      SECTION: parcel.sectionCode || '',
      AREA: parcel.area ? parseFloat(parcel.area) : 0,
      GRADE: parcel.grade || '',
      ZONE: parcel.zone || '',
      PT_COUNT: parcel.pointCount || 0,
      ATTRIBUTES: parcel.attributes || '',
      COORD_SYS: coordinateSystem,
    };

    // If TWD67, add original coordinates to attributes
    if (coordinateSystem === "TWD67" && originalCoordinates.length > 0) {
      // Store center point in TWD67
      const centerIdx = Math.floor(originalCoordinates.length / 2);
      properties.TWD67_X = originalCoordinates[centerIdx].x67.toFixed(3);
      properties.TWD67_Y = originalCoordinates[centerIdx].y67.toFixed(3);
    }

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [coordinates]
      },
      properties
    };
  });

  // Collect all boundary point numbers from selected parcels
  const allBoundaryPointNos = new Set<string>();
  selectedParcels.forEach(p => {
    if (p.boundaryPoints) {
      p.boundaryPoints.split(',').forEach(no => allBoundaryPointNos.add(no.trim()));
    }
  });

  // Create GeoJSON features for boundary points
  const pointFeatures: ShpFeature[] = coaRecords
    .filter(coa => allBoundaryPointNos.has(coa.pointNo))
    .map(point => {
      let x = parseFloat(point.xCoord);
      let y = parseFloat(point.yCoord);
      const originalX = x;
      const originalY = y;
      
      // Transform to TWD97 if coordinate system is TWD67
      if (coordinateSystem === "TWD67") {
        const transformed = transformTWD67toTWD97(y, x);
        x = transformed.x97;
        y = transformed.y97;
      }
      
      const properties: Record<string, any> = {
        POINT_NO: point.pointNo,
        X_COORD: x,
        Y_COORD: y,
        COORD_SYS: coordinateSystem
      };
      
      // Add original TWD67 coordinates to attributes
      if (coordinateSystem === "TWD67") {
        properties.TWD67_X = originalX.toFixed(3);
        properties.TWD67_Y = originalY.toFixed(3);
      }
      
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [x, y]
        },
        properties
      };
    });

  // Generate SHP files using shp-write
  // Note: shp-write returns a zip buffer containing all shapefile components
  const options = {
    folder: 'cadastral_data',
    types: {
      polygon: 'parcels',
      point: 'boundary_points'
    }
  };

  // Create GeoJSON collections
  const parcelCollection = {
    type: 'FeatureCollection',
    features: parcelFeatures
  };

  const pointCollection = {
    type: 'FeatureCollection',
    features: pointFeatures
  };

  // Validate features before generating SHP
  if (!parcelFeatures || parcelFeatures.length === 0) {
    throw new Error('沒有可用的宗地資料生成 SHP 檔案');
  }

  // Use shp-write to generate shapefile
  // The library will return a zip buffer (ArrayBuffer)
  const shpData = await new Promise<Buffer>((resolve, reject) => {
    try {
      // shp-write.zip expects a GeoJSON FeatureCollection (single geometry type)
      // We'll generate the parcel shapefile (polygons)
      const shpOptions = {
        folder: 'cadastral_parcels',
        filename: 'parcels',
        types: {
          polygon: 'parcels'
        }
      };
      
      // shp-write.zip creates a zip file with all shapefile components
      const result = shpwrite.zip(parcelCollection, shpOptions);
      
      // shp-write returns ArrayBuffer, convert to Buffer
      if (result instanceof ArrayBuffer) {
        resolve(Buffer.from(result));
      } else if (Buffer.isBuffer(result)) {
        resolve(result);
      } else if (result instanceof Uint8Array) {
        resolve(Buffer.from(result));
      } else {
        // Handle other formats
        resolve(Buffer.from(result as any));
      }
    } catch (error) {
      console.error('Error in shp-write.zip:', error);
      reject(error);
    }
  });

  return shpData;
}

/**
 * Simple function to generate SHP for testing
 */
export function testShpGeneration() {
  const testParcel = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [121.5, 25.0],
        [121.6, 25.0],
        [121.6, 25.1],
        [121.5, 25.1],
        [121.5, 25.0]
      ]]
    },
    properties: {
      LOT_NO: 'TEST',
      AREA: 1000
    }
  };

  return shpwrite.zip({
    test: {
      type: 'FeatureCollection',
      features: [testParcel]
    } as any
  });
}
