# 補點座標輸入系統 (Coordinate Input System)

## Overview

This is a comprehensive full-stack TypeScript application for geospatial data management, designed to streamline and automate various cadastral and survey-related tasks. Its primary purpose is to manage coordinate data, survey points, and cadastral information with robust geographic transformations and spatial analysis capabilities.

The system's key capabilities include:
-   **座標輸入系統 (Coordinate Input System)**: Manages coordinate data, supporting geographic transformations between TWD97 and TWD67.
-   **圖根點管理系統 (Survey Point Management)**: Handles survey point data with extensive batch upload functionalities.
-   **地籍資料處理系統 (Cadastral Data Processing)**: Processes cadastral measurement files (BNP/COA/PAR) and generates SHP files for spatial representation.
-   **Spatial Range Query**: Provides functionality to query and export all point types (survey, coordinate, boundary) within a defined radius from a center point, with coordinate system awareness.

The project aims to provide a robust and user-friendly platform for professionals dealing with geospatial and cadastral data in Taiwan, ensuring data accuracy and efficient processing.

## User Preferences

Preferred communication style: Simple, everyday language.
User interest: Wants to create similar applications based on current project structure.

## System Architecture

### Frontend
-   **Framework**: React with TypeScript, built using Vite.
-   **UI/UX**: Radix UI components, styled with shadcn/ui and Tailwind CSS for a consistent and accessible design. Supports full dark/light theme.
-   **State Management**: TanStack Query for server state.
-   **Form Management**: React Hook Form with Zod for validation.
-   **Routing**: Wouter.

### Backend
-   **Runtime**: Node.js with Express.js.
-   **Database**: PostgreSQL with PostGIS extension for spatial data, utilizing Neon serverless driver.
-   **ORM**: Drizzle ORM for type-safe database interactions.
-   **Validation**: Zod for runtime type checking.
-   **Session Management**: Express sessions with PostgreSQL store.

### Key Design Decisions
-   **Monorepo Structure**: Facilitates end-to-end type safety through shared schemas.
-   **Type Safety**: Achieved across the stack using TypeScript and Zod.
-   **Spatial Data Handling**: Leverages PostGIS geometry columns (SRID 3826 for TWD97) for efficient spatial queries and transformations.
-   **Coordinate Transformation**: Automatic TWD67/TWD97 transformations are handled using official EPSG:15487 parameters, ensuring data accuracy across different reference systems.
-   **Dynamic Database Interaction**: The system can dynamically connect to and query different survey point tables (e.g., `n_kc_ctl`, `kd_ctl`, `kc_ct2`) with adaptive schema mapping.
-   **Data Precision**: All stored coordinates maintain a precision of exactly 3 decimal places.
-   **Robust File Parsing**: Supports various formats for cadastral files (BNP, COA, PAR) and handles complex scenarios like multi-line records and arc boundaries.

### Core Features
-   **Coordinate Input**: CRUD and batch upload for coordinate data with TWD67/TWD97 transformation.
-   **Survey Point Management**: Comprehensive CRUD, batch upload, and dynamic table selection for survey points.
-   **Cadastral Data Processing**: Parses BNP/COA/PAR files, stores parcel and boundary point data, and generates SHP files. Includes support for arc boundaries and robust file interpretation.
-   **Spatial Query**: Allows querying and exporting points within a specified radius, with automatic coordinate system detection and conversion for consistent results.
-   **Section Code Flexibility**: Supports multiple input formats for section codes (e.g., `KC0346`, `346`, `0346`) and handles comma-separated lists in the database.

## External Dependencies

-   `@neondatabase/serverless`: Serverless PostgreSQL database connections.
-   `drizzle-orm`: Type-safe ORM for database operations.
-   `@tanstack/react-query`: For client-side server state management.
-   `@radix-ui/*`: Accessible UI component primitives.
-   `zod`: Schema declaration and validation library.
-   `vite`: Frontend build tool and development server.
-   `tsx`: TypeScript execution for development scripts.
-   `esbuild`: Production JavaScript bundling.