/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);

// GPU-backed WebGL on Windows (needed for map rendering).
Config.setChromiumOpenGlRenderer("angle");
// 16 GB RAM: keep render concurrency low.
Config.setConcurrency(2);
Config.setCodec("h264");
Config.setPixelFormat("yuv420p");
// With JPEG frames ffmpeg 9 otherwise tags output as full-range yuvj420p.
Config.setColorSpace("bt709");
