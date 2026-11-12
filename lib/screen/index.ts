/**
 * @file lib/screen/index.ts
 * @description Unified Facade & Entry Point for ULTRON Screen Awareness & Visual Intelligence (Modules 01 - 12).
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence Architecture (Blueprint Section 4).
 *
 * Exported Modules:
 * - Module 01: Vision Control Engine (`VisionControlEngine`, `defaultVisionControl`)
 * - Module 02: Multi-Mode Desktop Screen Capture (`ScreenCaptureEngine`, `defaultScreenCaptureEngine`)
 * - Module 03: Visual Processing & Segmentation (`VisualProcessingEngine`, `defaultVisualProcessingEngine`)
 * - Module 04: Window & Process Detection (`WindowDetectionEngine`, `defaultWindowDetectionEngine`)
 * - Module 05: Visual Understanding & UI Recognition (`VisualUnderstandingEngine`, `defaultVisualUnderstandingEngine`)
 * - Module 06: OCR & Spatial Text Intelligence (`OCREngine`, `defaultOCREngine`)
 * - Module 07: Screen Context & Workflow Identification (`ScreenContextEngine`, `defaultScreenContextEngine`)
 * - Module 08: Grounded Visual Question Answering (`VisualQAEngine`, `defaultVisualQAEngine`)
 * - Module 09: Privacy, Security & Masking (`PrivacySecurityEngine`, `defaultPrivacySecurityEngine`)
 * - Module 10: Session Management & Cleanup (`ScreenSessionManager`, `defaultScreenSessionManager`)
 * - Module 11: Visual Context Delivery (`VisualContextDeliveryEngine`, `defaultVisualContextDeliveryEngine`)
 * - Module 12: Diagnostics & Health Telemetry (`ScreenDiagnosticsEngine`, `defaultScreenDiagnosticsEngine`)
 */

export * from "./types.ts";
export * from "./visionControl.ts";
export * from "./screenCaptureEngine.ts";
export * from "./visualProcessingEngine.ts";
export * from "./windowDetectionEngine.ts";
export * from "./visualUnderstandingEngine.ts";
export * from "./ocrEngine.ts";
export * from "./screenContextEngine.ts";
export * from "./visualQAEngine.ts";
export * from "./privacySecurityEngine.ts";
export * from "./sessionManager.ts";
export * from "./contextDeliveryEngine.ts";
export * from "./diagnosticsEngine.ts";
